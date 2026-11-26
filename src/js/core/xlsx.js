// Pembuat berkas .xlsx (OpenXML SpreadsheetML) memakai JSZip. Tanpa akses jaringan atau data.
// Struktur dan gaya mengikuti versi Python: 4 sheet, tanggal asli, durasi [h]:mm, freeze pane, filter, setup cetak.
import {
  DATE_FORMATS, DEFAULT_DATE_FORMAT, DEFAULT_PROGRAM_TYPE, DEFAULT_REPORT_OWNER, PRIORITIES, PROGRAM_TYPES, STATUSES, APP_NAME,
} from './config.js';
import { MONTHS, dayName, excelSerial, formatDate, todayISO } from './dates.js';
import { ExportError } from './errors.js';
import { safeFilename } from './helpers.js';

export const SHEET_ACTIVITIES = 'Data Kegiatan';
export const SHEET_SUMMARY = 'Rekapitulasi';
export const SHEET_TASKS = 'Daftar Tugas';
export const SHEET_REFLECTION = 'Refleksi';
export const SHEET_MATRIX = 'Matriks Program';
export const ALL_SHEETS = [SHEET_ACTIVITIES, SHEET_SUMMARY, SHEET_TASKS, SHEET_REFLECTION, SHEET_MATRIX];

export const EXPORT_SCOPES = {
  all: { label: 'Seluruh kegiatan', sheets: ALL_SHEETS, wholeData: true },
  period: { label: 'Kegiatan pada periode terpilih', sheets: ALL_SHEETS, wholeData: false },
  matrix: { label: 'Matriks program kegiatan', sheets: [SHEET_MATRIX], wholeData: false },
  recap: { label: 'Rekapitulasi periode terpilih', sheets: [SHEET_SUMMARY], wholeData: false },
  tasks: { label: 'Daftar tugas', sheets: [SHEET_TASKS], wholeData: false },
};

const ACTIVITY_HEADERS = ['Nomor', 'Tanggal', 'Hari', 'Jam Mulai', 'Jam Selesai', 'Durasi', 'Nama Kegiatan', 'Kategori', 'Deskripsi', 'Hasil', 'Kendala', 'Solusi', 'Refleksi', 'Ket.'];
const TASK_HEADERS = ['Nomor', 'Nama Tugas', 'Deskripsi', 'Prioritas', 'Status', 'Tanggal Dibuat', 'Deadline', 'Catatan Hasil'];
const REFLECTION_HEADERS = ['Tanggal', 'Nama Kegiatan', 'Pembelajaran', 'Kendala', 'Solusi', 'Refleksi'];

// Indeks gaya (cellXfs) -- urutan harus sama dengan stylesXml().
const S = {
  DEFAULT: 0, TITLE: 1, SUBTITLE: 2, HEADER: 3, BODY: 4, BODY_CENTER: 5, DATE: 6, TIME: 7, DURATION: 8,
  SECTION: 9, LABEL: 10, VALUE: 11, VALUE_INT: 12, VALUE_DURATION: 13, PERCENT: 14,
  TITLE_CENTER: 15, BOLD_BORDER_CENTER: 16, BOLD_BORDER_LEFT: 17, DURATION_BOLD: 18,
  HOURS_NUM: 19, HOURS_NUM_BOLD: 20, MATRIX_BLUE: 21, MATRIX_YELLOW: 22,
  SIGN_CENTER: 23, SIGN_NAME: 24, SIGN_ID: 25,
};

export function colLetter(n) {
  let s = ''; let x = n;
  while (x > 0) { const r = (x - 1) % 26; s = String.fromCharCode(65 + r) + s; x = Math.floor((x - 1) / 26); }
  return s;
}

