// Utilitas tanggal/waktu. Tanggal selalu string ISO "YYYY-MM-DD", jam "HH:MM".
// Semua aritmetika memakai UTC agar tidak terpengaruh zona waktu atau DST.
import { DATE_FORMATS, DEFAULT_DATE_FORMAT, MAX_YEAR, MIN_YEAR } from './config.js';

export const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
export const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
export const DAYS = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
export const DAYS_SHORT = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

const pad = (n, w = 2) => String(n).padStart(w, '0');
const ISO_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;

export function isoOf(y, m, d) { return `${pad(y, 4)}-${pad(m)}-${pad(d)}`; }

/** Date UTC dari ISO (tanpa validasi). */
export function utc(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
export function fromUtc(date) { return isoOf(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()); }

export function todayISO(now = new Date()) { return isoOf(now.getFullYear(), now.getMonth() + 1, now.getDate()); }

export function isValidParts(y, m, d) {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  if (m < 1 || m > 12 || d < 1) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function monthFromName(name) {
  const lower = name.toLowerCase();
  for (let i = 0; i < 12; i += 1) {
    if (lower === MONTHS[i].toLowerCase() || lower === MONTHS_SHORT[i].toLowerCase()) return i + 1;
  }
  if (lower === 'agt' || lower === 'ags') return 8;
  if (lower === 'des' || lower === 'dec') return 12;
  return 0;
}

/**
 * Parse tanggal dari beberapa format. Mengembalikan ISO; melempar Error berpesan Indonesia.
 * Dua digit di depan diartikan hari (DD/MM/YYYY); YYYY-MM-DD dikenali dari empat digit di depan.
 */
export function parseDate(value) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error('Tanggal wajib diisi.');
  let y; let m; let d;
  let match = ISO_RE.exec(text);
  if (match) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else if ((match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text))) {
    [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else if ((match = /^(\d{1,2})\s+([A-Za-z]+)\.?\s+(\d{4})$/.exec(text))) {
    d = Number(match[1]); m = monthFromName(match[2]); y = Number(match[3]);
    if (!m) throw new Error(`Nama bulan "${match[2]}" tidak dikenali.`);
  } else {
    throw new Error('Format tanggal tidak dikenali. Contoh: 31/12/2026.');
  }
  if (!isValidParts(y, m, d)) throw new Error('Tanggal tidak ada di kalender.');
  if (y < MIN_YEAR || y > MAX_YEAR) throw new Error(`Tahun harus antara ${MIN_YEAR} dan ${MAX_YEAR}.`);
  return isoOf(y, m, d);
}

export function formatDate(iso, fmt = DEFAULT_DATE_FORMAT) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  switch (fmt) {
    case 'DD-MM-YYYY': return `${pad(d)}-${pad(m)}-${y}`;
    case 'YYYY-MM-DD': return isoOf(y, m, d);
    case 'DD MMM YYYY': return `${pad(d)} ${MONTHS_SHORT[m - 1]} ${y}`;
    default: return `${pad(d)}/${pad(m)}/${y}`;
  }
}
export function isKnownDateFormat(fmt) { return Object.hasOwn(DATE_FORMATS, fmt); }

export function longDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${DAYS[weekday(iso)]}, ${pad(d)} ${MONTHS[m - 1]} ${y}`;
}

/** 0 = Senin ... 6 = Minggu. */
export function weekday(iso) { return (utc(iso).getUTCDay() + 6) % 7; }
export function dayName(iso) { return DAYS[weekday(iso)]; }
export function monthName(month) { return MONTHS[month - 1]; }

export function addDays(iso, n) {
  const dt = utc(iso);
  dt.setUTCDate(dt.getUTCDate() + n);
  return fromUtc(dt);
}
export function daysBetween(a, b) { return Math.round((utc(b) - utc(a)) / 86400000); }
export function daysInclusive(a, b) { return daysBetween(a, b) + 1; }

export function weekRange(iso) {
  const start = addDays(iso, -weekday(iso));
  return [start, addDays(start, 6)];
}
export function monthRange(year, month) {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return [isoOf(year, month, 1), isoOf(year, month, last)];
}

/** Serial tanggal Excel (sistem 1900) dari ISO. 2026-11-02 -> 46328. */
export function excelSerial(iso) { return Math.round(utc(iso) / 86400000) + 25569; }

// ------------------------------------------------------------------ jam
export function parseTime(value) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error('wajib diisi.');
  const match = /^(\d{1,2})[:.](\d{2})$/.exec(text);
  if (!match) throw new Error('format tidak valid. Gunakan HH:MM, contoh 08:30.');
  const h = Number(match[1]); const m = Number(match[2]);
  if (h > 23 || m > 59) throw new Error('jam harus 00:00 sampai 23:59.');
  return `${pad(h)}:${pad(m)}`;
}
export function minutesOf(hhmm) { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; }
export function durationBetween(start, end) { return minutesOf(end) - minutesOf(start); }

export function formatDuration(minutes) {
  const total = Math.round(minutes || 0);
  const h = Math.floor(total / 60); const r = total % 60;
  if (h && r) return `${h} jam ${r} menit`;
  if (h) return `${h} jam`;
  return `${r} menit`;
}
export function formatHours(minutes) { return ((minutes || 0) / 60).toFixed(1).replace('.', ','); }
export function formatClock(minutes) { return `${Math.floor(minutes / 60)}:${pad(minutes % 60)}`; }
