import test from 'node:test';
import assert from 'node:assert/strict';
import { seededStore, DataStore } from './helpers.mjs';
import { parseBackup, loadState } from '../src/js/core/backup.js';
import { BackupError } from '../src/js/core/errors.js';

test('snapshot -> parseBackup mengembalikan data identik', () => {
  const s = seededStore();
  s.setProfile({ full_name: 'Rizki', internship_start: '01/10/2026' });
  s.setTheme('dark');
  const restored = new DataStore(parseBackup(s.snapshot()));
  assert.deepEqual(restored.listActivities(), s.listActivities());
  assert.deepEqual(restored.listTasks(), s.listTasks());
  assert.equal(restored.theme, 'dark');
  assert.equal(restored.getProfile().full_name, 'Rizki');
  assert.equal(restored.createActivity({ ...restored.listActivities()[0], title: 'Baru' }) > 3, true);
});

test('berkas rusak / bukan JSON / bukan PurbayaLog ditolak; backup lama MagangLog tetap diterima', () => {
  for (const bad of ['', 'bukan database', '{ "a": ', '[]', '{}', '{"app":"Lain","version":1}', 'null']) {
    assert.throws(() => parseBackup(bad), BackupError, bad);
  }
  const legacy = JSON.parse(seededStore().snapshot());
  legacy.app = 'MagangLog';
  const restoredLegacy = new DataStore(parseBackup(JSON.stringify(legacy)));
  assert.equal(restoredLegacy.listActivities().length, 3);
});

test('versi lebih baru ditolak dengan pesan jelas', () => {
  const o = JSON.parse(seededStore().snapshot()); o.version = 99;
  assert.throws(() => parseBackup(JSON.stringify(o)), /lebih baru/);
});

test('bagian hilang / rekaman tidak valid ditolak', () => {
  const base = () => JSON.parse(seededStore().snapshot());
  let o = base(); delete o.tasks; assert.throws(() => parseBackup(JSON.stringify(o)), /tidak lengkap/);
  o = base(); o.activities[0].title = ''; assert.throws(() => parseBackup(JSON.stringify(o)), /Kegiatan ke-1/);
  o = base(); o.activities[0].category_id = 777; assert.throws(() => parseBackup(JSON.stringify(o)), /Kegiatan ke-1/);
  o = base(); o.activities[1].id = o.activities[0].id; assert.throws(() => parseBackup(JSON.stringify(o)), /id/);
  o = base(); o.tasks[0].status = 'x'; assert.throws(() => parseBackup(JSON.stringify(o)), /Tugas ke-1/);
});

test('counter dipulihkan agar id baru tidak bentrok', () => {
  const o = JSON.parse(seededStore().snapshot()); o.counters = {};
  const s = new DataStore(parseBackup(JSON.stringify(o)));
  const ids = new Set(s.state.activities.map((a) => a.id));
  assert.equal(ids.has(s.createActivity({ ...s.listActivities()[0] })), false);
});

test('loadState: tidak ada data -> state kosong; teks rusak -> BackupError', () => {
  assert.equal(loadState(null).activities.length, 0);
  assert.throws(() => loadState('{ rusak'), BackupError);
});
