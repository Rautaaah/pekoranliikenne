// Shared library for the two bootstrapper binaries:
//
//   * `ZekoroPlayerLauncher.exe` (src/main.rs) — handles `roblox-player://` /
//     `zekoro-player://` / `roblox-studio://` / `zekoro-studio://` URI
//     handoffs and Studio file double-clicks. Installs whatever was asked
//     for, then spawns the game/Studio.
//
//   * `ZekoroInstaller.exe` (src/bin/installer.rs) — the standalone setup
//     binary the website serves on the "Download Zekoro" button. Installs
//     BOTH Player and Studio (so the user is fully provisioned), registers
//     URL schemes + file associations, and parks on a "Zekoro is installed"
//     success state instead of launching anything.
//
// Both binaries share UI, config, install + launch pipelines via this lib.

pub mod config;
pub mod installer;
pub mod launcher;
pub mod ui;

use std::sync::{Arc, Mutex};

use anyhow::Result;
use eframe::egui;

const WINDOW_W: f32 = 525.0;
const WINDOW_H: f32 = 300.0;

/// Boot up the GUI and kick off the install/launch pipeline on a worker
/// thread. `args` is the raw argv (without the program name).
///
/// When `force_install_only` is true the launcher acts as a pure installer:
/// any incoming URI/local-file is dropped, both Player and Studio are
/// installed, and the pipeline finishes in the success-idle state instead
/// of spawning a game.
pub fn run(args: Vec<String>, force_install_only: bool) -> Result<()> {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    let mut input = launcher::parse_argv(&args);
    if force_install_only {
        input.install_only = true;
        input.play_url = None;
        input.local_file = None;
    }

    let title = if input.install_only {
        "Zekoro Installer".to_string()
    } else {
        input.kind.label().to_string()
    };

    let state = Arc::new(Mutex::new(ui::BootstrapState::new(
        input.play_url,
        input.local_file,
        input.client,
        input.kind,
        input.install_only,
    )));

    {
        let state = Arc::clone(&state);
        std::thread::spawn(move || {
            if let Err(err) = launcher::run_pipeline(&state) {
                log::error!("launch pipeline failed: {err:#}");
                let mut s = state.lock().unwrap();
                s.fail(format!("Launch failed: {err:#}"));
            }
        });
    }

    let mut viewport = egui::ViewportBuilder::default()
        .with_inner_size([WINDOW_W, WINDOW_H])
        .with_min_inner_size([WINDOW_W, WINDOW_H])
        .with_max_inner_size([WINDOW_W, WINDOW_H])
        .with_resizable(false)
        .with_decorations(false)
        .with_transparent(true)
        .with_title(&title);

    if let Some((rgba, w, h)) = ui::app_icon_rgba() {
        viewport = viewport.with_icon(egui::IconData {
            rgba,
            width: w,
            height: h,
        });
    }

    let options = eframe::NativeOptions {
        viewport,
        centered: true,
        ..Default::default()
    };

    eframe::run_native(
        "Zekoro",
        options,
        Box::new(move |cc| {
            egui_extras::install_image_loaders(&cc.egui_ctx);
            Box::new(ui::BootstrapApp::new(cc, state))
        }),
    )
    .map_err(|e| anyhow::anyhow!("eframe: {e}"))?;

    Ok(())
}
