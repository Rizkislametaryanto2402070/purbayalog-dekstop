// Aksi yang menyentuh berkas: export Excel, backup, restore. Memakai lapisan platform (dialog + Rust).
import { backupFilename, parseBackup } from './core/backup.js';
import { todayISO } from './core/dates.js';
import { BackupError, ExportError } from './core/errors.js';
import { makePeriod, buildReport } from './core/report.js';
import { EXPORT_SCOPES, buildWorkbook, defaultFilename } from './core/xlsx.js';
import * as platform from './platform.js';

const pad = (n) => String(n).padStart(2, '0');
export function stampNow(d = new Date()) {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/** Export laporan. Mengembalikan jalur berkas, atau null bila dialog dibatalkan. */
export async function exportReport({ store, period, scope }) {
  const def = EXPORT_SCOPES[scope];
  if (!def) throw new ExportError('Jenis export tidak dikenal.');
  const effective = def.wholeData ? makePeriod('all') : period;
  const report = buildReport(store, effective);
  const JSZip = globalThis.JSZip;
  if (!JSZip) throw new ExportError('Komponen JSZip tidak termuat.');
  const bytes = await buildWorkbook(JSZip, {
    profile: store.getProfile(), periodLabel: effective.label, activities: report.activities, tasks: report.tasks,
    summary: report, dateFormat: store.dateFormat, sheets: def.sheets,
  });
  const profile = store.getProfile();
  const path = await platform.pickSavePath({
    defaultPath: defaultFilename(profile.full_name, todayISO(), profile.program_type),
    filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }],
  });
  if (!path) return null;
  try { await platform.writeFile(path, bytes); } catch (e) { throw new ExportError(e.message); }
  platform.logMessage('INFO', 'Laporan Excel dibuat');
  return path;
}

export async function backupData({ store }) {
  await store.flush();
  const path = await platform.pickSavePath({ defaultPath: backupFilename(stampNow()), filters: [{ name: 'Backup PurbayaLog', extensions: ['json'] }] });
  if (!path) return null;
  const text = store.snapshot();
  try { await platform.writeFile(path, text); } catch (e) { throw new BackupError(`Backup gagal: ${e.message}`); }
  if (platform.isTauri) {
    // Verifikasi: baca ulang berkas hasil tulis dan pastikan valid.
    try { parseBackup(await platform.readTextFile(path)); } catch (e) { throw new BackupError(`Backup tertulis tetapi gagal diverifikasi: ${e.message}`); }
  }
  return path;
}

/** Langkah 1 restore: pilih dan validasi berkas. Mengembalikan {path, state} atau null. */
export async function pickBackup() {
  const path = await platform.pickOpenPath({ filters: [{ name: 'Backup PurbayaLog', extensions: ['json'] }] });
  if (!path) return null;
  const text = await platform.readTextFile(path);
  return { path, state: parseBackup(text) };
}

/** Langkah 2 restore: backup pengaman data aktif, lalu ganti data. Data aktif tidak berubah bila pengaman gagal. */
export async function applyRestore({ store }, state) {
  await store.flush();
  const safety = await platform.safetyBackup();
  store.replaceState(state);
  await store.flush();
  return safety;
}
