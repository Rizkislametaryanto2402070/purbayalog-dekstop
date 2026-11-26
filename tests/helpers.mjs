import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
export const JSZip = require(path.join(ROOT, 'src/vendor/jszip.min.js'));

export const { DataStore, emptyState } = await import('../src/js/core/store.js');

export function act(over = {}) {
  return {
    title: 'Membuat laporan', date: '2026-11-02', start_time: '08:00', end_time: '10:30', category_id: 3,
    description: 'Deskripsi', result: 'Hasil', obstacle: '', solution: '', reflection: '', ...over,
  };
}

export function seededStore() {
  const s = new DataStore();
  s.createActivity(act());
  s.createActivity(act({ title: 'Rapat mingguan', date: '2026-11-03', start_time: '13:00', end_time: '14:00', category_id: 5, result: '', description: '' }));
  s.createActivity(act({ title: 'Testing modul A', date: '2026-11-03', start_time: '15:00', end_time: '16:15', category_id: 8, obstacle: 'Data uji kurang', solution: 'Buat data', reflection: 'Perlu rencana', result: '' }));
  s.createTask({ title: 'Susun dokumentasi', priority: 'high', deadline: '2026-11-05', created_at: '2026-11-01' });
  s.createTask({ title: 'Review kode', status: 'done', created_at: '2026-11-02' });
  s.createTask({ title: 'Tugas lama', created_at: '2026-09-01', deadline: '2026-09-10' });
  return s;
}
