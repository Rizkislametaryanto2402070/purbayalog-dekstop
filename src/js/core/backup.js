// Validasi berkas backup (JSON) sebelum dipulihkan. Data aktif tidak disentuh bila validasi gagal.
import { DATE_FORMATS, DEFAULT_PROGRAM_TYPE, PROGRAM_TYPES, SCHEMA_VERSION } from './config.js';
import { BackupError } from './errors.js';
import { APP_MARKER, LEGACY_APP_MARKERS, emptyState } from './store.js';
import { PROFILE_TEXT_FIELDS, validateActivity, validateTask } from './validators.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Parse + validasi teks backup. Mengembalikan state ternormalisasi atau melempar BackupError. */
export function parseBackup(text) {
  let raw;
  try { raw = JSON.parse(text); } catch { throw new BackupError('Berkas bukan data PurbayaLog yang valid (bukan JSON yang utuh atau berkas rusak).'); }
  if (!isObj(raw) || (raw.app !== APP_MARKER && !LEGACY_APP_MARKERS.includes(raw.app))) throw new BackupError('Berkas ini bukan backup PurbayaLog.');
  if (!Number.isInteger(raw.version) || raw.version < 1) throw new BackupError('Versi data pada berkas tidak valid.');
  if (raw.version > SCHEMA_VERSION) throw new BackupError('Berkas dibuat oleh versi PurbayaLog yang lebih baru. Perbarui aplikasi terlebih dahulu.');
  for (const key of ['categories', 'activities', 'tasks']) {
    if (!Array.isArray(raw[key])) throw new BackupError(`Berkas tidak lengkap: bagian "${key}" tidak ada.`);
  }
  if (!isObj(raw.profile) || !isObj(raw.settings)) throw new BackupError('Berkas tidak lengkap: profil atau pengaturan tidak ada.');

  const state = emptyState();
  const seenCat = new Set();
  state.categories = raw.categories.map((c, i) => {
    if (!isObj(c) || !Number.isInteger(c.id) || typeof c.name !== 'string' || !c.name.trim() || seenCat.has(c.id)) {
      throw new BackupError(`Kategori ke-${i + 1} tidak valid.`);
    }
    seenCat.add(c.id);
    return { id: c.id, name: c.name.trim() };
  });

  const seenAct = new Set();
  state.activities = raw.activities.map((a, i) => {
    if (!isObj(a) || !Number.isInteger(a.id) || seenAct.has(a.id)) throw new BackupError(`Kegiatan ke-${i + 1} tidak valid (id).`);
    seenAct.add(a.id);
    try {
      const cleaned = validateActivity(a, seenCat);
      return { ...cleaned, id: a.id, created_at: String(a.created_at || ''), updated_at: String(a.updated_at || '') };
    } catch (e) { throw new BackupError(`Kegiatan ke-${i + 1} tidak valid: ${e.message}`); }
  });

  const seenTask = new Set();
  state.tasks = raw.tasks.map((t, i) => {
    if (!isObj(t) || !Number.isInteger(t.id) || seenTask.has(t.id)) throw new BackupError(`Tugas ke-${i + 1} tidak valid (id).`);
    seenTask.add(t.id);
    try { return { ...validateTask(t), id: t.id }; } catch (e) { throw new BackupError(`Tugas ke-${i + 1} tidak valid: ${e.message}`); }
  });

  for (const key of [...PROFILE_TEXT_FIELDS, 'internship_start', 'internship_end']) {
    state.profile[key] = typeof raw.profile[key] === 'string' ? raw.profile[key] : '';
  }
  state.profile.program_type = Object.hasOwn(PROGRAM_TYPES, raw.profile.program_type)
    ? raw.profile.program_type
    : DEFAULT_PROGRAM_TYPE;
  state.settings.theme = raw.settings.theme === 'dark' ? 'dark' : 'light';
  state.settings.date_format = Object.hasOwn(DATE_FORMATS, raw.settings.date_format) ? raw.settings.date_format : state.settings.date_format;

  const next = (items, min) => Math.max(min, ...items.map((x) => x.id + 1));
  state.counters = {
    activity: Math.max(Number(raw.counters?.activity) || 1, next(state.activities, 1)),
    task: Math.max(Number(raw.counters?.task) || 1, next(state.tasks, 1)),
    category: Math.max(Number(raw.counters?.category) || 1, next(state.categories, 1)),
  };
  return state;
}

/** Muat data aktif dari teks berkas data; teks rusak -> BackupError (UI menawarkan memakai .bak). */
export function loadState(text) {
  if (text == null) return emptyState();
  return parseBackup(text);
}

export function backupFilename(stamp) { return `PurbayaLog_Backup_${stamp}.json`; }