export function escapeXml(value) {
  return String(value)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function programTag(programType = DEFAULT_PROGRAM_TYPE) {
  if (!programType || programType === DEFAULT_PROGRAM_TYPE) return '';
  return PROGRAM_TYPES[programType] || '';
}

export function defaultFilename(profileName = '', today = todayISO(), programType = DEFAULT_PROGRAM_TYPE) {
  const trimmed = String(profileName || '').trim();
  const first = trimmed ? trimmed.split(/\s+/)[0] : DEFAULT_REPORT_OWNER;
  const prefix = programTag(programType) || 'Kegiatan';
  return `Laporan_${prefix}_${safeFilename(first, DEFAULT_REPORT_OWNER)}_${today.replaceAll('-', '')}.xlsx`;
}

// ------------------------------------------------------------------ model sheet
class Sheet {
  constructor(name) {
    this.name = name;
    this.cells = new Map(); // row -> Map(col -> {v,s})
    this.widths = [];
    this.heights = new Map();
    this.merges = [];
    this.freeze = null; // {col,row} sel kiri-atas area bergulir
    this.filter = null;
    this.printTitleRow = null;
    this.landscape = true;
    this.maxRow = 0;
    this.maxCol = 1;
  }

  set(row, col, v, s = S.DEFAULT) {
    if (!this.cells.has(row)) this.cells.set(row, new Map());
    this.cells.get(row).set(col, { v, s });
    this.maxRow = Math.max(this.maxRow, row);
    this.maxCol = Math.max(this.maxCol, col);
  }

  xml() {
    const rows = [...this.cells.keys()].sort((a, b) => a - b);
    const sheetData = rows.map((r) => {
      const ht = this.heights.get(r);
      const attrs = ht ? ` ht="${ht}" customHeight="1"` : '';
      const cols = [...this.cells.get(r).entries()].sort((a, b) => a[0] - b[0]).map(([c, cell]) => cellXml(r, c, cell)).join('');
      return `<row r="${r}"${attrs}>${cols}</row>`;
    }).join('');
    const lastCol = colLetter(this.maxCol);
    const pane = this.freeze
      ? `<pane xSplit="${this.freeze.col - 1}" ySplit="${this.freeze.row - 1}" topLeftCell="${colLetter(this.freeze.col)}${this.freeze.row}" activePane="bottomRight" state="frozen"/>`
        + `<selection pane="topRight"/><selection pane="bottomLeft"/><selection pane="bottomRight" activeCell="${colLetter(this.freeze.col)}${this.freeze.row}" sqref="${colLetter(this.freeze.col)}${this.freeze.row}"/>`
      : '';
    const cols = this.widths.length
      ? `<cols>${this.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
    const merges = this.merges.length
      ? `<mergeCells count="${this.merges.length}">${this.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '';
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
      + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
      + '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>'
      + `<dimension ref="A1:${lastCol}${Math.max(1, this.maxRow)}"/>`
      + `<sheetViews><sheetView workbookViewId="0" showGridLines="1">${pane}</sheetView></sheetViews>`
      + '<sheetFormatPr defaultRowHeight="15"/>'
      + cols
      + `<sheetData>${sheetData}</sheetData>`
      + (this.filter ? `<autoFilter ref="${this.filter}"/>` : '')
      + merges
      + '<printOptions horizontalCentered="1"/>'
      + '<pageMargins left="0.5" right="0.5" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>'
      + `<pageSetup paperSize="9" orientation="${this.landscape ? 'landscape' : 'portrait'}" fitToWidth="1" fitToHeight="0"/>`
      + '</worksheet>';
  }
}

function cellXml(row, col, { v, s }) {
  const ref = `${colLetter(col)}${row}`;
  if (v === null || v === undefined || v === '') return `<c r="${ref}" s="${s}"/>`;
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new ExportError(`Nilai angka tidak valid di sel ${ref}.`);
    return `<c r="${ref}" s="${s}"><v>${v}</v></c>`;
  }
  return `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(v)}</t></is></c>`;
}

// ------------------------------------------------------------------- gaya
function stylesXml(xlDate) {
  const border = (c) => `<left style="thin"><color rgb="FF${c}"/></left><right style="thin"><color rgb="FF${c}"/></right><top style="thin"><color rgb="FF${c}"/></top><bottom style="thin"><color rgb="FF${c}"/></bottom><diagonal/>`;
  const font = (extra, sz = 11, color = null) => `<font>${extra}<sz val="${sz}"/>${color ? `<color rgb="FF${color}"/>` : ''}<name val="Calibri"/><family val="2"/></font>`;
  const fonts = [
    font(''),
    font('<b/>', 11),
    font('<b/>', 12),
    font('', 10, '333333'),
    font('<b/><u/>', 11),
  ];
  const xf = (fontId, fillId, borderId, numFmtId, align) => `<xf numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0"`
    + `${numFmtId ? ' applyNumberFormat="1"' : ''}${fontId ? ' applyFont="1"' : ''}${fillId ? ' applyFill="1"' : ''}${borderId ? ' applyBorder="1"' : ''}${align ? ' applyAlignment="1">' + align + '</xf>' : '/>'}`;
  const top = '<alignment vertical="top" wrapText="1"/>';
  const center = '<alignment horizontal="center" vertical="center"/>';
  const left = '<alignment horizontal="left" vertical="top" wrapText="1"/>';
  const xfs = [
    xf(0, 0, 0, 0, null), // 0 DEFAULT
    xf(2, 0, 0, 0, '<alignment horizontal="left" vertical="center"/>'), // 1 TITLE
    xf(3, 0, 0, 0, '<alignment horizontal="left" vertical="center"/>'), // 2 SUBTITLE
    xf(1, 0, 1, 0, '<alignment horizontal="center" vertical="center" wrapText="1"/>'), // 3 HEADER
    xf(0, 0, 1, 0, top), // 4 BODY
    xf(0, 0, 1, 0, center), // 5 BODY_CENTER
    xf(0, 0, 1, 164, center), // 6 DATE
    xf(0, 0, 1, 165, center), // 7 TIME
    xf(0, 0, 1, 166, center), // 8 DURATION
    xf(1, 0, 0, 0, null), // 9 SECTION
    xf(1, 2, 1, 0, '<alignment vertical="top"/>'), // 10 LABEL
    xf(0, 0, 1, 0, left), // 11 VALUE
    xf(0, 0, 1, 1, left), // 12 VALUE_INT
    xf(0, 0, 1, 166, left), // 13 VALUE_DURATION
    xf(0, 0, 1, 167, center), // 14 PERCENT
    xf(2, 0, 0, 0, '<alignment horizontal="center" vertical="center"/>'), // 15 TITLE_CENTER
    xf(1, 0, 1, 0, '<alignment horizontal="center" vertical="center" wrapText="1"/>'), // 16 BOLD_BORDER_CENTER
    xf(1, 0, 1, 0, '<alignment horizontal="left" vertical="center" wrapText="1"/>'), // 17 BOLD_BORDER_LEFT
    xf(1, 0, 1, 166, center), // 18 DURATION_BOLD
    xf(0, 0, 1, 168, center), // 19 HOURS_NUM
    xf(1, 0, 1, 168, center), // 20 HOURS_NUM_BOLD
    xf(0, 3, 1, 0, center), // 21 MATRIX_BLUE
    xf(0, 4, 1, 0, center), // 22 MATRIX_YELLOW
    xf(0, 0, 0, 0, center), // 23 SIGN_CENTER
    xf(4, 0, 0, 0, center), // 24 SIGN_NAME
    xf(1, 0, 0, 0, center), // 25 SIGN_ID
  ];
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + `<numFmts count="5"><numFmt numFmtId="164" formatCode="${escapeXml(xlDate)}"/><numFmt numFmtId="165" formatCode="hh:mm"/><numFmt numFmtId="166" formatCode="[h]:mm"/><numFmt numFmtId="167" formatCode="0.0%"/><numFmt numFmtId="168" formatCode="0.##"/></numFmts>`
    + `<fonts count="${fonts.length}">${fonts.join('')}</fonts>`
    + '<fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
    + '<fill><patternFill patternType="solid"><fgColor rgb="FFF2F2F2"/><bgColor indexed="64"/></patternFill></fill>'
    + '<fill><patternFill patternType="solid"><fgColor rgb="FF4FC3F7"/><bgColor indexed="64"/></patternFill></fill>'
    + '<fill><patternFill patternType="solid"><fgColor rgb="FFFFD54F"/><bgColor indexed="64"/></patternFill></fill></fills>'
    + `<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border>${border('000000')}</border></borders>`
    + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    + `<cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs>`
    + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
    + '</styleSheet>';
}

// ------------------------------------------------------------- pembangun sheet
const toDate = (iso) => (iso ? excelSerial(iso) : '');
const toTimeFraction = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return (h * 60 + m) / 1440; };
const minutesFraction = (min) => min / 1440;
const roundHours = (min) => Math.round(((min || 0) / 60) * 100) / 100;

