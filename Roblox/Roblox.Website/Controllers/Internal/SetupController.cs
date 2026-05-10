using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Mvc;
using MVC = Microsoft.AspNetCore.Mvc;

namespace Roblox.Website.Controllers.Internal;

/// <summary>
/// Serves bundled clients + the Rust bootstrapper.
///
/// On disk we expect a layout like:
///   &lt;repo&gt;/clients/2020/RobloxPlayerBeta.exe + content/...
///   &lt;repo&gt;/clients/2019/RobloxPlayerBeta.exe + content/...
/// (any folder under `clients/` containing a `RobloxPlayerBeta.exe` is exposed.)
///
/// Endpoints:
///   GET /setup/&lt;client&gt;/version.txt                       → SHA1 of the player exe metadata
///   GET /setup/&lt;client&gt;/&lt;version&gt;-client.zip               → cached zip of clients/&lt;client&gt;/
///   GET /setup/studio/&lt;client&gt;/version.txt                  → SHA1 of the studio exe metadata
///   GET /setup/studio/&lt;client&gt;/&lt;version&gt;-studio.zip         → cached zip of studio/&lt;client&gt;/
///   GET /setup/launcher.exe                                  → ZekoroPlayerLauncher.exe (URL-handler exe; self-update)
///   GET /download                                            → ZekoroInstaller.exe (public download button)
///   GET /setup/installer.exe                                 → ZekoroInstaller.exe (alias of /download)
///
/// Zips are cached in `StorageDirectory/setup-cache/&lt;client&gt;/` and only rebuilt
/// when the underlying source files change.
/// </summary>
[MVC.ApiController]
[MVC.Route("/")]
public class SetupController : ControllerBase
{
    private static readonly Regex SafeClientName = new("^[A-Za-z0-9_.-]+$", RegexOptions.Compiled);

    private static readonly object CacheLock = new();
    private static readonly Dictionary<string, (string version, DateTime stamp)> VersionCache = new();

    [HttpGetBypass("setup/{client}/version.txt")]
    public IActionResult GetVersion(string client)
    {
        if (!SafeClientName.IsMatch(client))
            return BadRequest("invalid client name");

        var clientDir = ResolveClientDirectory("clients", client, "RobloxPlayerBeta.exe");
        if (clientDir == null)
            return NotFound($"clients/{client} was not found on this server");

        var version = ComputeVersion($"player:{client}", clientDir, "RobloxPlayerBeta.exe");
        return Content(version, "text/plain", Encoding.UTF8);
    }

    [HttpGetBypass("setup/{client}/{version}-client.zip")]
    public IActionResult GetClientBundle(string client, string version)
    {
        if (!SafeClientName.IsMatch(client) || !SafeClientName.IsMatch(version))
            return BadRequest("invalid client or version");

        var clientDir = ResolveClientDirectory("clients", client, "RobloxPlayerBeta.exe");
        if (clientDir == null)
            return NotFound($"clients/{client} was not found on this server");

        // Always serve the bundle for the *current* version regardless of what
        // was requested — the bootstrapper re-checks `version.txt` first.
        var liveVersion = ComputeVersion($"player:{client}", clientDir, "RobloxPlayerBeta.exe");
        var zipPath = EnsureClientZip($"player-{client}", clientDir, liveVersion, "client");
        return PhysicalFile(zipPath, "application/zip", $"{liveVersion}-client.zip");
    }

    [HttpGetBypass("setup/studio/{client}/version.txt")]
    public IActionResult GetStudioVersion(string client)
    {
        if (!SafeClientName.IsMatch(client))
            return BadRequest("invalid client name");

        var dir = ResolveClientDirectory("studio", client, "RobloxStudioBeta.exe");
        if (dir == null)
            return NotFound($"studio/{client} was not found on this server");

        var version = ComputeVersion($"studio:{client}", dir, "RobloxStudioBeta.exe");
        return Content(version, "text/plain", Encoding.UTF8);
    }

    [HttpGetBypass("setup/studio/{client}/{version}-studio.zip")]
    public IActionResult GetStudioBundle(string client, string version)
    {
        if (!SafeClientName.IsMatch(client) || !SafeClientName.IsMatch(version))
            return BadRequest("invalid client or version");

        var dir = ResolveClientDirectory("studio", client, "RobloxStudioBeta.exe");
        if (dir == null)
            return NotFound($"studio/{client} was not found on this server");

        var liveVersion = ComputeVersion($"studio:{client}", dir, "RobloxStudioBeta.exe");
        var zipPath = EnsureClientZip($"studio-{client}", dir, liveVersion, "studio");
        return PhysicalFile(zipPath, "application/zip", $"{liveVersion}-studio.zip");
    }

