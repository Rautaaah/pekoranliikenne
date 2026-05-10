using Microsoft.Extensions.Hosting;

// IMPORTANT: do NOT put this in Roblox.Website.Services — that namespace
// shadows the unqualified `Services.Cache` / `Services.AudioService`
// references throughout the website's controllers (which actually mean
// Roblox.Services.*) and breaks the build everywhere. Live in a
// dedicated BackgroundJobs namespace instead.
namespace Roblox.Website.BackgroundJobs;

/// <summary>
/// Background "janitor" that keeps the host healthy on its own:
/// 
///   - Trims runaway log files (website-start.log was 1.4 GB before this).
///   - Garbage-collects old thumbnail files past a max age, with a hard
///     cap on total directory size (LRU-by-LastWriteTime trim).
///   - Sweeps tmp_* scratch files in the workspace root older than 24 h.
///   - Forces a compacting GC once per hour to give the LOH a chance to
///     shrink instead of growing forever during a long-running process.
/// 
/// Tunable knobs are read from appsettings.json under the "Janitor"
/// section; sensible defaults apply when keys are missing so deployments
/// don't have to be touched. Each pass is independently try/catch-wrapped
/// so a single failure (e.g. file locked by another process) cannot take
/// down the loop or the website.
/// </summary>
public sealed class JanitorService : BackgroundService
{
    private static readonly TimeSpan SweepInterval = TimeSpan.FromMinutes(30);

    // -------- knobs (defaulted; can be overridden in appsettings.json:Janitor) --------
    private readonly int _thumbnailMaxAgeDays;
    private readonly long _thumbnailMaxTotalBytes;
    private readonly long _logTruncateThresholdBytes;
    private readonly long _logKeepTailBytes;
    private readonly int _tmpMaxAgeHours;
    private readonly bool _enableGcCollect;

    private readonly string? _thumbnailsDir;
    private readonly string? _workspaceRoot;

