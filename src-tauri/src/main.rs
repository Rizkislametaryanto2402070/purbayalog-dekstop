// Jangan tampilkan jendela konsol tambahan di Windows pada build release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    purbayalog_lib::run()
}
