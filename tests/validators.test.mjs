import test from 'node:test';
import assert from 'node:assert/strict';
import { validateActivity, validateTask, validateProfile, validateCategoryName } from '../src/js/core/validators.js';
import { ValidationError } from '../src/js/core/errors.js';
import { act } from './helpers.mjs';

const cats = [1, 2, 3];
const errs = (fn) => { try { fn(); } catch (e) { assert.ok(e instanceof ValidationError); return e.errors; } assert.fail('harus melempar'); };

test('kegiatan valid: durasi dihitung, teks dipangkas', () => {
  const c = validateActivity(act({ title: '  Judul  ', start_time: '9:00', end_time: '10:15' }), cats);
  assert.equal(c.title, 'Judul');
  assert.equal(c.duration_minutes, 75);
  assert.equal(c.start_time, '09:00');
  assert.equal(c.category_id, 3);
});

test('nama kosong / hanya spasi ditolak', () => {
  assert.ok(errs(() => validateActivity(act({ title: '   ' }), cats)).title);
});

test('batas panjang judul dan teks', () => {
  assert.ok(errs(() => validateActivity(act({ title: 'x'.repeat(151) }), cats)).title);
  assert.ok(errs(() => validateActivity(act({ description: 'x'.repeat(5001) }), cats)).description);
  validateActivity(act({ title: 'x'.repeat(150), description: 'x'.repeat(5000) }), cats);
});

test('jam selesai <= mulai ditolak; melewati tengah malam dijelaskan', () => {
  const e1 = errs(() => validateActivity(act({ start_time: '10:00', end_time: '09:00' }), cats));
  assert.match(e1.end_time, /tengah malam/);
  assert.ok(errs(() => validateActivity(act({ start_time: '10:00', end_time: '10:00' }), cats)).end_time);
});

test('tanggal/jam tidak valid memberi error per field, banyak sekaligus', () => {
  const e = errs(() => validateActivity(act({ date: '99/99/2026', start_time: 'x', end_time: '25:00', category_id: '' }), cats));
  assert.ok(e.date && e.start_time && e.end_time && e.category_id);
});

test('kategori tidak ada ditolak', () => {
  assert.match(errs(() => validateActivity(act({ category_id: 99 }), cats)).category_id, /tidak ditemukan/);
  assert.match(errs(() => validateActivity(act({ category_id: 'abc' }), cats)).category_id, /tidak ditemukan/);
});

test('unicode dan teks multibaris diterima', () => {
  const c = validateActivity(act({ title: 'Rapat — ujian مرحبا', reflection: 'baris1\nbaris2' }), cats);
  assert.ok(c.title.includes('م'));
  assert.equal(c.reflection, 'baris1\nbaris2');
});

test('tugas: bawaan, deadline, prioritas, status', () => {
  const t = validateTask({ title: 'T' }, '2026-11-02');
  assert.deepEqual([t.priority, t.status, t.created_at, t.deadline], ['medium', 'todo', '2026-11-02', null]);
  assert.ok(errs(() => validateTask({ title: '' })).title);
  assert.match(errs(() => validateTask({ title: 'x', created_at: '2026-11-05', deadline: '2026-11-01' })).deadline, /lebih awal/);
  assert.ok(errs(() => validateTask({ title: 'x', priority: 'urgent' })).priority);
  assert.ok(errs(() => validateTask({ title: 'x', status: 'zzz' })).status);
  assert.ok(errs(() => validateTask({ title: 'x', deadline: 'besok' })).deadline);
  assert.equal(validateTask({ title: 'x', created_at: '2026-11-05', deadline: '2026-11-05' }).deadline, '2026-11-05');
});

test('profil opsional; tanggal selesai tidak boleh sebelum mulai', () => {
  assert.equal(validateProfile({}).internship_start, '');
  assert.equal(validateProfile({}).program_type, 'umum');
  const p = validateProfile({
    full_name: ' Budi ',
    company_address: ' Jl. Gatot Subroto No.5 ',
    supervisor_id: ' BNIP.1993 ',
    academic_supervisor: ' Muhamad Ainurohman, S.Kom ',
    academic_supervisor_id: ' NUPTK.2463 ',
    program_type: 'mbkm',
    internship_start: '01/10/2026',
    internship_end: '31/12/2026',
  });
  assert.deepEqual(
    [p.full_name, p.company_address, p.supervisor_id, p.academic_supervisor, p.academic_supervisor_id, p.program_type, p.internship_start, p.internship_end],
    ['Budi', 'Jl. Gatot Subroto No.5', 'BNIP.1993', 'Muhamad Ainurohman, S.Kom', 'NUPTK.2463', 'mbkm', '2026-10-01', '2026-12-31']
  );
  assert.ok(errs(() => validateProfile({ program_type: 'lainnya' })).program_type);
  assert.ok(errs(() => validateProfile({ internship_start: '01/10/2026', internship_end: '01/09/2026' })).internship_end);
  assert.ok(errs(() => validateProfile({ internship_start: 'xx' })).internship_start);
  assert.ok(errs(() => validateProfile({ full_name: 'x'.repeat(151) })).full_name);
});

test('nama kategori', () => {
  assert.equal(validateCategoryName('  Baru '), 'Baru');
  assert.throws(() => validateCategoryName('  '), ValidationError);
  assert.throws(() => validateCategoryName('x'.repeat(41)), ValidationError);
});
