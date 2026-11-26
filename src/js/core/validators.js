// Validasi input. Mengembalikan data bersih atau melempar ValidationError (pesan per field).
import { DEFAULT_PROGRAM_TYPE, MAX_CATEGORY, MAX_SHORT, MAX_TEXT, MAX_TITLE, PRIORITIES, PROGRAM_TYPES, STATUSES } from './config.js';
import { durationBetween, parseDate, parseTime, todayISO } from './dates.js';
import { ValidationError } from './errors.js';

export const ACTIVITY_TEXT_FIELDS = ['description', 'result', 'obstacle', 'solution', 'reflection'];
export const PROFILE_TEXT_FIELDS = [
  'full_name',
  'student_id',
  'study_program',
  'university',
  'company',
  'company_address',
  'department',
  'supervisor',
  'supervisor_id',
  'academic_supervisor',
  'academic_supervisor_id',
];
const ACTIVITY_LABELS = { description: 'Deskripsi', result: 'Hasil', obstacle: 'Kendala', solution: 'Solusi', reflection: 'Refleksi' };

function text(data, field, limit, errors, label) {
  const value = data?.[field];
  const out = value == null ? '' : String(value).trim();
  if (out.length > limit) errors[field] = `${label} maksimal ${limit} karakter (saat ini ${out.length}).`;
  return out;
}

export function validateActivity(data, validCategoryIds) {
  const errors = {};
  const cleaned = {};
  cleaned.title = text(data, 'title', MAX_TITLE, errors, 'Nama kegiatan');
  if (!cleaned.title) errors.title = 'Nama kegiatan wajib diisi.';

  try { cleaned.date = parseDate(data?.date); } catch (e) { errors.date = e.message; }

  let start = null; let end = null;
  try { start = parseTime(data?.start_time); } catch (e) { errors.start_time = `Jam mulai: ${e.message}`; }
  try { end = parseTime(data?.end_time); } catch (e) { errors.end_time = `Jam selesai: ${e.message}`; }
  if (start && end) {
    const minutes = durationBetween(start, end);
    if (minutes <= 0) {
      errors.end_time = 'Jam selesai harus lebih besar dari jam mulai. Kegiatan yang melewati tengah malam belum didukung; pisahkan menjadi dua catatan.';
    } else {
      Object.assign(cleaned, { start_time: start, end_time: end, duration_minutes: minutes });
    }
  }

  const rawCategory = data?.category_id;
  if (rawCategory === null || rawCategory === undefined || rawCategory === '') {
    errors.category_id = 'Kategori wajib dipilih.';
  } else {
    const id = Number(rawCategory);
    if (!Number.isInteger(id) || !new Set(validCategoryIds).has(id)) errors.category_id = 'Kategori tidak ditemukan.';
    else cleaned.category_id = id;
  }
  for (const field of ACTIVITY_TEXT_FIELDS) cleaned[field] = text(data, field, MAX_TEXT, errors, ACTIVITY_LABELS[field]);

  if (Object.keys(errors).length) throw new ValidationError(errors);
  return cleaned;
}

export function validateTask(data, today = todayISO()) {
  const errors = {};
  const cleaned = {};
  cleaned.title = text(data, 'title', MAX_TITLE, errors, 'Nama tugas');
  if (!cleaned.title) errors.title = 'Nama tugas wajib diisi.';
  cleaned.description = text(data, 'description', MAX_TEXT, errors, 'Deskripsi');
  cleaned.result_notes = text(data, 'result_notes', MAX_TEXT, errors, 'Catatan hasil');

  let created = null;
  try { created = parseDate(data?.created_at || today); cleaned.created_at = created; } catch (e) { errors.created_at = `Tanggal dibuat: ${e.message}`; }

  cleaned.deadline = null;
  const rawDeadline = data?.deadline;
  if (rawDeadline != null && String(rawDeadline).trim() !== '') {
    try {
      const deadline = parseDate(rawDeadline);
      cleaned.deadline = deadline;
      if (created && deadline < created) errors.deadline = 'Deadline tidak boleh lebih awal dari tanggal dibuat.';
    } catch (e) { errors.deadline = `Deadline: ${e.message}`; }
  }

  const priority = data?.priority || 'medium';
  if (!Object.hasOwn(PRIORITIES, priority)) errors.priority = 'Prioritas harus Rendah, Sedang, atau Tinggi.';
  cleaned.priority = priority;
  const status = data?.status || 'todo';
  if (!Object.hasOwn(STATUSES, status)) errors.status = 'Status tidak valid.';
  cleaned.status = status;

  if (Object.keys(errors).length) throw new ValidationError(errors);
  return cleaned;
}

export function validateProfile(data) {
  const errors = {};
  const cleaned = {};
  for (const field of PROFILE_TEXT_FIELDS) cleaned[field] = text(data, field, MAX_SHORT, errors, 'Isian');
  const rawProgram = String(data?.program_type ?? '').trim();
  const programType = rawProgram || DEFAULT_PROGRAM_TYPE;
  if (!Object.hasOwn(PROGRAM_TYPES, programType)) errors.program_type = 'Jenis program tidak valid.';
  cleaned.program_type = programType;
  const parsed = {};
  for (const [field, label] of [['internship_start', 'Tanggal mulai'], ['internship_end', 'Tanggal selesai']]) {
    const raw = String(data?.[field] ?? '').trim();
    cleaned[field] = '';
    parsed[field] = '';
    if (!raw) continue;
    try { parsed[field] = parseDate(raw); cleaned[field] = parsed[field]; } catch (e) { errors[field] = `${label}: ${e.message}`; }
  }
  if (parsed.internship_start && parsed.internship_end && parsed.internship_end < parsed.internship_start) {
    errors.internship_end = 'Tanggal selesai tidak boleh sebelum tanggal mulai.';
  }
  if (Object.keys(errors).length) throw new ValidationError(errors);
  return cleaned;
}

export function validateCategoryName(name) {
  const cleaned = String(name ?? '').trim();
  if (!cleaned) throw new ValidationError({ name: 'Nama kategori wajib diisi.' });
  if (cleaned.length > MAX_CATEGORY) throw new ValidationError({ name: `Nama kategori maksimal ${MAX_CATEGORY} karakter.` });
  return cleaned;
}