    [HttpGetBypass("setup/launcher.exe")]
    [HttpGetBypass("clients/launcher.exe")]
    public IActionResult GetLauncher()
    {
        var path = ResolveLauncherExe();
        if (path == null)
            return NotFound("ZekoroPlayerLauncher.exe has not been built yet");

        // No-cache for the same reason as the public installer download:
        // ZekoroInstaller.exe pulls this URL on every run to refresh the
        // user's URL-handler bootstrapper.exe. If a stale copy gets cached
        // anywhere in the chain, users get stuck on an old launcher even
        // after we ship a new one.
        Response.Headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0";
        Response.Headers["Pragma"] = "no-cache";
        Response.Headers["Expires"] = "0";
        var lastWrite = System.IO.File.GetLastWriteTimeUtc(path);
        Response.Headers["Last-Modified"] = lastWrite.ToString("R");

        return PhysicalFile(path, "application/octet-stream", "bootstrapper.exe");
    }

    [HttpGetBypass("setup/studio-launcher.exe")]
    public IActionResult GetStudioLauncher()
    {
        var path = ResolveLauncherExe();
        if (path == null)
            return NotFound("ZekoroPlayerLauncher.exe has not been built yet");

        Response.Headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0";
        Response.Headers["Pragma"] = "no-cache";
        Response.Headers["Expires"] = "0";
        var lastWrite = System.IO.File.GetLastWriteTimeUtc(path);
        Response.Headers["Last-Modified"] = lastWrite.ToString("R");

        return PhysicalFile(path, "application/octet-stream", "ZekoroStudio.exe");
    }

    /// <summary>
    /// Public download endpoint for the standalone setup binary
    /// (`ZekoroInstaller.exe`). This is what the website's "Download
    /// Zekoro" button links to (e.g. https://zekoro.org/download).
    ///
    /// The installer is the user-facing exe — it provisions both Player
    /// and Studio in one go, registers URL schemes + file associations,
    /// and pulls the URL-handler `ZekoroPlayerLauncher.exe` from
    /// <c>/setup/launcher.exe</c> so it never clobbers the URL handler
    /// with itself.
    /// </summary>
    [HttpGetBypass("download")]
    [HttpGetBypass("setup/installer.exe")]
    public IActionResult GetInstaller()
    {
        var path = ResolveInstallerExe();
        if (path == null)
            return NotFound("ZekoroInstaller.exe has not been built yet");

        // Aggressive no-cache: every hit on /download must serve the live
        // file straight off disk. Without this, browsers and any
        // intermediate CDN/proxy will happily reuse a cached copy and
        // users will keep installing yesterday's build even after we ship
        // a new one. The server also stamps a Last-Modified so well-behaved
        // proxies can revalidate cheaply via If-Modified-Since if they
        // really insist on caching.
        Response.Headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0";
        Response.Headers["Pragma"] = "no-cache";
        Response.Headers["Expires"] = "0";
        var lastWrite = System.IO.File.GetLastWriteTimeUtc(path);
        Response.Headers["Last-Modified"] = lastWrite.ToString("R");

        return PhysicalFile(path, "application/octet-stream", "ZekoroInstaller.exe");
    }

    /// <summary>
    /// Global "nuke" version. The bootstrapper compares this against its
    /// locally cached value; on mismatch it deletes every installed Player
    /// and Studio year and re-downloads them on the next launch. Bumping
    /// this string forces a clean reinstall fleet-wide without having to
    /// touch any per-client version.
    ///
    /// The default implementation aggregates the per-client SHA-1 versions
    /// of every Player and Studio install we currently expose. If any of
    /// the underlying exes change on disk, the global hash changes and
    /// every client will reinstall on next launch.
    /// </summary>
    [HttpGetBypass("version")]
    public IActionResult GetGlobalVersion()
    {
        var parts = new List<string>();
        foreach (var (top, exe) in new[] {
            ("clients", "RobloxPlayerBeta.exe"),
            ("studio",  "RobloxStudioBeta.exe"),
        })
        {
            var roots = CandidateRepoRoots()
                .Select(r => Path.Combine(r, top))
                .Where(Directory.Exists)
                .Distinct();
            foreach (var root in roots)
            {
                foreach (var dir in Directory.EnumerateDirectories(root))
                {
                    var name = Path.GetFileName(dir);
                    if (!SafeClientName.IsMatch(name)) continue;
                    if (!System.IO.File.Exists(Path.Combine(dir, exe))) continue;
                    var v = ComputeVersion($"{(top == "clients" ? "player" : "studio")}:{name}", dir, exe);
                    parts.Add($"{top}/{name}={v}");
                }
                break; // first existing root wins
            }
        }
        parts.Sort(StringComparer.Ordinal);
        using var sha = SHA1.Create();
        var hash = sha.ComputeHash(Encoding.UTF8.GetBytes(string.Join(";", parts)));
        var hex = Convert.ToHexString(hash).ToLowerInvariant();
        return Content($"global-{hex.Substring(0, 16)}", "text/plain", Encoding.UTF8);
    }

