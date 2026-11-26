use super::*;
use std::sync::atomic::{AtomicUsize, Ordering};

static COUNTER: AtomicUsize = AtomicUsize::new(0);

fn temp_dir(tag: &str) -> PathBuf {
    let n = COUNTER.fetch_add(1, Ordering::SeqCst);
    let dir = std::env::temp_dir().join(format!("magang-core-{tag}-{}-{n}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    dir
}

#[test]
fn atomic_write_creates_and_replaces() {
    let dir = temp_dir("aw");
    let file = dir.join("sub").join("a.json");
    atomic_write(&file, b"{\"a\":1}").unwrap();
    assert_eq!(fs::read(&file).unwrap(), b"{\"a\":1}");
    atomic_write(&file, b"{\"a\":2}").unwrap();
    assert_eq!(fs::read(&file).unwrap(), b"{\"a\":2}");
    let leftovers: Vec<_> = fs::read_dir(file.parent().unwrap()).unwrap().collect();
    assert_eq!(
        leftovers.len(),
        1,
        "tidak boleh ada berkas sementara tersisa"
    );
}

#[test]
fn atomic_write_to_directory_fails_and_keeps_directory() {
    let dir = temp_dir("awdir");
    let target = dir.join("folder.xlsx");
    fs::create_dir(&target).unwrap();
    let err = atomic_write(&target, b"x").unwrap_err();
    assert!(err.0.contains("folder"));
    assert!(target.is_dir());
}

#[test]
fn atomic_write_failure_keeps_old_content() {
    let dir = temp_dir("awfail");
    let file = dir.join("keep.json");
    atomic_write(&file, b"{\"old\":true}").unwrap();
    // induk berupa berkas biasa -> create_dir_all gagal
    let blocked = file.join("child.json");
    assert!(atomic_write(&blocked, b"{}").is_err());
    assert_eq!(fs::read(&file).unwrap(), b"{\"old\":true}");
}

#[test]
fn store_load_returns_none_when_empty_then_roundtrip() {
    let store = Store::new(temp_dir("store"));
    assert_eq!(store.load().unwrap(), None);
    store.save("{\"version\":1}").unwrap();
    assert_eq!(store.load().unwrap().as_deref(), Some("{\"version\":1}"));
}

#[test]
fn store_keeps_previous_version_as_bak() {
    let store = Store::new(temp_dir("bak"));
    store.save("{\"n\":1}").unwrap();
    store.save("{\"n\":2}").unwrap();
    let bak = store.dir().join(format!("{DATA_FILE}{BACKUP_SUFFIX}"));
    assert_eq!(fs::read_to_string(bak).unwrap(), "{\"n\":1}");
    assert_eq!(store.load().unwrap().unwrap(), "{\"n\":2}");
}

#[test]
fn store_rejects_non_object_without_touching_file() {
    let store = Store::new(temp_dir("reject"));
    store.save("{\"ok\":true}").unwrap();
    for bad in ["", "   ", "[1,2]", "bukan json", "{ belum ditutup"] {
        assert!(store.save(bad).is_err(), "harus ditolak: {bad:?}");
    }
    assert_eq!(store.load().unwrap().unwrap(), "{\"ok\":true}");
}

#[test]
fn store_rejects_oversized_payload() {
    let store = Store::new(temp_dir("big"));
    let big = format!("{{\"x\":\"{}\"}}", "a".repeat(MAX_DATA_BYTES));
    assert!(store.save(&big).is_err());
    assert_eq!(store.load().unwrap(), None);
}

#[test]
fn load_rejects_invalid_utf8() {
    let store = Store::new(temp_dir("utf8"));
    fs::write(store.data_file(), [0xff, 0xfe, 0x00]).unwrap();
    assert!(store.load().is_err());
}

#[test]
fn safety_backup_none_without_data_and_copy_with_data() {
    let store = Store::new(temp_dir("safety"));
    assert_eq!(store.safety_backup().unwrap(), None);
    store.save("{\"v\":1}").unwrap();
    let path = store.safety_backup().unwrap().unwrap();
    assert!(path
        .file_name()
        .unwrap()
        .to_string_lossy()
        .starts_with("pre_restore_"));
    assert_eq!(fs::read_to_string(path).unwrap(), "{\"v\":1}");
}

#[test]
fn prune_keeps_newest_only() {
    let store = Store::new(temp_dir("prune"));
    fs::create_dir_all(store.backups_dir()).unwrap();
    for i in 0..5 {
        fs::write(
            store
                .backups_dir()
                .join(format!("pre_restore_2026010{i}_000000.json")),
            "{}",
        )
        .unwrap();
    }
    fs::write(store.backups_dir().join("catatan.txt"), "x").unwrap();
    store.prune_backups(2);
    let mut names: Vec<String> = fs::read_dir(store.backups_dir())
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    names.sort();
    assert_eq!(
        names,
        vec![
            "catatan.txt",
            "pre_restore_20260103_000000.json",
            "pre_restore_20260104_000000.json"
        ]
    );
}

#[test]
fn timestamp_known_values() {
    assert_eq!(format_timestamp(0), "19700101_000000");
    assert_eq!(format_timestamp(951_782_400), "20000229_000000"); // tahun kabisat
    assert_eq!(format_timestamp(1_793_620_245), "20261102_115045");
    assert_eq!(format_timestamp(4_102_444_799), "20991231_235959");
}

#[test]
fn percent_decode_handles_unicode_and_errors() {
    assert_eq!(
        percent_decode("C%3A%5CUsers%5CRizki%5Claporan.xlsx").unwrap(),
        "C:\\Users\\Rizki\\laporan.xlsx"
    );
    assert_eq!(percent_decode("%E2%9C%93").unwrap(), "✓");
    assert_eq!(percent_decode("tanpa-encoding").unwrap(), "tanpa-encoding");
    assert!(percent_decode("%").is_err());
    assert!(percent_decode("%4").is_err());
    assert!(percent_decode("%ZZ").is_err());
    assert!(percent_decode("%FF").is_err()); // bukan UTF-8
}

#[test]
fn validate_target_rules() {
    assert!(validate_target("C:\\x\\a.xlsx", &["xlsx"]).is_ok());
    assert!(validate_target("/tmp/A.XLSX", &["xlsx"]).is_ok());
    assert!(validate_target("", &["xlsx"]).is_err());
    assert!(validate_target("a\0.xlsx", &["xlsx"]).is_err());
    assert!(validate_target("/tmp/a.exe", &["xlsx", "json"]).is_err());
    assert!(validate_target("/tmp/tanpa_ekstensi", &["xlsx"]).is_err());
}

#[test]
fn data_dir_override() {
    let default = PathBuf::from("/default");
    assert_eq!(resolve_data_dir(None, default.clone()), default);
    assert_eq!(resolve_data_dir(Some("  "), default.clone()), default);
    assert_eq!(
        resolve_data_dir(Some("/lain"), default),
        PathBuf::from("/lain")
    );
}

#[test]
fn log_appends_and_strips_newlines() {
    let store = Store::new(temp_dir("log"));
    store.log("INFO", "baris satu\nbaris dua");
    store.log("ERROR", "kedua");
    let text = fs::read_to_string(store.log_file()).unwrap();
    assert_eq!(text.lines().count(), 2);
    assert!(text.contains("baris satubaris dua"));
}

#[test]
fn friendly_permission_message() {
    let err = friendly_io_error("Gagal", &io::Error::from(io::ErrorKind::PermissionDenied));
    assert!(err.0.contains("Excel"));
}
