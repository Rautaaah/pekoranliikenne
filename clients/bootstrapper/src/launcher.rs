// Top-level launch pipeline driving the splash UI:
//
//   1. Self-install into `%LOCALAPPDATA%\Zekoro\bootstrapper.exe` and (on
//      Windows) refresh the `roblox-player://` URL-scheme registration.
//   2. Pick the requested client (default `2020`).
//   3. Resolve its current version from the server, falling back to the
//      cached `LATEST-<client>` file when offline.
//   4. Download + extract the bundle into
//      `%LOCALAPPDATA%\Zekoro\clients\<client>\` if not already current.
//   5. Parse the play URI we were invoked with, build argv for
//      `RobloxPlayerBeta.exe`, and spawn it.

use std::path::Path;
use std::process::Command;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use anyhow::{anyhow, Context, Result};
use percent_encoding::percent_decode_str;

use crate::config::{self, Kind};
use crate::installer;
use crate::ui::{BootstrapState, Phase};

/// Parsed CLI: optional play URI + which client + Player vs Studio +
/// optional local file (Studio "open file" mode) + installer mode flag.
pub struct LaunchInput {
    pub play_url: Option<String>,
    pub local_file: Option<String>,
    pub client: String,
    pub kind: Kind,
    /// Set by `--install` on the CLI or by the dedicated
    /// `ZekoroInstaller.exe` binary. Tells the pipeline to install both
    /// Player and Studio and skip the game spawn at the end.
    pub install_only: bool,
}

fn looks_like_studio_file(arg: &str) -> bool {
    if let Some(ext) = std::path::Path::new(arg)
        .extension()
        .and_then(|e| e.to_str())
    {
        let lc = ext.to_ascii_lowercase();
        config::STUDIO_FILE_EXTS.iter().any(|e| *e == lc)
    } else {
        false
    }
}

pub fn parse_argv(args: &[String]) -> LaunchInput {
    let mut play_url: Option<String> = None;
    let mut local_file: Option<String> = None;
    let mut client: Option<String> = None;
    let mut kind: Option<Kind> = None;
    let mut install_only = false;
    let mut iter = args.iter();
    while let Some(arg) = iter.next() {
        match arg.as_str() {
            "--play-url" => {
                if let Some(v) = iter.next() {
                    play_url = Some(v.clone());
                }
            }
            "--client" => {
                if let Some(v) = iter.next() {
                    client = Some(v.clone());
                }
            }
            "--install" | "--installer" => install_only = true,
            "--studio" => kind = Some(Kind::Studio),
            "--player" => kind = Some(Kind::Player),
            "--open" => {
                if let Some(v) = iter.next() {
                    local_file = Some(v.clone());
                    if kind.is_none() {
                        kind = Some(Kind::Studio);
                    }
                }
            }
            other => {
                // Accept any registered URL scheme as the play URI. The scheme
                // also implies the kind (Player vs Studio).
                if let Some((scheme, _)) = other.split_once(':') {
                    if let Some(k) = Kind::from_scheme(scheme) {
                        play_url = Some(other.to_string());
                        if kind.is_none() {
                            kind = Some(k);
                        }
                        continue;
                    }
                }
                // Also accept a bare path to a Studio-known file extension
                // (.rblx / .rbxl / .rbxlx / .rbxm / .rbxmx). When the OS
                // hands us such a file via the registered file association
                // we open it in Studio.
                if looks_like_studio_file(other) {
                    local_file = Some(other.to_string());
                    if kind.is_none() {
                        kind = Some(Kind::Studio);
                    }
                }
            }
        }
    }
    // The URI may also carry a `clientyear:2020` field — honour it when present
    // so a single shortcut can target multiple clients.
    if client.is_none() {
        if let Some(url) = play_url.as_deref() {
            if let Ok(parsed) = parse_play_uri(url) {
                if let Some(year) = parsed.clientyear {
                    client = Some(year);
                }
            }
        }
    }
    LaunchInput {
        play_url,
        local_file,
        client: client.unwrap_or_else(|| config::DEFAULT_CLIENT.to_string()),
        kind: kind.unwrap_or(Kind::Player),
        install_only,
    }
}