function setMerged(sheet, r1, c1, r2, c2, value, style = S.DEFAULT) {
  for (let r = r1; r <= r2; r += 1) {
    for (let c = c1; c <= c2; c += 1) {
      sheet.set(r, c, r === r1 && c === c1 ? value : '', style);
    }
  }
  if (r1 !== r2 || c1 !== c2) {
    sheet.merges.push(`${colLetter(c1)}${r1}:${colLetter(c2)}${r2}`);
  }
}

function formatIdLine(rawId, defaultPrefix) {
  const trimmed = String(rawId || '').trim();
  if (!trimmed) return `${defaultPrefix}. -`;
  if (/^(NIP|BNIP|NUPTK|NIDN|NIM)\b/i.test(trimmed)) return trimmed;
  return `${defaultPrefix}.${trimmed}`;
}

function appendSignatureBlock(sheet, afterRow, profile, [leftCols, midCols, rightCols]) {
  const r = afterRow + 3;
  setMerged(sheet, r, midCols[0], r, midCols[1], 'Mengetahui', S.SIGN_CENTER);
  setMerged(sheet, r + 1, leftCols[0], r + 1, leftCols[1], 'Pembimbing Instansi', S.SIGN_CENTER);
  setMerged(sheet, r + 1, midCols[0], r + 1, midCols[1], 'Dosen Pembimbing', S.SIGN_CENTER);
  setMerged(sheet, r + 1, rightCols[0], r + 1, rightCols[1], 'Mahasiswa', S.SIGN_CENTER);

  const supName = String(profile.supervisor || '').trim() || '........................................';
  const acadName = String(profile.academic_supervisor || '').trim() || '........................................';
  const stuName = String(profile.full_name || '').trim() || '........................................';

  setMerged(sheet, r + 5, leftCols[0], r + 5, leftCols[1], supName, S.SIGN_NAME);
  setMerged(sheet, r + 5, midCols[0], r + 5, midCols[1], acadName, S.SIGN_NAME);
  setMerged(sheet, r + 5, rightCols[0], r + 5, rightCols[1], stuName, S.SIGN_NAME);

  setMerged(sheet, r + 6, leftCols[0], r + 6, leftCols[1], formatIdLine(profile.supervisor_id, 'NIP'), S.SIGN_ID);
  setMerged(sheet, r + 6, midCols[0], r + 6, midCols[1], formatIdLine(profile.academic_supervisor_id, 'NUPTK'), S.SIGN_ID);
  setMerged(sheet, r + 6, rightCols[0], r + 6, rightCols[1], formatIdLine(profile.student_id, 'NIM'), S.SIGN_ID);
  return r + 6;
}

