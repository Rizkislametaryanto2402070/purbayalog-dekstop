//! Inti penyimpanan PurbayaLog (hanya `std`, tanpa dependensi).
//!
//! Tanggung jawab:
//! * tulis berkas secara atomik (temp + rename) agar data lama tidak rusak,
//! * menyimpan data aplikasi (satu berkas JSON) dengan salinan `.bak` sebelumnya,
//! * backup pengaman sebelum restore,
//! * validasi jalur tujuan ekspor dan pesan kesalahan yang ramah.
//!
//! Isi JSON divalidasi penuh di sisi JavaScript; di sini hanya pemeriksaan bentuk dasar.

use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

pub const DATA_FILE: &str = "purbayalog-data.json";
pub const BACKUP_SUFFIX: &str = ".bak";
pub const MAX_DATA_BYTES: usize = 64 * 1024 * 1024;
pub const MAX_SAFETY_BACKUPS: usize = 20;
const LOG_LIMIT_BYTES: u64 = 512 * 1024;

/// Kesalahan dengan pesan berbahasa Indonesia yang siap ditampilkan.
#[derive(Debug, PartialEq, Eq)]
pub struct CoreError(pub String);

impl std::fmt::Display for CoreError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for CoreError {}

pub type Result<T> = std::result::Result<T, CoreError>;

/// Ubah `io::Error` menjadi pesan yang dapat dipahami pengguna.
pub fn friendly_io_error(action: &str, err: &io::Error) -> CoreError {
    let detail = match err.kind() {
        io::ErrorKind::PermissionDenied => {
            "Akses ditolak. Berkas mungkin sedang terbuka di aplikasi lain (misalnya Excel) atau folder tidak dapat ditulis."
                .to_string()
        }
        io::ErrorKind::NotFound => "Berkas atau folder tidak ditemukan.".to_string(),
        io::ErrorKind::AlreadyExists => "Berkas sudah ada.".to_string(),
        _ => err.to_string(),
    };
    CoreError(format!("{action}: {detail}"))
}

/// Lokasi folder data. `override_dir` (mis. dari PURBAYALOG_DATA_DIR / MAGANGLOG_DATA_DIR) menang bila tidak kosong.
pub fn resolve_data_dir(override_dir: Option<&str>, default_dir: PathBuf) -> PathBuf {
    match override_dir.map(str::trim) {
        Some(value) if !value.is_empty() => PathBuf::from(value),
        _ => default_dir,
    }
}

/// Tulis `bytes` ke `path` secara atomik: berkas sementara di folder yang sama, lalu rename.
/// Bila gagal, berkas lama tidak berubah dan berkas sementara dibersihkan.
pub fn atomic_write(path: &Path, bytes: &[u8]) -> Result<()> {
    let parent = path
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from("."));
    fs::create_dir_all(&parent)
        .map_err(|e| friendly_io_error("Folder tujuan tidak dapat dibuat", &e))?;
    if path.is_dir() {
        return Err(CoreError(format!(
            "Tujuan berupa folder, bukan berkas: {}",
            path.display()
        )));
    }
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "data".into());
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let temp = parent.join(format!(".{name}.{}.{nonce}.tmp", std::process::id()));

    let write_result = (|| -> io::Result<()> {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        Ok(())
    })();
    if let Err(e) = write_result {
        let _ = fs::remove_file(&temp);
        return Err(friendly_io_error("Berkas tidak dapat ditulis", &e));
    }
    if let Err(e) = fs::rename(&temp, path) {
        let _ = fs::remove_file(&temp);
        return Err(friendly_io_error("Berkas tidak dapat ditulis", &e));
    }
    Ok(())
}

/// Dekode percent-encoding (hasil `encodeURIComponent`) menjadi String UTF-8.
pub fn percent_decode(input: &str) -> Result<String> {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            if i + 2 >= bytes.len() {
                return Err(CoreError("Jalur berkas tidak valid.".into()));
            }
            let hex = std::str::from_utf8(&bytes[i + 1..i + 3])
                .map_err(|_| CoreError("Jalur berkas tidak valid.".into()))?;
            let value = u8::from_str_radix(hex, 16)
                .map_err(|_| CoreError("Jalur berkas tidak valid.".into()))?;
            out.push(value);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).map_err(|_| CoreError("Jalur berkas tidak valid.".into()))
}

/// Periksa jalur tujuan tulis dari UI: tidak kosong, tanpa NUL, ekstensi diizinkan.
pub fn validate_target(path: &str, allowed_exts: &[&str]) -> Result<PathBuf> {
    let trimmed = path.trim();
    if trimmed.is_empty() || trimmed.contains('\0') {
        return Err(CoreError("Jalur berkas tidak valid.".into()));
    }
    let target = PathBuf::from(trimmed);
    let ext = target
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    if !allowed_exts.iter().any(|allowed| *allowed == ext) {
        return Err(CoreError(format!(
            "Jenis berkas tidak diizinkan (.{ext}). Yang diizinkan: {}.",
            allowed_exts.join(", ")
        )));
    }
    if target.file_name().is_none() {
        return Err(CoreError("Nama berkas tidak valid.".into()));
    }
    Ok(target)
}