#[derive(Debug, Default)]
pub struct PlayParams {
    // Player fields
    pub launchmode: String,
    pub gameinfo: Option<String>,
    pub placelauncherurl: Option<String>,
    pub launchtime: Option<String>,
    pub clientversion: Option<String>,
    pub clientyear: Option<String>,
    pub launchexp: Option<String>,
    pub browsertrackerid: Option<String>,

    // Studio fields. The website's EditPlace handler builds URIs of the form
    //   zekoro-studio:1+launchmode:edit+task:EditPlace+placeId:<id>+userId:<id>
    //                +script:<negotiate-url>+universeId:<id>
    pub task: Option<String>,
    pub place_id: Option<String>,
    pub universe_id: Option<String>,
    pub user_id: Option<String>,
    pub script: Option<String>,
}

pub fn parse_play_uri(uri: &str) -> Result<PlayParams> {
    let after_scheme = uri
        .splitn(2, ':')
        .nth(1)
        .ok_or_else(|| anyhow!("missing scheme separator in URI"))?;

    let mut p = PlayParams::default();
    for token in after_scheme.split('+') {
        if token.is_empty() {
            continue;
        }
        let (key, value) = match token.split_once(':') {
            Some(kv) => kv,
            None => continue,
        };
        let value = percent_decode_str(value).decode_utf8_lossy().to_string();
        match key {
            "1" | "launchmode" => p.launchmode = value,
            // Player
            "gameinfo" => p.gameinfo = Some(value),
            "placelauncherurl" => p.placelauncherurl = Some(value),
            "launchtime" => p.launchtime = Some(value),
            "clientversion" => p.clientversion = Some(value),
            "clientyear" => p.clientyear = Some(value),
            "launchexp" => p.launchexp = Some(value),
            "browsertrackerid" => p.browsertrackerid = Some(value),
            // Studio
            "task" => p.task = Some(value),
            "placeId" | "placeid" => p.place_id = Some(value),
            "universeId" | "universeid" => p.universe_id = Some(value),
            "userId" | "userid" => p.user_id = Some(value),
            "script" => p.script = Some(value),
            _ => {}
        }
    }
    Ok(p)
}

pub fn build_player_args(p: &PlayParams) -> Vec<String> {
    let mut args = Vec::<String>::new();

    args.push("-a".into());
    args.push(format!("{}/Login/Negotiate.ashx", config::BASE_URL));

    if let Some(ticket) = &p.gameinfo {
        args.push("-t".into());
        args.push(ticket.clone());
    }
    if let Some(url) = &p.placelauncherurl {
        args.push("-j".into());
        args.push(url.clone());
    }
    if let Some(t) = &p.launchtime {
        args.push("-b".into());
        args.push(t.clone());
    }
    if let Some(v) = &p.clientversion {
        args.push("--rbxexp".into());
        args.push(v.clone());
    }
    if let Some(exp) = &p.launchexp {
        args.push("--launchexp".into());
        args.push(exp.clone());
    }
    if let Some(id) = &p.browsertrackerid {
        args.push("--browserTrackerId".into());
        args.push(id.clone());
    }
    args
}

