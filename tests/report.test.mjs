import test from 'node:test';
import assert from 'node:assert/strict';
import { DataStore, act, seededStore } from './helpers.mjs';
import { buildReport, dashboardData, greeting, makePeriod } from '../src/js/core/report.js';

const TODAY = '2026-11-04';

test('periode harian, mingguan, bulanan, rentang, semua', () => {
  assert.equal(makePeriod('day', { ref: '2026-11-02' }).label, 'Senin, 02 November 2026');
  const w = makePeriod('week', { ref: TODAY });
  assert.deepEqual([w.start, w.end, w.label], ['2026-11-02', '2026-11-08', '02/11/2026 s.d. 08/11/2026']);
  const m = makePeriod('month', { year: 2026, month: 11 });
  assert.deepEqual([m.start, m.end, m.label], ['2026-11-01', '2026-11-30', 'November 2026']);
  assert.equal(makePeriod('range', { start: '2026-11-01', end: '2026-11-30', dateFormat: 'YYYY-MM-DD' }).label, '2026-11-01 s.d. 2026-11-30');
  assert.equal(makePeriod('all').start, null);
});

test('periode tidak valid', () => {
  assert.throws(() => makePeriod('range', { start: '2026-11-05', end: '2026-11-01' }), /lebih awal/);
  assert.throws(() => makePeriod('range', { start: null, end: '2026-11-01' }), /wajib/);
  assert.throws(() => makePeriod('month', { year: 2026, month: 13 }), /Bulan/);
  assert.throws(() => makePeriod('tahunan'), /tidak dikenal/);
});

test('rekap bulan: jumlah, total, rata-rata, kategori, harian', () => {
  const r = buildReport(seededStore(), makePeriod('month', { year: 2026, month: 11 }));
  assert.equal(r.total_activities, 3);
  assert.equal(r.total_minutes, 150 + 60 + 75);
  assert.equal(r.average_minutes, 95);
  assert.equal(r.total_days, 2);
  assert.deepEqual(r.daily.map((d) => [d.date, d.count, d.minutes]), [['2026-11-02', 1, 150], ['2026-11-03', 2, 135]]);
  assert.equal(r.categories.length, 3);
  assert.equal(r.categories.reduce((s, c) => s + c.count, 0), 3);
  assert.equal(r.has_data, true);
});

test('rekap hari dan minggu', () => {
  const s = seededStore();
  assert.equal(buildReport(s, makePeriod('day', { ref: '2026-11-03' })).total_activities, 2);
  assert.equal(buildReport(s, makePeriod('week', { ref: '2026-11-04' })).total_activities, 3);
  assert.equal(buildReport(s, makePeriod('day', { ref: '2030-01-01' })).has_data, false);
});

test('periode tanpa data: nol, bukan error', () => {
  const r = buildReport(new DataStore(), makePeriod('month', { year: 2026, month: 1 }));
  assert.deepEqual([r.total_activities, r.total_minutes, r.average_minutes, r.total_days, r.categories.length], [0, 0, 0, 0, 0]);
});

test('tugas pada periode = dibuat atau jatuh tempo di periode', () => {
  const s = seededStore();
  const nov = buildReport(s, makePeriod('month', { year: 2026, month: 11 }));
  assert.deepEqual(nov.tasks.map((t) => t.title).sort(), ['Review kode', 'Susun dokumentasi']);
  assert.equal(nov.tasks_done, 1); assert.equal(nov.tasks_not_done, 1);
  assert.equal(buildReport(s, makePeriod('month', { year: 2026, month: 9 })).tasks.length, 1);
  assert.equal(buildReport(s, makePeriod('all')).tasks.length, 3);
});

test('dashboard: angka dari data nyata', () => {
  const s = seededStore();
  s.setProfile({ internship_start: '01/10/2026', internship_end: '31/12/2026' });
  const d = dashboardData(s, TODAY);
  assert.equal(d.total_activities, 3);
  assert.equal(d.recorded_days, 2);
  assert.equal(d.total_minutes, 285);
  assert.equal(d.elapsed_days, 35); assert.equal(d.internship_span_days, 92);
  assert.deepEqual([d.tasks_todo, d.tasks_in_progress, d.tasks_done], [2, 0, 1]);
  assert.deepEqual(d.week.map((w) => w.minutes), [150, 135, 0, 0, 0, 0, 0]);
  assert.equal(d.recent[0].title, 'Testing modul A');
  assert.equal(d.attention.length, 2);
});

test('dashboard kosong dan masa magang belum mulai / sudah selesai', () => {
  const s = new DataStore();
  const d = dashboardData(s, TODAY);
  assert.deepEqual([d.total_activities, d.recorded_days, d.elapsed_days, d.week.length], [0, 0, null, 7]);
  s.setProfile({ internship_start: '01/12/2026' });
  assert.equal(dashboardData(s, TODAY).elapsed_days, 0);
  s.setProfile({ internship_start: '01/09/2026', internship_end: '30/09/2026' });
  assert.equal(dashboardData(s, TODAY).elapsed_days, 30);
});

test('sapaan', () => {
  assert.deepEqual([greeting(8), greeting(12), greeting(16), greeting(21)], ['Selamat pagi', 'Selamat siang', 'Selamat sore', 'Selamat malam']);
});