function titleBlock(sheet, title, subtitle) {
  sheet.set(1, 1, title, S.TITLE);
  sheet.set(2, 1, subtitle, S.SUBTITLE);
  sheet.heights.set(1, 22);
  return 4;
}
function headerRow(sheet, row, headers) {
  headers.forEach((h, i) => sheet.set(row, i + 1, h, S.HEADER));
  sheet.heights.set(row, 22);
}
const finishTable = (sheet, headerRowNo, lastRow, cols, freezeCol = 3) => {
  sheet.freeze = { col: freezeCol, row: headerRowNo + 1 };
  sheet.filter = `A${headerRowNo}:${colLetter(cols)}${Math.max(lastRow, headerRowNo + 1)}`;
  sheet.printTitleRow = headerRowNo;
  sheet.printLast = { col: cols, row: Math.max(lastRow, headerRowNo) };
};

function activitiesSheet(profile, periodLabel, activities) {
  const sheet = new Sheet(SHEET_ACTIVITIES);
  const tag = programTag(profile.program_type);
  const hr = titleBlock(sheet, tag ? `Data Kegiatan ${tag}` : 'Data Kegiatan', `${profile.full_name || '-'}  |  Periode: ${periodLabel}`);
  headerRow(sheet, hr, ACTIVITY_HEADERS);
  let row = hr;
  let totalMinutes = 0;
  activities.forEach((a, i) => {
    row += 1;
    totalMinutes += a.duration_minutes || 0;
    const values = [i + 1, toDate(a.date), dayName(a.date), toTimeFraction(a.start_time), toTimeFraction(a.end_time),
      minutesFraction(a.duration_minutes), a.title, a.category_name || '', a.description || '', a.result || '',
      a.obstacle || '', a.solution || '', a.reflection || '', ''];
    const styles = [S.BODY_CENTER, S.DATE, S.BODY_CENTER, S.TIME, S.TIME, S.DURATION, S.BODY, S.BODY, S.BODY, S.BODY, S.BODY, S.BODY, S.BODY, S.BODY];
    values.forEach((v, c) => sheet.set(row, c + 1, v, styles[c]));
  });
  sheet.widths = [6, 12, 10, 10, 11, 10, 32, 15, 38, 34, 28, 28, 32, 12];
  finishTable(sheet, hr, row, ACTIVITY_HEADERS.length);

  const totRow = row + 1;
  setMerged(sheet, totRow, 1, totRow, 5, 'JUMLAH JAM KEGIATAN', S.BOLD_BORDER_CENTER);
  sheet.set(totRow, 6, minutesFraction(totalMinutes), S.DURATION_BOLD);
  setMerged(sheet, totRow, 7, totRow, 13, '', S.BOLD_BORDER_CENTER);
  sheet.set(totRow, 14, `${roundHours(totalMinutes)} jam`, S.BOLD_BORDER_CENTER);
  sheet.heights.set(totRow, 20);

  const lastSigRow = appendSignatureBlock(sheet, totRow, profile, [[1, 4], [6, 9], [11, 14]]);
  sheet.printLast = { col: ACTIVITY_HEADERS.length, row: lastSigRow };
  return sheet;
}

