// Lapisan platform: Tauri (Rust + plugin dialog/fs) bila tersedia; cadangan browser untuk pengembangan/pengujian.
const T = globalThis.__TAURI__;
export const isTauri = Boolean(T?.core?.invoke);

const invoke = (cmd, args, opts) => T.core.invoke(cmd, args, opts);
const LS_KEY = 'purbayalog:data';
const browserFiles = new Map(); // jalur semu -> File/Blob (mode browser)
export const lastWritten = { path: null, bytes: null }; // dipakai pengujian mode browser

const msg = (e) => (typeof e === 'string' ? e : (e?.message || String(e)));

export async function loadData() {
  if (isTauri) return invoke('load_data');
  try { return localStorage.getItem(LS_KEY); } catch { return null; }
}

export async function saveData(json) {
  if (isTauri) {
    try { await invoke('save_data', { json }); } catch (e) { throw new Error(msg(e)); }
    return;
  }
  try { localStorage.setItem(LS_KEY, json); } catch (e) { throw new Error(`Penyimpanan browser gagal: ${msg(e)}`); }
}

export async function safetyBackup() {
  if (isTauri) { try { return await invoke('safety_backup'); } catch (e) { throw new Error(msg(e)); } }
  return null;
}

export async function dataLocation() {
  if (isTauri) return invoke('data_location');
  return 'Penyimpanan browser (mode pengembangan)';
}

export function logMessage(level, message) {
  if (isTauri) invoke('log_message', { level, message: String(message).slice(0, 2000) }).catch(() => {});
}

/** Dialog simpan. Mengembalikan jalur atau null bila dibatalkan. */
export async function pickSavePath({ defaultPath, filters }) {
  if (isTauri) return (await T.dialog.save({ defaultPath, filters })) || null;
  return `browser:${defaultPath}`;
}

/** Dialog buka. Mengembalikan jalur atau null bila dibatalkan. */
export async function pickOpenPath({ filters }) {
  if (isTauri) {
    const result = await T.dialog.open({ multiple: false, directory: false, filters });
    return Array.isArray(result) ? (result[0] || null) : (result || null);
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = filters?.flatMap((f) => f.extensions.map((x) => `.${x}`)).join(',') || '';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      const p = `browser:${file.name}`;
      browserFiles.set(p, file);
      resolve(p);
    });
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

export async function readTextFile(path) {
  if (isTauri) { try { return await T.fs.readTextFile(path); } catch (e) { throw new Error(`Berkas tidak dapat dibaca: ${msg(e)}`); } }
  const file = browserFiles.get(path);
  if (!file) throw new Error('Berkas tidak ditemukan.');
  return file.text();
}

/** Tulis berkas secara atomik lewat Rust. `data` = Uint8Array atau string. */
export async function writeFile(path, data) {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  if (isTauri) {
    try { await invoke('write_file', bytes, { headers: { 'x-path': encodeURIComponent(path) } }); } catch (e) { throw new Error(msg(e)); }
    return;
  }
  lastWritten.path = path; lastWritten.bytes = bytes;
  const name = path.replace(/^browser:/, '');
  const url = URL.createObjectURL(new Blob([bytes]));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
