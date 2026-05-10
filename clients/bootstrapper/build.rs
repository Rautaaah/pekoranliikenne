// Build-time setup for the bootstrapper:
//
//   * Convert the source `icon.png` into a multi-resolution `icon.ico`
//     (`OUT_DIR/icon.ico`) so we can embed it as the Windows `.exe` file
//     icon via `winres`.
//   * Tell Cargo to re-run if either `icon.png` or this script change.
//
// This only runs on Windows targets; on other platforms we no-op so the
// crate still compiles for cross-build / CI sanity checks.

fn main() {
    println!("cargo:rerun-if-changed=icon.png");
    println!("cargo:rerun-if-changed=build.rs");

    #[cfg(windows)]
    embed_windows_icon();
}

#[cfg(windows)]
fn embed_windows_icon() {
    use std::path::PathBuf;

    let manifest_dir = PathBuf::from(std::env::var_os("CARGO_MANIFEST_DIR").unwrap());
    let png_path = manifest_dir.join("icon.png");
    if !png_path.is_file() {
        println!("cargo:warning=icon.png missing, skipping .exe icon embed");
        return;
    }

    let out_dir = PathBuf::from(std::env::var_os("OUT_DIR").unwrap());
    let ico_path = out_dir.join("icon.ico");

    if let Err(err) = build_ico(&png_path, &ico_path) {
        println!("cargo:warning=could not build {}: {err}", ico_path.display());
        return;
    }

    let mut res = winres::WindowsResource::new();
    res.set_icon(ico_path.to_str().expect("icon path utf-8"));
    if let Err(err) = res.compile() {
        println!("cargo:warning=winres compile failed: {err}");
    }
}

#[cfg(windows)]
fn build_ico(png: &std::path::Path, ico: &std::path::Path) -> Result<(), Box<dyn std::error::Error>> {
    use std::fs::File;
    use std::io::BufWriter;

    let img = image::open(png)?.to_rgba8();

    // Multi-size .ico for crisp display at every shell zoom level. Anything
    // bigger than the source image gets a Lanczos upscale, which is fine for
    // the modest sizes Windows actually uses.
    let sizes = [16u32, 24, 32, 48, 64, 128, 256];

    let mut dir = ico::IconDir::new(ico::ResourceType::Icon);
    for size in sizes {
        let resized = image::imageops::resize(&img, size, size, image::imageops::FilterType::Lanczos3);
        let raw = resized.into_raw();
        let entry = ico::IconImage::from_rgba_data(size, size, raw);
        dir.add_entry(ico::IconDirEntry::encode(&entry)?);
    }
    let writer = BufWriter::new(File::create(ico)?);
    dir.write(writer)?;
    Ok(())
}