    public JanitorService(IConfiguration configuration)
    {
        var j = configuration.GetSection("Janitor");
        _thumbnailMaxAgeDays       = int.TryParse(j["ThumbnailMaxAgeDays"], out var d) ? d : 30;
        _thumbnailMaxTotalBytes    = long.TryParse(j["ThumbnailMaxTotalBytes"], out var b) ? b : 5L * 1024 * 1024 * 1024; // 5 GB
        _logTruncateThresholdBytes = long.TryParse(j["LogTruncateThresholdBytes"], out var lt) ? lt : 500L * 1024 * 1024;  // 500 MB
        _logKeepTailBytes          = long.TryParse(j["LogKeepTailBytes"], out var lk) ? lk : 50L * 1024 * 1024;            // 50 MB
        _tmpMaxAgeHours            = int.TryParse(j["TmpMaxAgeHours"], out var th) ? th : 24;
        _enableGcCollect           = !bool.TryParse(j["EnableGcCollect"], out var gc) || gc;

        _thumbnailsDir = Roblox.Configuration.ThumbnailsDirectory;
        _workspaceRoot = LocateWorkspaceRoot();
    }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        // First sweep is delayed so we don't pile work onto the cold-start path.
        await Task.Delay(TimeSpan.FromMinutes(2), ct);
        while (!ct.IsCancellationRequested)
        {
            await SweepOnce(ct);
            try { await Task.Delay(SweepInterval, ct); }
            catch (OperationCanceledException) { return; }
        }
    }

    private async Task SweepOnce(CancellationToken ct)
    {
        var sw = System.Diagnostics.Stopwatch.StartNew();
        long freed = 0;

        freed += SafeRun("thumbnail-gc", () => SweepThumbnails(ct));
        freed += SafeRun("log-truncate", () => TruncateGiantLogs());
        freed += SafeRun("tmp-sweep",    () => SweepTmpFiles());

        if (_enableGcCollect)
        {
            try
            {
                GC.Collect(2, GCCollectionMode.Aggressive, blocking: true, compacting: true);
                GC.WaitForPendingFinalizers();
                GC.Collect();
            }
            catch { /* nothing actionable if GC throws */ }
        }

        sw.Stop();
        if (freed > 0)
        {
            Console.WriteLine($"[janitor] sweep done in {sw.ElapsedMilliseconds} ms; freed ~{freed / (1024L * 1024)} MB");
        }
        await Task.CompletedTask;
    }

    private static long SafeRun(string label, Func<long> body)
    {
        try
        {
            return body();
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[janitor] {label} failed: {ex.Message}");
            return 0;
        }
    }

    // ---- THUMBNAILS --------------------------------------------------------
    // Two-phase: (1) drop anything older than _thumbnailMaxAgeDays;
    // (2) if total size still > _thumbnailMaxTotalBytes, drop oldest until
    // we're back under the cap. This stops the directory from ever growing
    // unbounded the way it did when no janitor ran (37 GB+ on neglected hosts).
    private long SweepThumbnails(CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(_thumbnailsDir) || !Directory.Exists(_thumbnailsDir))
            return 0;

        var cutoff = DateTime.UtcNow.AddDays(-_thumbnailMaxAgeDays);
        long freed = 0;
        int deleted = 0;

        // Phase 1: age-based delete. EnumerateFiles is streaming so this
        // doesn't allocate a giant array on a 100k-file directory.
        foreach (var path in Directory.EnumerateFiles(_thumbnailsDir, "*", SearchOption.AllDirectories))
        {
            if (ct.IsCancellationRequested) return freed;
            try
            {
                var fi = new FileInfo(path);
                if (fi.LastWriteTimeUtc < cutoff)
                {
                    var size = fi.Length;
                    fi.Delete();
                    freed += size;
                    deleted++;
                }
            }
            catch { /* file in use / already gone — skip */ }
        }

        // Phase 2: size cap. Only enumerate again if the cheap phase 1 didn't
        // already meaningfully reduce things; otherwise we'd pay the disk
        // walk twice on every sweep.
        var totalAfterPhase1 = TryGetDirectorySize(_thumbnailsDir);
        if (totalAfterPhase1 > _thumbnailMaxTotalBytes)
        {
            var overflow = totalAfterPhase1 - _thumbnailMaxTotalBytes;
            var toDelete = Directory.EnumerateFiles(_thumbnailsDir, "*", SearchOption.AllDirectories)
                .Select(p => new FileInfo(p))
                .OrderBy(fi => fi.LastWriteTimeUtc);

            foreach (var fi in toDelete)
            {
                if (overflow <= 0 || ct.IsCancellationRequested) break;
                try
                {
                    var size = fi.Length;
                    fi.Delete();
                    freed += size;
                    overflow -= size;
                    deleted++;
                }
                catch { }
            }
        }

        if (deleted > 0)
            Console.WriteLine($"[janitor] thumbnail-gc: deleted {deleted} files, freed {freed / (1024L * 1024)} MB");
        return freed;
    }

    private static long TryGetDirectorySize(string path)
    {
        try
        {
            return Directory.EnumerateFiles(path, "*", SearchOption.AllDirectories)
                .Sum(p => { try { return new FileInfo(p).Length; } catch { return 0L; } });
        }
        catch { return 0; }
    }

    // ---- LOG TRUNCATE ------------------------------------------------------
    // Don't delete logs (we want history) — keep the tail so recent activity
    // survives. We can't use File.Move on a file an active process holds
    // open, so we open with FileShare.ReadWrite|Delete and rewrite in place.
    private long TruncateGiantLogs()
    {
        if (string.IsNullOrWhiteSpace(_workspaceRoot) || !Directory.Exists(_workspaceRoot))
            return 0;

        long freed = 0;
        foreach (var path in Directory.EnumerateFiles(_workspaceRoot, "*.log", SearchOption.TopDirectoryOnly))
        {
            try
            {
                var fi = new FileInfo(path);
                if (fi.Length < _logTruncateThresholdBytes) continue;

                var keep = Math.Min(_logKeepTailBytes, fi.Length);
                byte[] buf;
                using (var src = new FileStream(path, FileMode.Open, FileAccess.Read,
                    FileShare.ReadWrite | FileShare.Delete))
                {
                    src.Seek(-keep, SeekOrigin.End);
                    buf = new byte[keep];
                    int read = 0;
                    while (read < keep)
                    {
                        var n = src.Read(buf, read, (int)(keep - read));
                        if (n <= 0) break;
                        read += n;
                    }
                }

                // Write a sibling and atomically replace. If the writer process
                // is still appending we may lose a few KB at the swap boundary;
                // that's an acceptable trade for not crashing the loop.
                var tmpPath = path + ".trim";
                File.WriteAllBytes(tmpPath, buf);
                long oldSize = fi.Length;
                try { File.Replace(tmpPath, path, null); }
                catch
                {
                    // Replace fails on Windows when target is open with
                    // FILE_SHARE_DELETE-incompatible flags; fall back to copy.
                    File.Copy(tmpPath, path, overwrite: true);
                    File.Delete(tmpPath);
                }
                freed += oldSize - keep;
                Console.WriteLine($"[janitor] log-truncate: {Path.GetFileName(path)} {oldSize / (1024L * 1024)} MB -> {keep / (1024L * 1024)} MB");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[janitor] log-truncate skipped {Path.GetFileName(path)}: {ex.Message}");
            }
        }
        return freed;
    }

    // ---- TMP SWEEP ---------------------------------------------------------
    private long SweepTmpFiles()
    {
        if (string.IsNullOrWhiteSpace(_workspaceRoot) || !Directory.Exists(_workspaceRoot))
            return 0;

        var cutoff = DateTime.UtcNow.AddHours(-_tmpMaxAgeHours);
        long freed = 0;
        int deleted = 0;

        foreach (var path in Directory.EnumerateFiles(_workspaceRoot, "tmp_*", SearchOption.TopDirectoryOnly))
        {
            try
            {
                var fi = new FileInfo(path);
                if (fi.LastWriteTimeUtc >= cutoff) continue;
                var size = fi.Length;
                fi.Delete();
                freed += size;
                deleted++;
            }
            catch { }
        }

        if (deleted > 0)
            Console.WriteLine($"[janitor] tmp-sweep: deleted {deleted} files, freed {freed / 1024} KB");
        return freed;
    }

    // ---- HELPERS -----------------------------------------------------------
    // Walk up from the website's cwd until we hit something that looks like
    // the project root (has start.bat / kill.bat). Keeps us decoupled from
    // any one operator's exact directory layout.
    private static string? LocateWorkspaceRoot()
    {
        try
        {
            var dir = new DirectoryInfo(AppContext.BaseDirectory);
            for (int i = 0; i < 10 && dir != null; i++)
            {
                if (File.Exists(Path.Combine(dir.FullName, "start.bat"))
                    || File.Exists(Path.Combine(dir.FullName, "kill.bat")))
                    return dir.FullName;
                dir = dir.Parent;
            }
        }
        catch { }
        return null;
    }
}