function summarySheet(profile, periodLabel, summary, dateFormat) {
  const sheet = new Sheet(SHEET_SUMMARY);
  const tag = programTag(profile.program_type);
  titleBlock(sheet, tag ? `Rekapitulasi Kegiatan ${tag}` : 'Rekapitulasi Kegiatan', `Periode laporan: ${periodLabel}`);
  let row = 4;
  const section = (text) => { sheet.set(row, 1, text, S.SECTION); row += 1; };
  const pair = (label, value, style = S.VALUE) => {
    sheet.set(row, 1, label, S.LABEL);
    sheet.set(row, 2, value, style);
    sheet.set(row, 3, '', style); sheet.set(row, 4, '', style);
    sheet.merges.push(`B${row}:D${row}`);
    row += 1;
  };
  section(tag ? `Informasi Mahasiswa ${tag}` : 'Informasi Mahasiswa');
  const a = formatDate(profile.internship_start, 'DD/MM/YYYY'); const b = formatDate(profile.internship_end, 'DD/MM/YYYY');
  const span = a && b ? `${a} s.d. ${b}` : (a || b || '-');
  pair('Nama lengkap', profile.full_name || '-');
  pair('NIM', profile.student_id || '-');
  pair('Program studi', profile.study_program || '-');
  pair('Politeknik', profile.university || '-');
  pair('Instansi / Mitra', profile.company || '-');
  pair('Alamat instansi / mitra', profile.company_address || '-');
  pair('Divisi/departemen', profile.department || '-');
  pair('Pembimbing instansi', profile.supervisor || '-');
  pair('NIP / BNIP pembimbing instansi', profile.supervisor_id || '-');
  pair('Dosen pembimbing', profile.academic_supervisor || '-');
  pair('NUPTK / NIDN dosen pembimbing', profile.academic_supervisor_id || '-');
  pair(tag ? `Periode ${tag}` : 'Periode', span);
  row += 1;
  section('Ringkasan Periode');
  pair('Periode laporan', periodLabel);
  pair('Total hari tercatat', summary.total_days, S.VALUE_INT);
  pair('Total aktivitas', summary.total_activities, S.VALUE_INT);
  pair('Total jam kegiatan', minutesFraction(summary.total_minutes), S.VALUE_DURATION);
  pair('Rata-rata durasi per kegiatan', minutesFraction(summary.average_minutes), S.VALUE_DURATION);
  pair('Tugas selesai', summary.tasks_done, S.VALUE_INT);
  pair('Tugas belum selesai', summary.tasks_not_done, S.VALUE_INT);
  row += 1;
  section('Aktivitas per Kategori');
  const hr = row;
  headerRow(sheet, hr, ['Kategori', 'Jumlah Aktivitas', 'Total Durasi', 'Persentase']);
  const total = summary.total_activities;
  for (const c of summary.categories) {
    row += 1;
    sheet.set(row, 1, c.name, S.BODY);
    sheet.set(row, 2, c.count, S.BODY_CENTER);
    sheet.set(row, 3, minutesFraction(c.minutes), S.DURATION);
    sheet.set(row, 4, total ? c.count / total : 0, S.PERCENT);
  }
  if (!summary.categories.length) { row += 1; sheet.set(row, 1, 'Belum ada kegiatan pada periode ini.', S.SUBTITLE); }
  sheet.widths = [34, 22, 18, 14];
  sheet.landscape = false;
  sheet.printLast = { col: 4, row };
  void dateFormat;
  return sheet;
}

