fn main() {
    // The window icon is compiled in by generate_context!; rebuild when the art changes.
    println!("cargo:rerun-if-changed=icons");
    println!("cargo:rerun-if-changed=tauri.conf.json");
    tauri_build::build()
}
