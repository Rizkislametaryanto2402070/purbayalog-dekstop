fn main() {
    for path in [
        "icons",
        "icons/icon.ico",
        "icons/32x32.png",
        "icons/128x128.png",
        "icons/128x128@2x.png",
    ] {
        println!("cargo:rerun-if-changed={path}");
    }
    tauri_build::build()
}