function tasksSheet(profile, periodLabel, tasks) {
  const sheet = new Sheet(SHEET_TASKS);
  const tag = programTag(profile.program_type);
  const hr = titleBlock(sheet, tag ? `Daftar Tugas ${tag}` : 'Daftar Tugas', `Periode: ${periodLabel}`);
  headerRow(sheet, hr, TASK_HEADERS);
  let row = hr;
  tasks.forEach((t, i) => {
    row += 1;
    const values = [i + 1, t.title, t.description || '', PRIORITIES[t.priority] || t.priority, STATUSES[t.status] || t.status,
      toDate(t.created_at), toDate(t.deadline), t.result_notes || ''];
    const styles = [S.BODY_CENTER, S.BODY, S.BODY, S.BODY_CENTER, S.BODY_CENTER, S.DATE, S.DATE, S.BODY];
    values.forEach((v, c) => sheet.set(row, c + 1, v, styles[c]));
  });
  sheet.widths = [8, 34, 44, 12, 19, 15, 13, 44];
  finishTable(sheet, hr, row, TASK_HEADERS.length);
  return sheet;
}

function reflectionSheet(periodLabel, activities) {
  const sheet = new Sheet(SHEET_REFLECTION);
  const hr = titleBlock(sheet, 'Refleksi dan Pembelajaran', `Periode: ${periodLabel}`);
  headerRow(sheet, hr, REFLECTION_HEADERS);
  let row = hr;
  for (const a of activities) {
    if (!(a.result || a.obstacle || a.solution || a.reflection)) continue;
    row += 1;
    [toDate(a.date), a.title, a.result || '', a.obstacle || '', a.solution || '', a.reflection || ''].forEach((v, c) => {
      sheet.set(row, c + 1, v, c === 0 ? S.DATE : S.BODY);
    });
  }
  sheet.widths = [13, 34, 44, 38, 38, 44];
  finishTable(sheet, hr, row, REFLECTION_HEADERS.length);
  return sheet;
}

function matrixPeriodHeading(periodLabel, activities) {
  const label = String(periodLabel || '').trim();
  const m = label.match(/^([A-Za-zÀ-ÿ]+)\s+(\d{4})$/);
  if (m) return `BULAN ${m[1].toUpperCase()} TAHUN ${m[2]}`;
  const ymSet = new Set(activities.map((a) => String(a.date || '').slice(0, 7)).filter((s) => /^\d{4}-\d{2}$/.test(s)));
  if (ymSet.size === 1) {
    const [y, mm] = [...ymSet][0].split('-').map(Number);
    const mName = MONTHS[mm - 1];
    if (mName) return `BULAN ${mName.toUpperCase()} TAHUN ${y}`;
  }
  return label ? `PERIODE ${label.toUpperCase()}` : 'BULAN KEGIATAN';
}

