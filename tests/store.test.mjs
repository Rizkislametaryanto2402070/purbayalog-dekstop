import test from 'node:test';
import assert from 'node:assert/strict';
import { DataStore, act, seededStore } from './helpers.mjs';
import { deadlineState } from '../src/js/core/store.js';
import { NotFoundError, ValidationError } from '../src/js/core/errors.js';

test('store baru: 9 kategori bawaan, kosong', () => {
  const s = new DataStore();
  assert.equal(s.categories().length, 9);
  assert.equal(s.categories()[0].name, 'Orientasi');
  assert.equal(s.listActivities().length, 0);
});

test('CRUD kegiatan', () => {
  const s = new DataStore();
  const id = s.createActivity(act());
  assert.equal(s.getActivity(id).category_name, 'Development');
  s.updateActivity(id, act({ title: 'Diedit' }));
  assert.equal(s.getActivity(id).title, 'Diedit');
  s.deleteActivity(id);
  assert.throws(() => s.getActivity(id), NotFoundError);
  assert.throws(() => s.deleteActivity(id), NotFoundError);
  assert.throws(() => s.updateActivity(id, act()), NotFoundError);
});

test('kegiatan tidak valid tidak mengubah data', () => {
  const s = new DataStore();
  assert.throws(() => s.createActivity(act({ title: '' })), ValidationError);
  assert.equal(s.state.activities.length, 0);
  assert.equal(s.state.counters.activity, 1);
});

test('id tidak dipakai ulang setelah hapus', () => {
  const s = new DataStore();
  const a = s.createActivity(act()); s.deleteActivity(a);
  assert.notEqual(s.createActivity(act()), a);
});

test('pencarian case-insensitive, aman terhadap karakter khusus', () => {
  const s = seededStore();
  s.createActivity(act({ title: 'Diskon 50% _final_' }));
  assert.equal(s.listActivities({ text: 'RAPAT' }).length, 1);
  assert.equal(s.listActivities({ text: '50%' }).length, 1);
  assert.equal(s.listActivities({ text: '_final_' }).length, 1);
  assert.equal(s.listActivities({ text: '%' }).length, 1);
  assert.equal(s.listActivities({ text: 'tidak ada' }).length, 0);
});

test('filter kategori, tanggal, kombinasi, dan urutan', () => {
  const s = seededStore();
  assert.equal(s.listActivities({ categoryId: 5 }).length, 1);
  assert.equal(s.listActivities({ dateFrom: '2026-11-03' }).length, 2);
  assert.equal(s.listActivities({ dateTo: '2026-11-02' }).length, 1);
  assert.equal(s.listActivities({ dateFrom: '2026-11-03', categoryId: 8 }).length, 1);
  const desc = s.listActivities().map((a) => a.title);
  assert.deepEqual(desc, ['Testing modul A', 'Rapat mingguan', 'Membuat laporan']);
  assert.deepEqual(s.listActivities({ newestFirst: false }).map((a) => a.title), [...desc].reverse());
});

test('paginasi 15 per halaman', () => {
  const s = new DataStore();
  for (let i = 0; i < 40; i += 1) s.createActivity(act({ title: `K${i}` }));
  const p1 = s.searchActivities({}, 1);
  assert.equal(p1.items.length, 15); assert.equal(p1.pages, 3); assert.equal(p1.first, 1); assert.equal(p1.last, 15);
  const p3 = s.searchActivities({}, 3);
  assert.equal(p3.items.length, 10); assert.equal(p3.last, 40);
  assert.equal(s.searchActivities({}, 99).page, 3);
  assert.equal(s.searchActivities({}, -4).page, 1);
  assert.equal(new DataStore().searchActivities().total, 0);
});

test('kategori: tambah, duplikat, hapus yang dipakai ditolak', () => {
  const s = new DataStore();
  const id = s.addCategory('Dokumentasi');
  assert.throws(() => s.addCategory('dokumentasi'), ValidationError);
  s.createActivity(act({ category_id: id }));
  assert.throws(() => s.deleteCategory(id), /dipakai/);
  s.deleteActivity(s.state.activities[0].id);
  s.deleteCategory(id);
  assert.equal(s.categories().some((c) => c.id === id), false);
});

