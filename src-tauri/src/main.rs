// Hide the console window in the release build (without this Windows opens a black terminal beside the app, and closing it closes the app).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// CNCFORGE ERP — desktop entry point.
// All setup lives in lib.rs so the crate can also be linked as a library (Tauri convention).
fn main() {
    cncforge_erp_lib::run()
}