function matrixSheet(profile, periodLabel, activities) {
  const sheet = new Sheet(SHEET_MATRIX);
  const tag = programTag(profile.program_type);
  const title = tag
    ? `MATRIKS PROGRAM KEGIATAN ${tag.toUpperCase()} DI INSTANSI`
    : 'MATRIKS PROGRAM KEGIATAN DI INSTANSI';
  setMerged(sheet, 1, 1, 1, 35, title, S.TITLE_CENTER);
  sheet.heights.set(1, 22);

  const meta = [
    ['Nama Instansi', profile.company || '-'],
    ['Alamat Instansi', profile.company_address || '-'],
    ['Nama Mahasiswa', profile.full_name || '-'],
    ['NIM', profile.student_id || '-'],
  ];
  meta.forEach(([label, val], idx) => {
    const r = 3 + idx;
    setMerged(sheet, r, 1, r, 2, label, S.DEFAULT);
    setMerged(sheet, r, 3, r, 35, `: ${val}`, S.DEFAULT);
    sheet.heights.set(r, 18);
  });

  const hr = 8;
  setMerged(sheet, hr, 1, hr + 1, 1, 'NO', S.HEADER);
  setMerged(sheet, hr, 2, hr + 1, 2, 'KEGIATAN YANG DILAKSANAKAN', S.HEADER);
  setMerged(sheet, hr, 3, hr, 33, matrixPeriodHeading(periodLabel, activities), S.HEADER);
  for (let d = 1; d <= 31; d += 1) {
    sheet.set(hr + 1, 2 + d, d, S.HEADER);
  }
  setMerged(sheet, hr, 34, hr + 1, 34, 'JML Jam', S.HEADER);
  setMerged(sheet, hr, 35, hr + 1, 35, 'Ket.', S.HEADER);
  sheet.heights.set(hr, 20);
  sheet.heights.set(hr + 1, 20);

  const groups = [];
  const groupMap = new Map();
  for (const a of activities) {
    const catName = String(a.category_name || 'Kegiatan').trim() || 'Kegiatan';
    const catKey = catName.toLowerCase();
    let grp = groupMap.get(catKey);
    if (!grp) {
      grp = { categoryName: catName, items: [], itemMap: new Map() };
      groupMap.set(catKey, grp);
      groups.push(grp);
    }
    const actTitle = String(a.title || '').trim() || '-';
    const actKey = actTitle.toLowerCase();
    let item = grp.itemMap.get(actKey);
    if (!item) {
      item = { title: actTitle, days: new Set(), minutes: 0 };
      grp.itemMap.set(actKey, item);
      grp.items.push(item);
    }
    const dayNum = Number(String(a.date || '').slice(8, 10));
    if (dayNum >= 1 && dayNum <= 31) item.days.add(dayNum);
    item.minutes += a.duration_minutes || 0;
  }

  let row = hr + 1;
  let totalMinutes = 0;
  if (groups.length === 0) {
    row += 1;
    for (let c = 1; c <= 35; c += 1) sheet.set(row, c, '', S.BODY);
    sheet.heights.set(row, 20);
  } else {
    groups.forEach((grp, gIdx) => {
      row += 1;
      sheet.set(row, 1, colLetter(gIdx + 1), S.BOLD_BORDER_CENTER);
      sheet.set(row, 2, grp.categoryName.toUpperCase(), S.BOLD_BORDER_LEFT);
      for (let c = 3; c <= 35; c += 1) sheet.set(row, c, '', S.BODY);
      sheet.heights.set(row, 20);

      grp.items.forEach((item, iIdx) => {
        row += 1;
        totalMinutes += item.minutes;
        sheet.set(row, 1, `${iIdx + 1}.`, S.BODY_CENTER);
        sheet.set(row, 2, item.title, S.BODY);
        for (let d = 1; d <= 31; d += 1) {
          const active = item.days.has(d);
          const cellStyle = active ? (d % 2 === 1 ? S.MATRIX_BLUE : S.MATRIX_YELLOW) : S.BODY_CENTER;
          sheet.set(row, 2 + d, '', cellStyle);
        }
        sheet.set(row, 34, roundHours(item.minutes), S.HOURS_NUM);
        sheet.set(row, 35, '', S.BODY);
        const lines = Math.max(1, Math.ceil(item.title.length / 32));
        sheet.heights.set(row, Math.max(20, lines * 16 + 4));
      });
    });
  }

  row += 1;
  setMerged(sheet, row, 1, row, 33, 'JUMLAH JAM KEGIATAN', S.BOLD_BORDER_CENTER);
  sheet.set(row, 34, roundHours(totalMinutes), S.HOURS_NUM_BOLD);
  sheet.set(row, 35, '', S.BOLD_BORDER_CENTER);
  sheet.heights.set(row, 22);

  const lastSigRow = appendSignatureBlock(sheet, row, profile, [[2, 10], [13, 23], [26, 35]]);
  sheet.widths = [5, 36, ...Array(31).fill(3.4), 7.5, 8];
  sheet.landscape = true;
  sheet.printTitleRow = hr;
  sheet.printTitleEndRow = hr + 1;
  sheet.printLast = { col: 35, row: lastSigRow };
  return sheet;
}

