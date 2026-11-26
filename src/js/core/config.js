// Konfigurasi dan konstanta domain MagangLog (sama dengan versi Python).
export const APP_NAME = 'PurbayaLog';
export const APP_FULL_NAME = 'Logbook Aktivitas Mahasiswa';
export const APP_VERSION = '1.0.0';
export const SCHEMA_VERSION = 1;

export const PROGRAM_TYPES = Object.freeze({
  umum: 'Umum',
  mbkm: 'MBKM',
  pkl: 'PKL',
  magang: 'Magang',
});
export const DEFAULT_PROGRAM_TYPE = 'umum';

export const DEFAULT_CATEGORIES = Object.freeze([
  'Orientasi', 'Pembelajaran', 'Development', 'Maintenance', 'Meeting',
  'Administrasi', 'Research', 'Testing', 'Lainnya',
]);
export const PRIORITIES = Object.freeze({ low: 'Rendah', medium: 'Sedang', high: 'Tinggi' });
export const STATUSES = Object.freeze({ todo: 'Belum dikerjakan', in_progress: 'Dalam proses', done: 'Selesai' });

// [contoh, format tanggal Excel]
export const DATE_FORMATS = Object.freeze({
  'DD/MM/YYYY': ['31/12/2026', 'dd/mm/yyyy'],
  'DD-MM-YYYY': ['31-12-2026', 'dd-mm-yyyy'],
  'YYYY-MM-DD': ['2026-12-31', 'yyyy-mm-dd'],
  'DD MMM YYYY': ['31 Des 2026', 'dd mmm yyyy'],
});
export const DEFAULT_DATE_FORMAT = 'DD/MM/YYYY';

export const PAGE_SIZE = 15;
export const DEADLINE_WARNING_DAYS = 3;
export const MIN_YEAR = 2000;
export const MAX_YEAR = 2100;
export const DEFAULT_REPORT_OWNER = 'Mahasiswa';

export const MAX_TITLE = 150;
export const MAX_TEXT = 5000;
export const MAX_SHORT = 150;
export const MAX_CATEGORY = 40;

export const PROFILE_FIELDS = Object.freeze([
  ['full_name', 'Nama lengkap'],
  ['student_id', 'NIM'],
  ['study_program', 'Program studi'],
  ['university', 'Politeknik'],
  ['company', 'Instansi / Mitra'],
  ['company_address', 'Alamat instansi / mitra'],
  ['department', 'Divisi/departemen'],
  ['supervisor', 'Pembimbing instansi'],
  ['supervisor_id', 'NIP / BNIP pembimbing instansi'],
  ['academic_supervisor', 'Dosen pembimbing'],
  ['academic_supervisor_id', 'NUPTK / NIDN dosen pembimbing'],
]);
