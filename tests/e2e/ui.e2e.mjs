// Uji UI end-to-end di browser (Chromium via Playwright) terhadap server statis.
// Jalankan: node tools/serve.mjs & node tests/e2e/ui.e2e.mjs   (butuh paket "playwright")
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.env.E2E_OUT || path.join(here, 'out');
fs.mkdirSync(OUT, { recursive: true });
const URL_ = process.env.E2E_URL || 'http://127.0.0.1:5173/';

const results = [];
async function check(name, fn) {
  try { await fn(); results.push({ name, ok: true }); console.log(`PASS  ${name}`); } catch (e) { results.push({ name, ok: false, error: String(e.message).split('\n')[0] }); console.log(`FAIL  ${name}\n      ${String(e.message).split('\n')[0]}`); }
}
const eq = (a, b, msg = '') => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} diharapkan ${JSON.stringify(b)}, didapat ${JSON.stringify(a)}`); };
const ok = (v, msg = 'kondisi salah') => { if (!v) throw new Error(msg); };

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, acceptDownloads: true });
const page = await context.newPage();
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
const external = [];
page.on('request', (r) => { const u = r.url(); if (!u.startsWith(URL_.replace(/\/$/, '')) && !u.startsWith('blob:') && !u.startsWith('data:')) external.push(u); });

const nav = (key) => page.click(`.nav-item[data-key="${key}"]`);
const text = (sel) => page.textContent(sel);
async function fillForm({ title, date, start, end, category, result = '' }) {
  const f = page.locator('form.card');
  await f.locator('input').nth(0).fill(title);
  await f.locator('input').nth(1).fill(date);
  await f.locator('input').nth(2).fill(start);
  await f.locator('input').nth(3).fill(end);
  await f.locator('select').selectOption({ label: category });
  if (result) await f.locator('textarea').nth(1).fill(result);
}

await page.goto(URL_);
await page.waitForSelector('.nav-item');

await check('dashboard kosong tampil dengan empty state', async () => {
  ok((await text('.content')).includes('Belum ada kegiatan'));
  eq(await text('.stat .value >> nth=1'), '0');
  await page.screenshot({ path: path.join(OUT, 'dashboard-kosong-light.png') });
});

await check('validasi inline form: kosong, lalu jam selesai lebih awal', async () => {
  await nav('form');
  await page.click('#form-save');
  ok(await page.locator('.field .err:not([hidden])').count() >= 3, 'galat nama/jam/kategori');
  await fillForm({ title: 'Uji', date: '02/11/2026', start: '10:00', end: '09:00', category: 'Development' });
  await page.click('#form-save');
  ok((await page.locator('.field .err:not([hidden])').allTextContents()).join(' ').includes('tengah malam'));
  await page.screenshot({ path: path.join(OUT, 'form-galat-light.png') });
});

await check('durasi tampil langsung saat jam diisi', async () => {
  await page.locator('form.card input').nth(2).fill('09:00');
  await page.locator('form.card input').nth(3).fill('10:15');
  eq(await text('form.card b[aria-live]'), '1 jam 15 menit');
});

await check('pelindung perubahan belum disimpan: tetap di halaman, lalu buang', async () => {
  await nav('history');
  ok(await page.locator('.modal').isVisible());
  await page.click('.modal .btn:has-text("Tetap di sini")');
  ok(await page.locator('h1:has-text("Catat Kegiatan")').isVisible());
  await nav('history');
  await page.click('.modal .btn:has-text("Buang perubahan")');
  ok(await page.locator('h1:has-text("Riwayat Kegiatan")').isVisible());
});

await check('simpan 3 kegiatan lalu dashboard menampilkan angka nyata', async () => {
  await nav('form');
  await fillForm({ title: 'Membuat laporan', date: '02/11/2026', start: '08:00', end: '10:30', category: 'Development', result: 'Laporan selesai' });
  await page.click('#form-save');
  ok((await page.locator('.toast').allTextContents()).join().includes('Kegiatan disimpan'));
  await fillForm({ title: 'Rapat mingguan', date: '03/11/2026', start: '13:00', end: '14:00', category: 'Meeting' });
  await page.click('#form-save');
  await fillForm({ title: 'Testing modul A', date: '03/11/2026', start: '15:00', end: '16:15', category: 'Testing' });
  await page.click('#form-save');
  await nav('dashboard');
  const values = await page.locator('.stat .value').allTextContents();
  eq(values[1], '3', 'aktivitas'); eq(values[0], '2', 'hari tercatat'); eq(values[2], '4,8', 'jam');
  await page.screenshot({ path: path.join(OUT, 'dashboard-data-light.png') });
});

await check('riwayat: tabel, pencarian, filter kategori dan tanggal, tanggal tidak valid', async () => {
  await nav('history');
  eq(await page.locator('tbody tr').count(), 3);
  await page.locator('input[type=search]').fill('rapat');
  await page.waitForTimeout(350);
  eq(await page.locator('tbody tr').count(), 1);
  await page.click('#history-reset');
  await page.locator('.field:has(label:text("Dari tanggal")) input').fill('03/11/2026');
  await page.locator('.field:has(label:text("Dari tanggal")) input').dispatchEvent('change');
  eq(await page.locator('tbody tr').count(), 2);
  await page.locator('.field:has(label:text("Dari tanggal")) input').fill('bukan tanggal');
  await page.locator('.field:has(label:text("Dari tanggal")) input').dispatchEvent('change');
  ok((await text('.content')).includes('Perbaiki filter'));
  ok(await page.locator('.field .err:not([hidden])').count() >= 1);
  await page.click('#history-reset');
  await page.locator('input[type=search]').fill('tidak ada yang cocok');
  await page.waitForTimeout(350);
  ok((await text('.content')).includes('Tidak ada hasil'));
  await page.click('#history-reset');
});

await check('kalender aktivitas menandai hari berisi kegiatan', async () => {
  await page.click('.segmented button:has-text("Kalender")');
  ok(await page.locator('button.day.has').count() >= 1);
  await page.screenshot({ path: path.join(OUT, 'riwayat-kalender-light.png') });
  await page.click('.segmented button:has-text("Tabel")');
});

await check('edit dari riwayat lalu hapus dengan konfirmasi', async () => {
  await page.locator('tbody tr:has-text("Rapat mingguan") button[aria-label="Edit kegiatan"]').click();
  ok(await page.locator('h1:has-text("Edit Kegiatan")').isVisible());
  await page.locator('form.card input').nth(0).fill('Rapat diedit');
  await page.click('#form-save');
  ok(await page.locator('h1:has-text("Riwayat Kegiatan")').isVisible());
  ok(await page.locator('tbody tr:has-text("Rapat diedit")').count() === 1);
  await page.locator('tbody tr:has-text("Rapat diedit") button[aria-label="Hapus kegiatan"]').click();
  await page.click('.modal .btn.danger');
  eq(await page.locator('tbody tr').count(), 2);
});

await check('tugas: validasi, tambah, ubah status, edit, hapus', async () => {
  await nav('tasks');
  await page.click('#task-new');
  await page.click('.modal .btn.primary');
  ok(await page.locator('.modal .err:not([hidden])').count() >= 1);
  await page.locator('.modal input').first().fill('Susun dokumentasi');
  const inputs = page.locator('.modal .field input');
  await inputs.nth(1).fill('01/11/2026');
  await inputs.nth(2).fill('01/09/2026');
  await page.click('.modal .btn.primary');
  ok((await page.locator('.modal .err:not([hidden])').allTextContents()).join().includes('lebih awal'));
  await inputs.nth(2).fill('02/11/2026');
  await page.click('.modal .btn.primary');
  eq(await page.locator('tbody tr').count(), 1);
  ok((await text('tbody')).includes('Terlambat'));
  await page.locator('tbody select').selectOption('done');
  ok(!(await text('tbody')).includes('Terlambat'), 'tugas selesai tidak lagi terlambat');
  await page.screenshot({ path: path.join(OUT, 'tugas-light.png') });
  await page.locator('tbody button[aria-label="Hapus tugas"]').click();
  await page.click('.modal .btn.danger');
  ok((await text('.content')).includes('Belum ada tugas'));
});

await check('laporan: rekap bulan dan export xlsx berisi 4 sheet', async () => {
  await nav('tasks'); await page.click('#task-new');
  await page.locator('.modal input').first().fill('Tugas untuk laporan');
  await page.click('.modal .btn.primary');
  await nav('reports');
  await page.locator('.segmented button:has-text("Rentang")').click();
  const f = page.locator('.field input[placeholder]');
  await f.nth(0).fill('01/11/2026'); await f.nth(1).fill('30/11/2026');
  await page.click('#report-generate');
  ok((await text('.content')).includes('01/11/2026 s.d. 30/11/2026'));
  const stats = await page.locator('.stat .value').allTextContents();
  eq(stats[0], '2');
  await page.screenshot({ path: path.join(OUT, 'laporan-light.png') });
  await page.selectOption('.field:has(label:text("Jenis export")) select', 'period');
  await page.click('#report-export');
  await page.waitForFunction(() => window.__magang.platform.lastWritten.bytes);
  const bytes = await page.evaluate(() => Array.from(window.__magang.platform.lastWritten.bytes));
  const name = await page.evaluate(() => window.__magang.platform.lastWritten.path);
  ok(/Laporan_Kegiatan_Mahasiswa_\d{8}\.xlsx$/.test(name), `nama berkas ${name}`);
  fs.writeFileSync(path.join(OUT, 'export-ui.xlsx'), Buffer.from(bytes));
  eq([bytes[0], bytes[1]], [0x50, 0x4b]);
});

await check('pengaturan: profil, validasi tanggal, tema gelap, format tanggal, kategori', async () => {
  await nav('settings');
  await page.locator('.field:has(label:text("Nama lengkap")) input').fill('Rizki Uji');
  await page.locator('.field:has(label:text("Tanggal mulai")) input').fill('01/10/2026');
  await page.locator('.field:has(label:text("Tanggal selesai")) input').fill('01/09/2026');
  await page.click('#profile-save');
  ok((await page.locator('.field .err:not([hidden])').allTextContents()).join().includes('sebelum tanggal mulai'));
  await page.locator('.field:has(label:text("Tanggal selesai")) input').fill('31/12/2026');
  await page.click('#profile-save');
  ok((await page.locator('.toast').allTextContents()).join().includes('Profil disimpan'));
  await page.selectOption('.field:has(label:text("Tema")) select', 'dark');
  eq(await page.getAttribute('html', 'data-theme'), 'dark');
  await page.selectOption('.field:has(label:text("Format tanggal")) select', 'YYYY-MM-DD');
  await page.waitForSelector('h1:has-text("Pengaturan")');
  eq(await page.locator('.field:has(label:text("Tanggal mulai")) input').inputValue(), '2026-10-01');
  await page.locator('.field:has(label:text("Kategori baru")) input').fill('Dokumentasi');
  await page.click('#cat-add');
  ok((await text('.list')).includes('Dokumentasi'));
  await page.locator('.field:has(label:text("Kategori baru")) input').fill('dokumentasi');
  await page.click('#cat-add');
  ok((await page.locator('.field .err:not([hidden])').allTextContents()).join().includes('sudah ada'));
  await page.screenshot({ path: path.join(OUT, 'pengaturan-dark.png') });
});

await check('semua halaman dapat dibuka di mode gelap dan terang tanpa galat', async () => {
  for (const mode of ['dark', 'light']) {
    await page.evaluate((m) => { window.__magang.ctx.setTheme(m); }, mode);
    for (const key of ['dashboard', 'form', 'history', 'tasks', 'reports', 'settings']) {
      await page.evaluate(async (k) => { await window.__magang.ctx.navigate(k, {}, { force: true }); }, key);
      await page.screenshot({ path: path.join(OUT, `${key}-${mode}.png`) });
      ok(await page.locator('.page h1').isVisible(), `${key} ${mode}`);
    }
  }
});

await check('data bertahan setelah reload (persistensi)', async () => {
  await page.reload(); await page.waitForSelector('.nav-item');
  await nav('history');
  eq(await page.locator('tbody tr').count(), 2);
});

await check('backup menulis JSON valid; restore memulihkan data dan membuat pengaman', async () => {
  await nav('settings');
  await page.click('#backup-btn');
  await page.waitForFunction(() => window.__magang.platform.lastWritten.path?.includes('PurbayaLog_Backup_'));
  const json = await page.evaluate(() => new TextDecoder().decode(window.__magang.platform.lastWritten.bytes));
  ok(JSON.parse(json).activities.length === 2);
  fs.writeFileSync(path.join(OUT, 'backup.json'), json);
  // hapus semua kegiatan lalu restore
  await page.evaluate(() => { const s = window.__magang.ctx.store; for (const a of s.listActivities()) s.deleteActivity(a.id); });
  const chooser = page.waitForEvent('filechooser');
  await page.click('#restore-btn');
  await (await chooser).setFiles(path.join(OUT, 'backup.json'));
  await page.waitForSelector('.modal');
  ok((await text('.modal')).includes('2 kegiatan'));
  await page.click('.modal .btn.danger');
  await page.waitForSelector('h1:has-text("Dashboard")');
  eq(await page.evaluate(() => window.__magang.ctx.store.listActivities().length), 2);
});

await check('restore berkas rusak ditolak dan data tidak berubah', async () => {
  fs.writeFileSync(path.join(OUT, 'rusak.json'), 'bukan database');
  await nav('settings');
  const chooser = page.waitForEvent('filechooser');
  await page.click('#restore-btn');
  await (await chooser).setFiles(path.join(OUT, 'rusak.json'));
  await page.waitForSelector('.modal');
  ok((await text('.modal')).includes('Data aktif tidak diubah'));
  await page.click('.modal .btn.primary');
  eq(await page.evaluate(() => window.__magang.ctx.store.listActivities().length), 2);
});

await check('data rusak saat start menampilkan layar pemulihan, bukan crash', async () => {
  await page.evaluate(() => localStorage.setItem('purbayalog:data', '{ rusak'));
  await page.reload();
  await page.waitForSelector('#recover-fresh');
  ok((await text('.content')).includes('Data tidak dapat dibaca'));
  await page.screenshot({ path: path.join(OUT, 'pemulihan-light.png') });
  await page.click('#recover-fresh');
  await page.waitForSelector('h1:has-text("Dashboard")');
});

await check('tidak ada galat konsol dan tidak ada permintaan jaringan eksternal', async () => {
  eq(consoleErrors, [], 'galat konsol');
  eq(external, [], 'permintaan eksternal');
});

await check('font Nunito dan Rubik dimuat dari berkas lokal', async () => {
  const fonts = await page.evaluate(async () => { await document.fonts.ready; return [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replaceAll('"', '')); });
  ok(fonts.includes('Nunito') && fonts.includes('Rubik'), `font termuat: ${fonts}`);
});

await browser.close();
const failed = results.filter((r) => !r.ok);
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} lulus`);
process.exit(failed.length ? 1 : 0);
