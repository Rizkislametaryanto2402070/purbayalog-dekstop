//! Backend PurbayaLog (Tauri v2).
//!
//! Semua logika bisnis ada di frontend (JavaScript). Backend Rust bertugas pada hal native:
//! penyimpanan data atomik di folder data pengguna, backup pengaman, dan penulisan berkas
//! hasil ekspor. Dialog berkas memakai tauri-plugin-dialog; pembacaan berkas backup pilihan
//! pengguna memakai tauri-plugin-fs (jalur dari dialog otomatis masuk ke scope).

use magang_core::{percent_decode, validate_target, Store};
use tauri::ipc::{InvokeBody, Request};
use tauri::{Manager, State};

struct AppState {
    store: Store,
}

#[tauri::command]
fn data_location(state: State<'_, AppState>) -> String {
    state.store.dir().display().to_string()
}

/// Isi berkas data (teks JSON) atau `null` bila belum pernah disimpan.
#[tauri::command]
fn load_data(state: State<'_, AppState>) -> Result<Option<String>, String> {
    state.store.load().map_err(|e| {
        state.store.log("ERROR", &format!("load_data: {e}"));
        e.to_string()
    })
}

/// Simpan data secara atomik. Versi sebelumnya disimpan sebagai `.bak`.
#[tauri::command]
fn save_data(state: State<'_, AppState>, json: String) -> Result<(), String> {
    state.store.save(&json).map_err(|e| {
        state.store.log("ERROR", &format!("save_data: {e}"));
        e.to_string()
    })
}

/// Salin data aktif ke backups/pre_restore_*.json. Mengembalikan jalur salinan (atau null).
#[tauri::command]
fn safety_backup(state: State<'_, AppState>) -> Result<Option<String>, String> {
    state
        .store
        .safety_backup()
        .map(|p| p.map(|p| p.display().to_string()))
        .map_err(|e| e.to_string())
}

/// Tulis berkas biner (xlsx) atau teks (json backup) ke jalur pilihan pengguna.
/// Badan permintaan = bytes mentah; jalur ada di header `x-path` (percent-encoded).
#[tauri::command]
fn write_file(state: State<'_, AppState>, request: Request<'_>) -> Result<(), String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("Permintaan tulis berkas tidak valid.".into());
    };
    let header = request
        .headers()
        .get("x-path")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| "Jalur berkas tidak ada.".to_string())?;
    let path = percent_decode(header).map_err(|e| e.to_string())?;
    let target = validate_target(&path, &["xlsx", "json"]).map_err(|e| e.to_string())?;
    magang_core::atomic_write(&target, bytes).map_err(|e| {
        state.store.log("ERROR", &format!("write_file: {e}"));
        e.to_string()
    })
}

#[tauri::command]
fn log_message(state: State<'_, AppState>, level: String, message: String) {
    let level = if level == "ERROR" || level == "WARN" {
        level
    } else {
        "INFO".to_string()
    };
    state.store.log(&level, &message);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let default_dir = app.path().app_local_data_dir()?;
            let override_dir = std::env::var("PURBAYALOG_DATA_DIR")
                .ok()
                .or_else(|| std::env::var("MAGANGLOG_DATA_DIR").ok());
            let dir = magang_core::resolve_data_dir(override_dir.as_deref(), default_dir);
            let store = Store::new(dir);
            store.log("INFO", "PurbayaLog dimulai");
            app.manage(AppState { store });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            data_location,
            load_data,
            save_data,
            safety_backup,
            write_file,
            log_message
        ])
        .run(tauri::generate_context!())
        .expect("PurbayaLog gagal dijalankan");
}
