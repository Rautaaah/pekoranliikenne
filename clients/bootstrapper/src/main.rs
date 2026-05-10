// ZekoroPlayerLauncher: handles roblox-player:// / zekoro-player:// /
// roblox-studio:// / zekoro-studio:// URI handoffs from the OS, plus
// double-clicks on Studio file types (.rblx / .rbxl / etc).
//
// All real logic lives in the `zekoro_bootstrapper` library so that this
// binary and `ZekoroInstaller` share the same install + launch pipeline.

#![cfg_attr(all(target_os = "windows", not(debug_assertions)), windows_subsystem = "windows")]

fn main() -> anyhow::Result<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    zekoro_bootstrapper::run(args, /* force_install_only = */ false)
}