    // ------------------------------------------------------------------
    // helpers
    // ------------------------------------------------------------------

    private static IEnumerable<string> CandidateRepoRoots()
    {
        yield return Directory.GetCurrentDirectory();
        yield return AppContext.BaseDirectory;
        yield return Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "..");
        yield return "C:/Users/Administrator/Desktop/oldborkenzekoro";
    }

    /// <summary>
    /// Locate <c>{repo}/{topDir}/{client}/{probeExe}</c> on disk. Used for both
    /// the Player (<c>clients/{year}/RobloxPlayerBeta.exe</c>) and Studio
    /// (<c>studio/{year}/RobloxStudioBeta.exe</c>).
    /// </summary>
    private static string? ResolveClientDirectory(string topDir, string client, string probeExe)
    {
        foreach (var repo in CandidateRepoRoots())
        {
            var dir = Path.Combine(repo, topDir, client);
            var probe = Path.Combine(dir, probeExe);
            if (System.IO.File.Exists(probe))
                return Path.GetFullPath(dir);
        }
        return null;
    }

    private static string? ResolveLauncherExe() =>
        ResolveBootstrapperBinary("ZekoroPlayerLauncher.exe");

    private static string? ResolveInstallerExe() =>
        ResolveBootstrapperBinary("ZekoroInstaller.exe");

    /// <summary>
    /// Look for one of the cargo-built bootstrapper exes (release first,
    /// then debug) under the workspace's
    /// <c>clients/bootstrapper/target/&lt;profile&gt;/</c> tree. We try a
    /// few plausible workspace roots so the controller works whether the
    /// website is launched from the repo root or from its build output.
    /// </summary>
    private static string? ResolveBootstrapperBinary(string fileName)
    {
        var rels = new[]
        {
            Path.Combine("clients", "bootstrapper", "target", "release", fileName),
            Path.Combine("clients", "bootstrapper", "target", "debug", fileName),
        };
        foreach (var root in new[]
                 {
                     Directory.GetCurrentDirectory(),
                     AppContext.BaseDirectory,
                     "C:/Users/Administrator/Desktop/oldborkenzekoro",
                 })
        {
            foreach (var rel in rels)
            {
                var p = Path.GetFullPath(Path.Combine(root, rel));
                if (System.IO.File.Exists(p))
                    return p;
            }
        }
        return null;
    }

    /// <summary>SHA-1 of the target exe size+mtime. Cached for a minute.</summary>
    private static string ComputeVersion(string cacheKey, string clientDir, string probeExe)
    {
        lock (CacheLock)
        {
            if (VersionCache.TryGetValue(cacheKey, out var entry)
                && DateTime.UtcNow - entry.stamp < TimeSpan.FromMinutes(1))
                return entry.version;

            var exe = new FileInfo(Path.Combine(clientDir, probeExe));
            using var sha = SHA1.Create();
            var stamp = $"{exe.Length}:{exe.LastWriteTimeUtc.Ticks}";
            var hash = sha.ComputeHash(Encoding.UTF8.GetBytes(stamp));
            var hex = Convert.ToHexString(hash).ToLowerInvariant();
            var version = $"version-{hex.Substring(0, 16)}";
            VersionCache[cacheKey] = (version, DateTime.UtcNow);
            return version;
        }
    }

    /// <summary>
    /// Build (or return cached) zip of `clientDir`. `cacheKey` namespaces the
    /// on-disk cache (player vs studio, year, etc.); `bundleSuffix` controls
    /// the file extension stem (`-client.zip` or `-studio.zip`).
    /// </summary>
    private static string EnsureClientZip(string cacheKey, string clientDir, string version, string bundleSuffix)
    {
        var cacheRoot = Path.Combine(Configuration.StorageDirectory, "setup-cache", cacheKey);
        Directory.CreateDirectory(cacheRoot);
        var zipPath = Path.Combine(cacheRoot, $"{version}-{bundleSuffix}.zip");

        lock (CacheLock)
        {
            if (System.IO.File.Exists(zipPath))
                return zipPath;

            // Drop stale bundles for this cache key so the cache doesn't grow forever.
            foreach (var stale in Directory.EnumerateFiles(cacheRoot, $"version-*-{bundleSuffix}.zip"))
            {
                try { System.IO.File.Delete(stale); }
                catch { /* swallow — the new bundle still gets written below */ }
            }

            var tmp = zipPath + ".tmp";
            if (System.IO.File.Exists(tmp)) System.IO.File.Delete(tmp);
            ZipFile.CreateFromDirectory(clientDir, tmp, CompressionLevel.Fastest, includeBaseDirectory: false);
            System.IO.File.Move(tmp, zipPath);
            return zipPath;
        }
    }
}
