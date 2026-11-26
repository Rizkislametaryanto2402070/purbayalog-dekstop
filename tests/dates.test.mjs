import test from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/js/core/dates.js';

test('parseDate menerima banyak format', () => {
  for (const t of ['2026-11-02', '02/11/2026', '2-11-2026', '02.11.2026', '02 Nov 2026', '2 November 2026', ' 02/11/2026 ']) {
    assert.equal(D.parseDate(t), '2026-11-02', t);
  }
  assert.equal(D.parseDate('31 Des 2026'), '2026-12-31');
});

test('parseDate menolak input tidak valid dengan pesan jelas', () => {
  for (const t of ['', '   ', null, 'bukan tanggal', '31/02/2026', '2026-13-01', '00/01/2026', '01/01/1999', '01/01/2101', '1 Foo 2026', '2026/11/02']) {
    assert.throws(() => D.parseDate(t), Error, String(t));
  }
  assert.match(assertMsg(() => D.parseDate('31/02/2026')), /kalender/);
  assert.match(assertMsg(() => D.parseDate('')), /wajib/);
});
function assertMsg(fn) { try { fn(); } catch (e) { return e.message; } return ''; }

test('tahun kabisat', () => {
  assert.equal(D.parseDate('29/02/2028'), '2028-02-29');
  assert.throws(() => D.parseDate('29/02/2027'));
});

test('formatDate semua format', () => {
  assert.equal(D.formatDate('2026-12-31', 'DD/MM/YYYY'), '31/12/2026');
  assert.equal(D.formatDate('2026-12-31', 'DD-MM-YYYY'), '31-12-2026');
  assert.equal(D.formatDate('2026-12-31', 'YYYY-MM-DD'), '2026-12-31');
  assert.equal(D.formatDate('2026-12-31', 'DD MMM YYYY'), '31 Des 2026');
  assert.equal(D.formatDate('', 'DD/MM/YYYY'), '');
});

test('hari dalam minggu dan rentang minggu (Senin-Minggu)', () => {
  assert.equal(D.dayName('2026-11-02'), 'Senin');
  assert.equal(D.dayName('2026-11-08'), 'Minggu');
  assert.deepEqual(D.weekRange('2026-11-04'), ['2026-11-02', '2026-11-08']);
  assert.deepEqual(D.weekRange('2026-11-08'), ['2026-11-02', '2026-11-08']);
  assert.deepEqual(D.weekRange('2026-11-02'), ['2026-11-02', '2026-11-08']);
  assert.equal(D.longDate('2026-11-02'), 'Senin, 02 November 2026');
});

test('aritmetika tanggal tidak terpengaruh DST/zona', () => {
  assert.equal(D.addDays('2026-03-28', 3), '2026-03-31');
  assert.equal(D.addDays('2026-12-30', 3), '2027-01-02');
  assert.equal(D.daysBetween('2026-01-01', '2026-12-31'), 364);
  assert.equal(D.daysInclusive('2026-11-02', '2026-11-02'), 1);
  assert.deepEqual(D.monthRange(2028, 2), ['2028-02-01', '2028-02-29']);
  assert.deepEqual(D.monthRange(2026, 12), ['2026-12-01', '2026-12-31']);
});

test('serial Excel sesuai kalender Excel', () => {
  assert.equal(D.excelSerial('1970-01-01'), 25569);
  assert.equal(D.excelSerial('2000-01-01'), 36526);
  assert.equal(D.excelSerial('2026-11-02'), 46328);
});

test('parseTime dan durasi', () => {
  assert.equal(D.parseTime('8:05'), '08:05');
  assert.equal(D.parseTime('08.30'), '08:30');
  for (const t of ['', '24:00', '12:60', '8', 'abc', '08:5']) assert.throws(() => D.parseTime(t), Error, t);
  assert.equal(D.durationBetween('08:00', '10:30'), 150);
  assert.equal(D.durationBetween('10:00', '09:00'), -60);
});

test('format durasi dan jam', () => {
  assert.equal(D.formatDuration(90), '1 jam 30 menit');
  assert.equal(D.formatDuration(45), '45 menit');
  assert.equal(D.formatDuration(120), '2 jam');
  assert.equal(D.formatDuration(0), '0 menit');
  assert.equal(D.formatHours(150), '2,5');
  assert.equal(D.formatHours(0), '0,0');
});