// ------------------------------------------------------------------ paket
const quote = (name) => `'${name.replaceAll("'", "''")}'`;

function workbookXml(sheets) {
  const names = [];
  sheets.forEach((sh, i) => {
    if (sh.filter) {
      const [a, b] = sh.filter.split(':');
      const abs = (ref) => ref.replace(/^([A-Z]+)(\d+)$/, '$$$1$$$2');
      names.push(`<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${escapeXml(quote(sh.name))}!${abs(a)}:${abs(b)}</definedName>`);
    }
    if (sh.printLast) {
      names.push(`<definedName name="_xlnm.Print_Area" localSheetId="${i}">${escapeXml(quote(sh.name))}!$A$1:$${colLetter(sh.printLast.col)}$${sh.printLast.row}</definedName>`);
    }
    if (sh.printTitleRow) {
      const endRow = sh.printTitleEndRow || sh.printTitleRow;
      names.push(`<definedName name="_xlnm.Print_Titles" localSheetId="${i}">${escapeXml(quote(sh.name))}!$${sh.printTitleRow}:$${endRow}</definedName>`);
    }
  });
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + '<bookViews><workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="12000"/></bookViews>'
    + `<sheets>${sheets.map((s, i) => `<sheet name="${escapeXml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>`
    + (names.length ? `<definedNames>${names.join('')}</definedNames>` : '')
    + '</workbook>';
}

/**
 * Bangun berkas xlsx.
 * @param {typeof import('jszip')} JSZip konstruktor JSZip (diinjeksi: global di browser, require di Node)
 * @returns {Promise<Uint8Array>}
 */
export async function buildWorkbook(JSZip, {
  profile = {}, periodLabel = '', activities = [], tasks = [], summary, dateFormat = DEFAULT_DATE_FORMAT,
  sheets = ALL_SHEETS, now = new Date(),
}) {
  const wanted = ALL_SHEETS.filter((n) => sheets.includes(n));
  if (!wanted.length) throw new ExportError('Pilih setidaknya satu sheet untuk diekspor.');
  if (!summary) throw new ExportError('Ringkasan laporan tidak tersedia.');
  const xlDate = (DATE_FORMATS[dateFormat] || DATE_FORMATS[DEFAULT_DATE_FORMAT])[1];
  const builders = {
    [SHEET_ACTIVITIES]: () => activitiesSheet(profile, periodLabel, activities),
    [SHEET_SUMMARY]: () => summarySheet(profile, periodLabel, summary, dateFormat),
    [SHEET_TASKS]: () => tasksSheet(profile, periodLabel, tasks),
    [SHEET_REFLECTION]: () => reflectionSheet(periodLabel, activities),
    [SHEET_MATRIX]: () => matrixSheet(profile, periodLabel, activities),
  };
  const built = wanted.map((n) => builders[n]());
  const tag = programTag(profile.program_type);
  const docTitle = tag ? `Laporan ${tag}` : 'Laporan Kegiatan';
  const iso = now.toISOString().replace(/\.\d+Z$/, 'Z');

  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    + built.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
    + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
    + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
    + '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'
    + '</Types>');
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
    + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
    + '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>'
    + '</Relationships>');
  zip.file('docProps/core.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
    + `<dc:title>${APP_NAME} - ${docTitle}</dc:title><dc:creator>${APP_NAME}</dc:creator>`
    + `<dcterms:created xsi:type="dcterms:W3CDTF">${iso}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${iso}</dcterms:modified>`
    + '</cp:coreProperties>');
  zip.file('docProps/app.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>${APP_NAME}</Application></Properties>`);
  zip.file('xl/workbook.xml', workbookXml(built));
  zip.file('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + built.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
    + `<Relationship Id="rId${built.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`
    + '</Relationships>');
  zip.file('xl/styles.xml', stylesXml(xlDate));
  built.forEach((sh, i) => zip.file(`xl/worksheets/sheet${i + 1}.xml`, sh.xml()));
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 }, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
