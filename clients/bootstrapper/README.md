# Zekoro Bootstrapper (Rust)

The small launcher the website's `Play` button hands games off to. It looks
like the Roblox 2020 splash (borderless white card, red `ZEKORO` wordmark,
animated progress strip, ✕ close button) and is a single ~3 MB binary built
on `eframe` / `egui`.

## What it does (in order)

1. Talks to `BASE_URL/setup/version.txt` to learn the current client version
   (falls back to the cached `LATEST` file if offline).
2. If `%LOCALAPPDATA%\Zekoro\Versions\<version>\RobloxPlayerBeta.exe` is
   missing, downloads `BASE_URL/setup/<version>-client.zip` and extracts it
   into that folder while showing a determinate progress bar.
3. Writes a fresh `AppSettings.xml` next to the exe that points the client at
   `BASE_URL`.
4. Copies the running launcher into the same version folder under the name
   `ZekoroPlayerLauncher.exe`.
5. **Windows only** — registers `roblox-player://` and `zekoro-player://`
   under `HKCU\Software\Classes\…` so browser handoff works for the current
   user.
6. Parses the URI it was invoked with (or `--play-url <URL>`) into a
   `RobloxPlayerBeta.exe` argv (`-a`, `-t`, `-j`, `-b`, …) and spawns it.
7. Closes the splash 1.5 s after the game starts.

`BASE_URL` and the install layout live in `src/config.rs`. Change the
constant once per deploy.

## Build

Requires a Rust toolchain (`rustup default stable`).

```powershell
cd ~\clients\bootstrapper
cargo build --release
```

Output: `clients\bootstrapper\target\release\ZekoroPlayerLauncher.exe`.

## Run / test

End-to-end (the way browsers will invoke it):

```
ZekoroPlayerLauncher.exe "roblox-player:1+launchmode:play+gameinfo:<JWT>+placelauncherurl:<URL>"
```

Quick check without a browser:

```
ZekoroPlayerLauncher.exe --play-url "http://www.zekoro.org/Game/PlaceLauncher.ashx?request=RequestGame&placeId=2487"
```

Without any URL the launcher still installs/updates the client and finishes
in the "Zekoro is ready" idle state — useful for verifying installs without
spinning up a game server.

## Backend support

The matching server-side endpoints live in
`Roblox/Roblox.Website/Controllers/Internal/SetupController.cs`:

| Endpoint                                  | Purpose                                  |
|-------------------------------------------|------------------------------------------|
| `GET /setup/version.txt`                  | Returns the current `version-XXXXXXXXXXXXXXXX` string. |
| `GET /setup/<version>-client.zip`         | Streams a zip of `clients/2020/`. Cached on disk under `StorageDirectory/setup-cache/`. |
| `GET /setup/launcher.exe`                 | Streams the most recent `ZekoroPlayerLauncher.exe` so users can self-update.            |

The version string is a SHA-1 of `RobloxPlayerBeta.exe`'s size+mtime, so any
swap of the bundled client invalidates installs automatically.

## Layout

```
src/
├── main.rs       # eframe entry point, window options, worker thread plumbing
├── ui.rs         # Roblox-style splash drawing (card, logo, progress, ✕)
├── config.rs     # BASE_URL + install path helpers
├── installer.rs  # version resolution, download, unzip, self-copy, URL-scheme registration
└── launcher.rs   # URI parsing + RobloxPlayerBeta.exe argv + spawn pipeline
```

## TODO

- [ ] Bundle a real `ZEKORO` SVG/PNG wordmark and an app icon (`build.rs` +
      `winres` are already wired, just drop a `.ico` next to `Cargo.toml`).
- [ ] Treat the version folder as immutable and clean up older `Versions/*`
      siblings on success.
- [ ] Localised status strings (English-only today).