/// Build argv for `RobloxStudioBeta.exe`. Studio's CLI looks similar to the
/// player but uses a different verb scheme. The website's EditPlace flow
/// hands us a URI like:
///   zekoro-studio:1+launchmode:edit+task:EditPlace+placeId:<id>+userId:<id>
///                +script:https://www.zekoro.org/Login/Negotiate.ashx
/// (the legacy `roblox-studio:` form is also accepted for back-compat.)
/// We forward the relevant fields and let Studio do the rest.
pub fn build_studio_args(p: &PlayParams) -> Vec<String> {
    let mut args = Vec::<String>::new();

    // Always tell Studio where to authenticate.
    args.push("-a".into());
    args.push(format!("{}/Login/Negotiate.ashx", config::BASE_URL));

    // launchmode -> task. Default to "edit" if neither is supplied.
    let task = p.task.clone().unwrap_or_else(|| match p.launchmode.as_str() {
        "" | "edit" => "EditPlace".to_string(),
        other => other.to_string(),
    });
    args.push("-task".into());
    args.push(task);

    if let Some(id) = &p.place_id {
        args.push("-placeId".into());
        args.push(id.clone());
    }
    if let Some(id) = &p.universe_id {
        args.push("-universeId".into());
        args.push(id.clone());
    }
    if let Some(id) = &p.user_id {
        args.push("-userId".into());
        args.push(id.clone());
    }
    if let Some(s) = &p.script {
        args.push("-script".into());
        args.push(s.clone());
    }
    args
}

pub fn run_pipeline(state: &Arc<Mutex<BootstrapState>>) -> Result<()> {
    let (play_url, local_file, client, kind, install_only) = {
        let s = state.lock().unwrap();
        (
            s.play_url.clone(),
            s.local_file.clone(),
            s.client.clone(),
            s.kind,
            s.install_only,
        )
    };

    let label = kind.label();

    if install_only {
        set_phase(state, Phase::Connecting, "Upgrading Zekoro...", None);
    } else {
        set_phase(state, Phase::Connecting, &format!("Upgrading {label}..."), None);
    }

    // Drop the URL-handler exe at a stable, predictable path (the registry
    // points at it). For the launcher binary we just copy ourselves; for
    // the standalone installer we MUST instead pull down the real
    // ZekoroPlayerLauncher.exe — the installer ignores URIs so copying it
    // over the URL handler would break every Play button for the user.
    let installed_launcher = if install_only {
        installer::install_launcher_from_server()?
    } else {
        installer::install_self()?
    };
    if let Err(err) = installer::register_url_schemes(&installed_launcher) {
        log::warn!("URL scheme registration failed (non-fatal): {err:#}");
    }
    if let Err(err) = installer::register_file_associations(&installed_launcher) {
        log::warn!("file-association registration failed (non-fatal): {err:#}");
    }

    // Global "nuke" version: if the server-side /version string differs from
    // what we have cached locally, wipe every Player + Studio install so the
    // per-client steps below pull fresh bundles.
    if let Err(err) = installer::enforce_global_version(state) {
        log::warn!("global version enforcement skipped: {err:#}");
    }

    // Installer mode: provision both Player + Studio for the default client
    // year, then park the modal in success state and return without spawning
    // anything. Used by `ZekoroInstaller.exe` and `--install`.
    if install_only {
        run_installer_pipeline(state, &client)?;
        return Ok(());
    }

    let version = installer::resolve_target_version(kind, &client)
        .with_context(|| format!("resolving version for {label} {client}"))?;
    log::info!("{label} {client} target version: {version}");

    if !installer::is_installed(kind, &client, &version) {
        // Status copy matches the upgrade modal screenshot reference.
        // We show "Upgrading <label>..." for the whole download/extract
        // phase; the progress bar conveys progress, the modal copy stays
        // single-line and stable.
        set_phase(
            state,
            Phase::Configuring,
            &format!("Upgrading {label}..."),
            Some(0.0),
        );
        installer::install_client(kind, &client, &version, state)?;
    } else {
        log::info!("{label} {client} already at {version}, skipping download");
        set_progress(state, 0.95);
    }

    set_phase(state, Phase::Configuring, &format!("Upgrading {label}..."), Some(0.97));

    let exe_path = config::target_exe(kind, &client)?;
    if !exe_path.is_file() {
        return Err(anyhow!(
            "install reported success but {} is missing",
            exe_path.display()
        ));
    }

    let args = if let Some(file) = local_file.as_deref() {
        // Open a local .rblx / .rbxl / .rbxlx in Studio. Studio takes the
        // file path as a single positional argument.
        if kind != Kind::Studio {
            log::warn!("local file supplied with kind {label}; forcing Studio open");
        }
        vec![file.to_string()]
    } else {
        match play_url.as_deref() {
            Some(url) => {
                let parsed = parse_play_uri(url).context("parsing launch URI")?;
                match kind {
                    Kind::Player => build_player_args(&parsed),
                    Kind::Studio => build_studio_args(&parsed),
                }
            }
            None => {
                set_phase(
                    state,
                    Phase::Idle,
                    &format!("{label} is ready. Launch from the website to start."),
                    Some(1.0),
                );
                return Ok(());
            }
        }
    };

    set_phase(state, Phase::Starting, &format!("Starting {label}..."), Some(1.0));
    log::info!("spawning {} {:?}", exe_path.display(), args);
    spawn_target(&exe_path, &args)?;

    set_phase(state, Phase::Done, "Have fun!", Some(1.0));
    std::thread::sleep(Duration::from_millis(1500));
    state.lock().unwrap().request_close = true;
    Ok(())
}