/// Pemeriksaan bentuk dasar: objek JSON tidak kosong. Validasi isi dilakukan di JavaScript.
pub fn looks_like_json_object(text: &str) -> bool {
    let t = text.trim();
    t.len() >= 2 && t.starts_with('{') && t.ends_with('}')
}

/// Format `YYYYMMDD_HHMMSS` (UTC) dari detik sejak epoch.
pub fn format_timestamp(secs: u64) -> String {
    let days = (secs / 86_400) as i64;
    let rem = secs % 86_400;
    // Algoritma civil_from_days (Howard Hinnant).
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!(
        "{y:04}{m:02}{d:02}_{:02}{:02}{:02}",
        rem / 3600,
        (rem % 3600) / 60,
        rem % 60
    )
}

pub fn now_timestamp() -> String {
    format_timestamp(
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0),
    )
}

/// Akses ke folder data aplikasi.
#[derive(Debug, Clone)]
pub struct Store {
    dir: PathBuf,
}

impl Store {
    pub fn new(dir: PathBuf) -> Self {
        Store { dir }
    }

    pub fn dir(&self) -> &Path {
        &self.dir
    }
    pub fn data_file(&self) -> PathBuf {
        self.dir.join(DATA_FILE)
    }
    pub fn backups_dir(&self) -> PathBuf {
        self.dir.join("backups")
    }
    pub fn log_file(&self) -> PathBuf {
        self.dir.join("logs").join("purbayalog.log")
    }

    /// Baca data. `None` bila belum ada berkas (pemakaian pertama).
    pub fn load(&self) -> Result<Option<String>> {
        match fs::read(self.data_file()) {
            Ok(bytes) => String::from_utf8(bytes)
                .map(Some)
                .map_err(|_| CoreError("Berkas data bukan teks UTF-8 yang valid.".into())),
            Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(friendly_io_error("Data tidak dapat dibaca", &e)),
        }
    }

    /// Simpan data; versi sebelumnya disalin ke `.bak` terlebih dahulu.
    pub fn save(&self, json: &str) -> Result<()> {
        if json.len() > MAX_DATA_BYTES {
            return Err(CoreError("Data terlalu besar untuk disimpan.".into()));
        }
        if !looks_like_json_object(json) {
            return Err(CoreError("Data ditolak: bukan objek JSON.".into()));
        }
        let file = self.data_file();
        if file.is_file() {
            let bak = self.dir.join(format!("{DATA_FILE}{BACKUP_SUFFIX}"));
            // Kegagalan membuat .bak tidak boleh menggagalkan penyimpanan utama.
            let _ = fs::copy(&file, &bak);
        }
        atomic_write(&file, json.as_bytes())
    }

    /// Salin data aktif ke `backups/pre_restore_<waktu>.json`. `None` bila belum ada data.
    pub fn safety_backup(&self) -> Result<Option<PathBuf>> {
        let source = self.data_file();
        if !source.is_file() {
            return Ok(None);
        }
        let bytes =
            fs::read(&source).map_err(|e| friendly_io_error("Backup pengaman gagal", &e))?;
        let target = self
            .backups_dir()
            .join(format!("pre_restore_{}.json", now_timestamp()));
        atomic_write(&target, &bytes)?;
        self.prune_backups(MAX_SAFETY_BACKUPS);
        Ok(Some(target))
    }

    /// Simpan hanya `keep` backup pengaman terbaru (urut nama = urut waktu).
    pub fn prune_backups(&self, keep: usize) {
        let Ok(entries) = fs::read_dir(self.backups_dir()) else {
            return;
        };
        let mut names: Vec<PathBuf> = entries
            .filter_map(|e| e.ok().map(|e| e.path()))
            .filter(|p| {
                p.file_name()
                    .map(|n| n.to_string_lossy().starts_with("pre_restore_"))
                    .unwrap_or(false)
            })
            .collect();
        names.sort();
        if names.len() > keep {
            for old in &names[..names.len() - keep] {
                let _ = fs::remove_file(old);
            }
        }
    }

    /// Tambahkan satu baris log; berkas dipotong bila melebihi batas.
    pub fn log(&self, level: &str, message: &str) {
        let path = self.log_file();
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if fs::metadata(&path)
            .map(|m| m.len() > LOG_LIMIT_BYTES)
            .unwrap_or(false)
        {
            let _ = fs::rename(&path, path.with_extension("log.old"));
        }
        let clean: String = message
            .chars()
            .filter(|c| *c != '\n' && *c != '\r')
            .take(2000)
            .collect();
        if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&path) {
            let _ = writeln!(file, "{} [{}] {}", now_timestamp(), level, clean);
        }
    }
}

#[cfg(test)]
mod tests;
