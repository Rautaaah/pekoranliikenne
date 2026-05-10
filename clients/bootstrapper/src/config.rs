// Compile-time configuration. Change `BASE_URL` for production deploys; the
// rest of the file is just helpers for resolving paths and URLs.
//
// Disk layout:
//
//   %LOCALAPPDATA%\Zekoro\
//   ├── bootstrapper.exe         ← self-installed copy of this launcher
//   ├── clients\                 ← Player installs (one folder per year)
//   │   ├── 2020\
//   │   │   ├── RobloxPlayerBeta.exe
//   │   │   ├── content\…
//   │   │   └── AppSettings.xml
//   │   ├── 2019\…
//   │   └── 2017\…
//   ├── Studio\                  ← Studio installs (one folder per year)
//   │   └── 2020\
//   │       ├── RobloxStudioBeta.exe
//   │       └── content\…
//   └── state\
//       ├── LATEST-<client>      ← cached version string per Player client
//       └── LATEST-studio-<client>  ← cached version string per Studio client

use std::path::PathBuf;

use directories::BaseDirs;

pub const BASE_URL: &str = "http://www.zekoro.org";
pub const APP_NAME: &str = "Zekoro";
pub const LAUNCHER_EXE: &str = "bootstrapper.exe";

/// Default client identifier used when no `--client` flag and no explicit
/// `clientyear:` URI segment are present.
pub const DEFAULT_CLIENT: &str = "2020";

/// URL schemes that can hand off to us. Only the first in each list is
/// registered with the OS as the canonical scheme; the rest are accepted on
/// the CLI for compatibility with older shortcuts.
pub const URL_SCHEMES_PLAYER: &[&str] = &["zekoro-player", "roblox-player"];
pub const URL_SCHEMES_STUDIO: &[&str] = &["zekoro-studio", "roblox-studio"];

/// Local-file extensions handled by the bootstrapper. When the launcher is
/// invoked with one of these on the command line we treat it as a Studio
/// "open file" request and forward the absolute path to RobloxStudioBeta.exe.
pub const STUDIO_FILE_EXTS: &[&str] = &["rblx", "rbxl", "rbxlx", "rbxm", "rbxmx"];

/// What the bootstrapper has been asked to do. Determines install directory,
/// download endpoints, and which exe gets spawned at the end of the pipeline.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    Player,
    Studio,
}

impl Kind {
    pub fn from_scheme(scheme: &str) -> Option<Self> {
        let s = scheme.to_ascii_lowercase();
        if URL_SCHEMES_PLAYER.iter().any(|p| *p == s) {
            Some(Kind::Player)
        } else if URL_SCHEMES_STUDIO.iter().any(|p| *p == s) {
            Some(Kind::Studio)
        } else {
            None
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Kind::Player => "Zekoro",
            Kind::Studio => "Zekoro Studio",
        }
    }

    pub fn exe_name(self) -> &'static str {
        match self {
            Kind::Player => "RobloxPlayerBeta.exe",
            Kind::Studio => "RobloxStudioBeta.exe",
        }
    }
}

pub fn install_root() -> anyhow::Result<PathBuf> {
    let dirs = BaseDirs::new().ok_or_else(|| anyhow::anyhow!("no LOCALAPPDATA"))?;
    Ok(dirs.data_local_dir().join(APP_NAME))
}

pub fn launcher_exe_path() -> anyhow::Result<PathBuf> {
    Ok(install_root()?.join(LAUNCHER_EXE))
}

/// Top-level directory for installs of `kind` (Player -> `clients`, Studio
/// -> `Studio`). Player keeps the lowercase legacy name to avoid orphaning
/// existing installations.
pub fn kind_root(kind: Kind) -> anyhow::Result<PathBuf> {
    let sub = match kind {
        Kind::Player => "clients",
        Kind::Studio => "Studio",
    };
    Ok(install_root()?.join(sub))
}

pub fn install_dir(kind: Kind, client: &str) -> anyhow::Result<PathBuf> {
    Ok(kind_root(kind)?.join(client))
}

pub fn target_exe(kind: Kind, client: &str) -> anyhow::Result<PathBuf> {
    Ok(install_dir(kind, client)?.join(kind.exe_name()))
}

pub fn state_dir() -> anyhow::Result<PathBuf> {
    Ok(install_root()?.join("state"))
}

pub fn cached_version_file(kind: Kind, client: &str) -> anyhow::Result<PathBuf> {
    let prefix = match kind {
        Kind::Player => "LATEST",
        Kind::Studio => "LATEST-studio",
    };
    Ok(state_dir()?.join(format!("{prefix}-{client}")))
}

pub fn version_url(kind: Kind, client: &str) -> String {
    match kind {
        Kind::Player => format!("{BASE_URL}/setup/{client}/version.txt"),
        Kind::Studio => format!("{BASE_URL}/setup/studio/{client}/version.txt"),
    }
}

pub fn bundle_url(kind: Kind, client: &str, version: &str) -> String {
    match kind {
        Kind::Player => format!("{BASE_URL}/setup/{client}/{version}-client.zip"),
        Kind::Studio => format!("{BASE_URL}/setup/studio/{client}/{version}-studio.zip"),
    }
}

/// URL the standalone installer pulls `ZekoroPlayerLauncher.exe` from to
/// stage as the URL-scheme handler. Served by `SetupController.cs`'s
/// `GET /setup/launcher.exe` endpoint.
pub fn launcher_url() -> String {
    format!("{BASE_URL}/setup/launcher.exe")
}

/// Global "nuke" version. When this string changes server-side the
/// bootstrapper wipes *all* installed Player + Studio years on the next run
/// and re-downloads them. Lets ops force a clean reinstall fleet-wide by
/// bumping a single value.
pub fn global_version_url() -> String {
    format!("{BASE_URL}/version")
}

/// Where the last-seen global version is cached locally.
pub fn global_version_file() -> anyhow::Result<PathBuf> {
    Ok(state_dir()?.join("GLOBAL-VERSION"))
}