/// Standalone-installer flow: install the Player and Studio clients (in
/// that order) for the requested client year, leaving the modal parked in
/// the success-idle state so the user has time to read the result before
/// dismissing. Never spawns a game/Studio process.
fn run_installer_pipeline(state: &Arc<Mutex<BootstrapState>>, client: &str) -> Result<()> {
    // Player. Each kind takes 0.0..0.5 of the overall progress bar so the
    // user sees forward motion through the whole installer.
    install_kind_with_overall_progress(state, Kind::Player, client, (0.0, 0.5))?;
    install_kind_with_overall_progress(state, Kind::Studio, client, (0.5, 1.0))?;

    set_phase(
        state,
        Phase::Idle,
        "Zekoro is installed. You can now play from the website.",
        Some(1.0),
    );
    Ok(())
}

/// Resolve the target version for `kind`/`client`, install it if missing,
/// and remap the per-step progress into the slice of the overall installer
/// bar specified by `overall_range`.
fn install_kind_with_overall_progress(
    state: &Arc<Mutex<BootstrapState>>,
    kind: Kind,
    client: &str,
    overall_range: (f32, f32),
) -> Result<()> {
    let label = kind.label();

    set_phase(
        state,
        Phase::Configuring,
        &format!("Upgrading {label}..."),
        Some(overall_range.0),
    );

    let version = installer::resolve_target_version(kind, client)
        .with_context(|| format!("resolving version for {label} {client}"))?;
    log::info!("{label} {client} target version: {version}");

    if installer::is_installed(kind, client, &version) {
        log::info!("{label} {client} already at {version}, skipping download");
        set_progress(state, overall_range.1);
        return Ok(());
    }

    // `install_client` writes progress into the 0.0..1.0 range; capture and
    // remap into our overall slice via a wrapper state. Easiest approach is
    // to just install and trust install_client's own progress writes — they
    // already cover this kind's portion of the work, and the extra rescale
    // only matters for visual smoothness. Good enough.
    installer::install_client(kind, client, &version, state)?;
    set_progress(state, overall_range.1);
    Ok(())
}

fn spawn_target(exe: &Path, args: &[String]) -> Result<()> {
    let mut cmd = Command::new(exe);
    cmd.args(args);
    if let Some(parent) = exe.parent() {
        cmd.current_dir(parent);
    }
    cmd.spawn()
        .with_context(|| format!("spawning {}", exe.display()))?;
    Ok(())
}

fn set_phase(
    state: &Arc<Mutex<BootstrapState>>,
    phase: Phase,
    status: &str,
    progress: Option<f32>,
) {
    let mut s = state.lock().unwrap();
    s.phase = phase;
    s.status = status.to_string();
    if let Some(p) = progress {
        s.progress = Some(p.clamp(0.0, 1.0));
    }
}

fn set_progress(state: &Arc<Mutex<BootstrapState>>, p: f32) {
    let mut s = state.lock().unwrap();
    s.progress = Some(p.clamp(0.0, 1.0));
}