test('tugas: CRUD, status, prioritas, filter', () => {
  const s = seededStore();
  assert.equal(s.listTasks().length, 3);
  assert.equal(s.listTasks({ status: 'done' }).length, 1);
  assert.equal(s.listTasks({ priority: 'high' })[0].title, 'Susun dokumentasi');
  const id = s.listTasks({ text: 'lama' })[0].id;
  s.setTaskStatus(id, 'in_progress');
  assert.equal(s.getTask(id).status, 'in_progress');
  s.setTaskPriority(id, 'low');
  assert.equal(s.getTask(id).priority, 'low');
  assert.throws(() => s.setTaskStatus(id, 'x'), ValidationError);
  s.updateTask(id, { ...s.getTask(id), title: 'Baru' });
  assert.equal(s.getTask(id).title, 'Baru');
  s.deleteTask(id);
  assert.throws(() => s.getTask(id), NotFoundError);
});

test('urutan tugas: belum selesai dulu, selesai terakhir', () => {
  const s = seededStore();
  assert.equal(s.listTasks().at(-1).status, 'done');
});

test('status deadline', () => {
  const t = (deadline, status = 'todo') => ({ deadline, status });
  assert.equal(deadlineState(t('2026-11-01'), '2026-11-02'), 'overdue');
  assert.equal(deadlineState(t('2026-11-02'), '2026-11-02'), 'soon');
  assert.equal(deadlineState(t('2026-11-05'), '2026-11-02'), 'soon');
  assert.equal(deadlineState(t('2026-11-06'), '2026-11-02'), null);
  assert.equal(deadlineState(t('2026-11-01', 'done'), '2026-11-02'), null);
  assert.equal(deadlineState(t(null), '2026-11-02'), null);
});

test('tugas perlu perhatian: terlambat dan segera, tanpa yang selesai', () => {
  const s = seededStore();
  const list = s.tasksNeedingAttention('2026-11-03');
  assert.deepEqual(list.map((x) => [x.title, x.deadline_state]), [['Tugas lama', 'overdue'], ['Susun dokumentasi', 'soon']]);
});

test('profil dan pengaturan', () => {
  const s = new DataStore();
  s.setProfile({ full_name: 'Rizki Uji', internship_start: '01/10/2026' });
  assert.equal(s.getProfile().internship_start, '2026-10-01');
  s.setTheme('dark'); assert.equal(s.theme, 'dark');
  assert.throws(() => s.setTheme('biru'), ValidationError);
  s.setDateFormat('YYYY-MM-DD'); assert.equal(s.dateFormat, 'YYYY-MM-DD');
  assert.throws(() => s.setDateFormat('X'), ValidationError);
});

test('persistensi: setiap perubahan disimpan berurutan, snapshot terakhir menang', async () => {
  const saved = [];
  const s = new DataStore(undefined, { save: async (json) => { await new Promise((r) => setTimeout(r, 5)); saved.push(JSON.parse(json).activities.length); } });
  s.createActivity(act()); s.createActivity(act()); s.createActivity(act());
  await s.flush();
  assert.equal(saved.length, 3, 'setiap perubahan memicu satu penyimpanan berurutan');
  assert.equal(saved.at(-1), 3, 'snapshot terakhir berisi semua data');
  assert.deepEqual([...saved].sort((a, b) => a - b), saved, 'tidak pernah mundur');
});

test('kegagalan simpan dilaporkan dan tidak menghentikan antrean', async () => {
  let calls = 0; const errors = [];
  const s = new DataStore(undefined, { save: async () => { calls += 1; if (calls === 1) throw new Error('disk penuh'); } });
  s.onSaveError = (e) => errors.push(e.message);
  s.createActivity(act()); s.createActivity(act());
  await s.flush();
  assert.deepEqual(errors, ['disk penuh']);
  assert.equal(calls, 2);
});
