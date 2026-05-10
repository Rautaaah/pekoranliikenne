// Installs the bootstrapper into `%LOCALAPPDATA%\Zekoro\bootstrapper.exe` and
// each requested client into `%LOCALAPPDATA%\Zekoro\clients\<name>\`. Per-client
// version state is cached in `%LOCALAPPDATA%\Zekoro\state\LATEST-<name>` so
// offline launches still work after at least one successful install.

use std::fs;
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use anyhow::{anyhow, Context, Result};

use crate::config::{self, Kind};
use crate::ui::{BootstrapState, Phase};

const APP_SETTINGS_XML: &str = concat!(
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\r\n",
    "<Settings>\r\n",
    "    <ContentFolder>content</ContentFolder>\r\n",
    "    <BaseUrl>http://www.zekoro.org</BaseUrl>\r\n",
    "</Settings>\r\n",
);

const USER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ZekoroBootstrapper/0.1 (+https://www.zekoro.org)";

fn http_client(timeout: Duration) -> Result<reqwest::blocking::Client> {
    reqwest::blocking::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(timeout)
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .map_err(Into::into)
}

pub fn resolve_target_version(kind: Kind, client: &str) -> Result<String> {
    match fetch_remote_version(kind, client) {
        Ok(v) => {
            if let Ok(file) = config::cached_version_file(kind, client) {
                let _ = fs::create_dir_all(file.parent().unwrap());
                let _ = fs::write(file, &v);
            }
            Ok(v)
        }
        Err(net_err) => {
            log::warn!("could not reach setup endpoint for {} {client}: {net_err:#}", kind.label());
            if let Ok(file) = config::cached_version_file(kind, client) {
                if let Ok(cached) = fs::read_to_string(file) {
                    let cached = cached.trim().to_string();
                    if !cached.is_empty() {
                        return Ok(cached);
                    }
                }
            }
            Err(net_err.context("no cached version available either"))
        }
    }
}

fn fetch_remote_version(kind: Kind, client: &str) -> Result<String> {
    let http = http_client(Duration::from_secs(15))?;
    let resp = http.get(config::version_url(kind, client)).send()?.error_for_status()?;
    let v = resp.text()?.trim().to_string();
    if v.is_empty() {
        return Err(anyhow!("server returned an empty version string"));
    }
    Ok(v)
}

pub fn is_installed(kind: Kind, client: &str, version: &str) -> bool {
    let exe = match config::target_exe(kind, client) {
        Ok(p) => p,
        Err(_) => return false,
    };
    if !exe.is_file() {
        return false;
    }
    // We treat the cached version file as the source of truth: the exe might
    // exist from an earlier client, but if its recorded version mismatches we
    // re-download to pick up the new bundle.
    match config::cached_version_file(kind, client).and_then(|p| Ok(fs::read_to_string(p)?)) {
        Ok(cached) => cached.trim() == version,
        Err(_) => false,
    }
}

pub fn install_client(
    kind: Kind,
    client: &str,
    version: &str,
    state: &Arc<Mutex<BootstrapState>>,
) -> Result<()> {
    let target = config::install_dir(kind, client)?;
    fs::create_dir_all(&target).with_context(|| format!("creating {}", target.display()))?;

    let zip_path = target.with_extension("zip.partial");
    if zip_path.exists() {
        let _ = fs::remove_file(&zip_path);
    }
    download_with_progress(
        &config::bundle_url(kind, client, version),
        &zip_path,
        state,
        (0.0, 0.7),
    )
    .with_context(|| format!("downloading {} bundle", kind.label()))?;

    // Keep the modal copy stable across download → extract → finish so the
    // user sees a single "Upgrading <Zekoro|Zekoro Studio>..." line for the
    // duration of the install (the progress bar conveys forward motion).
    let extract_label = format!("Upgrading {}...", kind.label());
    set_status(state, Phase::Configuring, &extract_label);
    extract_zip_with_progress(&zip_path, &target, state, (0.7, 0.95))
        .with_context(|| format!("extracting {} bundle", kind.label()))?;
    let _ = fs::remove_file(&zip_path);

    // The Player needs an AppSettings.xml override to point at our backend.
    // Studio reads its base URL from the OAuth ticket / -script flag instead.
    if kind == Kind::Player {
        fs::write(target.join("AppSettings.xml"), APP_SETTINGS_XML)
            .context("writing AppSettings.xml")?;
    }

    // Persist the version so `is_installed` can short-circuit next time.
    if let Ok(file) = config::cached_version_file(kind, client) {
        let _ = fs::create_dir_all(file.parent().unwrap());
        let _ = fs::write(file, version);
    }

    set_progress(state, 0.97);
    Ok(())
}

/// Copy the running launcher into `%LOCALAPPDATA%\Zekoro\bootstrapper.exe` so
/// the URL-scheme handler can point at a stable, predictable path.
pub fn install_self() -> Result<PathBuf> {
    let dst = config::launcher_exe_path()?;
    if let Some(parent) = dst.parent() {
        fs::create_dir_all(parent)?;
    }
    let src = std::env::current_exe().context("locating current executable")?;
    if same_file(&src, &dst) {
        return Ok(dst);
    }
    if let Err(err) = fs::copy(&src, &dst) {
        if dst.is_file() {
            log::warn!("could not refresh launcher copy ({err}); keeping existing one");
        } else {
            return Err(anyhow!("copying launcher to {}: {err}", dst.display()));
        }
    }
    Ok(dst)
}

/// Installer-mode counterpart to [`install_self`]: fetch the real
/// `ZekoroPlayerLauncher.exe` from the server (`/setup/launcher.exe`) and
/// place it at `%LOCALAPPDATA%\Zekoro\bootstrapper.exe`. This is critical
/// in installer mode because we MUST NOT copy the running installer exe
/// over the URL handler — the installer ignores URIs, so doing so would
/// break every Play button on the website for the user.
///
/// Falls back to the cached file already on disk if the server is
/// unreachable (the URL-scheme handler at least keeps working).
pub fn install_launcher_from_server() -> Result<PathBuf> {
    let dst = config::launcher_exe_path()?;
    if let Some(parent) = dst.parent() {
        fs::create_dir_all(parent)?;
    }
    let url = config::launcher_url();
    let http = http_client(Duration::from_secs(60 * 5))?;
    match http.get(&url).send().and_then(|r| r.error_for_status()) {
        Ok(mut resp) => {
            // Stream into a side file then rename so a partial download
            // can never corrupt an existing working launcher.
            let tmp = dst.with_extension("exe.partial");
            if tmp.exists() {
                let _ = fs::remove_file(&tmp);
            }
            let mut file = fs::File::create(&tmp)
                .with_context(|| format!("creating {}", tmp.display()))?;
            let mut buf = [0u8; 64 * 1024];
            loop {
                let n = resp.read(&mut buf)?;
                if n == 0 {
                    break;
                }
                file.write_all(&buf[..n])?;
            }
            file.flush()?;
            drop(file);
            if let Err(err) = fs::rename(&tmp, &dst) {
                // On Windows you can't rename over a running exe; if a
                // previous launcher copy is locked, leave the .partial
                // around but report success on the existing file rather
                // than blowing up the install.
                if dst.is_file() {
                    log::warn!(
                        "could not replace launcher at {} ({err}); keeping existing copy",
                        dst.display()
                    );
                    let _ = fs::remove_file(&tmp);
                } else {
                    return Err(anyhow!(
                        "renaming downloaded launcher into place at {}: {err}",
                        dst.display()
                    ));
                }
            }
            Ok(dst)
        }
        Err(err) => {
            log::warn!("could not download launcher from {url}: {err:#}");
            if dst.is_file() {
                Ok(dst)
            } else {
                Err(anyhow!(
                    "no launcher cached locally and download from {url} failed: {err}"
                ))
            }
        }
    }
}

fn same_file(a: &Path, b: &Path) -> bool {
    match (fs::canonicalize(a), fs::canonicalize(b)) {
        (Ok(a), Ok(b)) => a == b,
        _ => false,
    }
}

// ---------------------------------------------------------------------------
// download / extract with progress
// ---------------------------------------------------------------------------

fn download_with_progress(
    url: &str,
    dest: &Path,
    state: &Arc<Mutex<BootstrapState>>,
    range: (f32, f32),
) -> Result<()> {
    let http = http_client(Duration::from_secs(60 * 10))?;
    let mut resp = http.get(url).send()?.error_for_status()?;
    let total = resp.content_length();

    let mut file = fs::File::create(dest)
        .with_context(|| format!("creating {}", dest.display()))?;
    let mut buf = [0u8; 64 * 1024];
    let mut downloaded: u64 = 0;
    loop {
        let n = resp.read(&mut buf)?;
        if n == 0 {
            break;
        }
        file.write_all(&buf[..n])?;
        downloaded += n as u64;
        if let Some(total) = total {
            if total > 0 {
                let frac = (downloaded as f32) / (total as f32);
                set_progress(state, lerp(range.0, range.1, frac.clamp(0.0, 1.0)));
            }
        }
    }
    file.flush()?;
    set_progress(state, range.1);
    Ok(())
}

fn extract_zip_with_progress(
    zip_path: &Path,
    target: &Path,
    state: &Arc<Mutex<BootstrapState>>,
    range: (f32, f32),
) -> Result<()> {
    let file = fs::File::open(zip_path)?;
    let mut zip = zip::ZipArchive::new(file)?;
    let total = zip.len() as f32;

    for i in 0..zip.len() {
        let mut entry = zip.by_index(i)?;
        let rel = match entry.enclosed_name() {
            Some(p) => p.to_path_buf(),
            None => continue,
        };
        let out = target.join(&rel);

        if entry.is_dir() {
            fs::create_dir_all(&out)?;
        } else {
            if let Some(parent) = out.parent() {
                fs::create_dir_all(parent)?;
            }
            let mut writer = fs::File::create(&out)
                .with_context(|| format!("creating {}", out.display()))?;
            io::copy(&mut entry, &mut writer)?;
        }

        let frac = ((i + 1) as f32) / total;
        set_progress(state, lerp(range.0, range.1, frac.clamp(0.0, 1.0)));
    }

    Ok(())
}

fn lerp(a: f32, b: f32, t: f32) -> f32 {
    a + (b - a) * t
}

fn set_status(state: &Arc<Mutex<BootstrapState>>, phase: Phase, status: &str) {
    let mut s = state.lock().unwrap();
    s.phase = phase;
    s.status = status.to_string();
}

fn set_progress(state: &Arc<Mutex<BootstrapState>>, p: f32) {
    let mut s = state.lock().unwrap();
    s.progress = Some(p.clamp(0.0, 1.0));
}

// ---------------------------------------------------------------------------
// URL-scheme registration (Windows only)
// ---------------------------------------------------------------------------

#[cfg(windows)]
pub fn register_url_schemes(launcher: &Path) -> Result<()> {
    use winreg::enums::*;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let launcher_str = launcher.to_string_lossy().to_string();

    let all = config::URL_SCHEMES_PLAYER
        .iter()
        .copied()
        .chain(config::URL_SCHEMES_STUDIO.iter().copied());

    for scheme in all {
        let base = format!("Software\\Classes\\{scheme}");
        let (key, _) = hkcu.create_subkey(&base)?;
        key.set_value("", &format!("URL:{} Protocol", config::APP_NAME))?;
        key.set_value("URL Protocol", &"")?;

        let (icon_key, _) = hkcu.create_subkey(format!("{base}\\DefaultIcon"))?;
        icon_key.set_value("", &format!("\"{launcher_str}\",0"))?;

        let (cmd_key, _) = hkcu.create_subkey(format!("{base}\\shell\\open\\command"))?;
        cmd_key.set_value("", &format!("\"{launcher_str}\" \"%1\""))?;
    }
    Ok(())
}

#[cfg(not(windows))]
pub fn register_url_schemes(_launcher: &Path) -> Result<()> {
    Ok(())
}

// ---------------------------------------------------------------------------
// File-association registration (.rblx / .rbxl / .rbxlx / .rbxm / .rbxmx)
// ---------------------------------------------------------------------------

/// Tell Windows that double-clicking a Roblox-format file should hand the
/// file off to our bootstrapper, which in turn boots the appropriate Studio
/// install and opens the file. All registry keys are written under
/// `HKCU\Software\Classes` so we never need elevation.
#[cfg(windows)]
pub fn register_file_associations(launcher: &Path) -> Result<()> {
    use winreg::enums::*;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let launcher_str = launcher.to_string_lossy().to_string();

    // Single ProgId all our file types point at.
    let prog_id = "Zekoro.StudioFile";
    let (cls, _) = hkcu.create_subkey(format!("Software\\Classes\\{prog_id}"))?;
    cls.set_value("", &"Zekoro Studio File")?;
    cls.set_value("FriendlyTypeName", &"Zekoro Studio File")?;

    let (icon, _) = hkcu.create_subkey(format!("Software\\Classes\\{prog_id}\\DefaultIcon"))?;
    icon.set_value("", &format!("\"{launcher_str}\",0"))?;

    let (cmd, _) = hkcu.create_subkey(format!(
        "Software\\Classes\\{prog_id}\\shell\\open\\command"
    ))?;
    cmd.set_value("", &format!("\"{launcher_str}\" \"%1\""))?;

    for ext in config::STUDIO_FILE_EXTS {
        let (ext_key, _) = hkcu.create_subkey(format!("Software\\Classes\\.{ext}"))?;
        ext_key.set_value("", &prog_id)?;
        // OpenWithProgids lets the user pick us from "Open With" without
        // clobbering whatever default they may already have.
        let (open_with, _) =
            hkcu.create_subkey(format!("Software\\Classes\\.{ext}\\OpenWithProgids"))?;
        open_with.set_value(prog_id, &"")?;
    }
    Ok(())
}

#[cfg(not(windows))]
pub fn register_file_associations(_launcher: &Path) -> Result<()> {
    Ok(())
}

// ---------------------------------------------------------------------------
// Global version "nuke" — wipe all installs when /version changes.
// ---------------------------------------------------------------------------

/// Compare the live `/version` string against the one we cached locally. On
/// first run (no cache) we record the live value and return; on mismatch we
/// nuke every Player + Studio install so the per-client steps re-download.
pub fn enforce_global_version(state: &Arc<Mutex<BootstrapState>>) -> Result<()> {
    let http = http_client(Duration::from_secs(15))?;
    let live = http
        .get(config::global_version_url())
        .send()?
        .error_for_status()?
        .text()?
        .trim()
        .to_string();
    if live.is_empty() {
        return Err(anyhow!("server returned an empty global version"));
    }

    let cache_path = config::global_version_file()?;
    let cached = fs::read_to_string(&cache_path)
        .map(|s| s.trim().to_string())
        .unwrap_or_default();

    if cached == live {
        return Ok(());
    }

    if !cached.is_empty() {
        // Cached value differs from live → user has stale installs. Wipe them.
        log::warn!(
            "global version changed ({} -> {}); wiping all installs",
            cached,
            live
        );
        set_status(state, Phase::Configuring, "Updating Zekoro to a new version...");
        wipe_all_installs()?;
    }

    if let Some(parent) = cache_path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    fs::write(&cache_path, &live)
        .with_context(|| format!("writing {}", cache_path.display()))?;
    Ok(())
}

/// Recursively delete every Player and Studio install directory plus the
/// per-client `LATEST-*` cache markers. The bootstrapper exe and the global
/// version file itself are left in place.
fn wipe_all_installs() -> Result<()> {
    for kind in &[Kind::Player, Kind::Studio] {
        let root = config::kind_root(*kind)?;
        if root.exists() {
            log::info!("removing {}", root.display());
            if let Err(err) = fs::remove_dir_all(&root) {
                // Don't fail the whole launch if a single file is locked —
                // the install step below will overwrite what it can.
                log::warn!("could not fully remove {}: {err}", root.display());
            }
        }
    }
    // Drop per-client version markers so `is_installed` returns false even if
    // a few files survived the directory wipe above.
    if let Ok(state) = config::state_dir() {
        if state.is_dir() {
            for entry in fs::read_dir(&state)?.flatten() {
                let name = entry.file_name();
                let name = name.to_string_lossy();
                if name.starts_with("LATEST-") {
                    let _ = fs::remove_file(entry.path());
                }
            }
        }
    }
    Ok(())
}
