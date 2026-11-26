import test from 'node:test';
import assert from 'node:assert/strict';
import { JSZip, seededStore, DataStore } from './helpers.mjs';
import { buildWorkbook, colLetter, defaultFilename, escapeXml, ALL_SHEETS, SHEET_MATRIX, SHEET_SUMMARY, SHEET_TASKS, EXPORT_SCOPES } from '../src/js/core/xlsx.js';
import { buildReport, makePeriod } from '../src/js/core/report.js';

async function build(store, opts = {}) {
  const period = makePeriod('month', { year: 2026, month: 11 });
  const report = buildReport(store, period);
  const bytes = await buildWorkbook(JSZip, {
    profile: { full_name: 'Rizki Uji', internship_start: '2026-10-01', internship_end: '2026-12-31' },
    periodLabel: period.label, activities: report.activities, tasks: report.tasks, summary: report, ...opts,
  });
  const zip = await JSZip.loadAsync(bytes);
  return { bytes, zip, report };
}
const text = (zip, name) => zip.file(name).async('string');

test('paket zip memiliki bagian OpenXML wajib dan [Content_Types].xml pertama', async () => {
  const { zip, bytes } = await build(seededStore());
  assert.deepEqual([bytes[0], bytes[1]], [0x50, 0x4b]);
  for (const n of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml',
    'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet4.xml', 'xl/worksheets/sheet5.xml', 'docProps/core.xml']) assert.ok(zip.file(n), n);
});

test('workbook memuat lima sheet bernama sesuai spesifikasi', async () => {
  const { zip } = await build(seededStore());
  const wb = await text(zip, 'xl/workbook.xml');
  const names = [...wb.matchAll(/<sheet name="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(names, ['Data Kegiatan', 'Rekapitulasi', 'Daftar Tugas', 'Refleksi', 'Matriks Program']);
  assert.match(wb, /_xlnm\._FilterDatabase/);
  assert.match(wb, /_xlnm\.Print_Titles/);
});

test('sheet kegiatan: tanggal sebagai serial, jam sebagai pecahan hari, durasi [h]:mm, kolom Ket., total jam, dan blok tanda tangan', async () => {
  const { zip } = await build(seededStore());
  const xml = await text(zip, 'xl/worksheets/sheet1.xml');
  assert.match(xml, /<c r="B5" s="6"><v>46328<\/v><\/c>/); // 2026-11-02
  assert.match(xml, /<c r="F5" s="8"><v>0\.104166/); // 150 menit
  assert.match(xml, /<c r="D5" s="7"><v>0\.3333/); // 08:00
  assert.match(xml, /Membuat laporan/);
  assert.match(xml, /Ket\./);
  assert.match(xml, /JUMLAH JAM KEGIATAN/);
  assert.match(xml, /4\.75 jam/);
  assert.match(xml, /Pembimbing Instansi/);
  assert.match(xml, /Dosen Pembimbing/);
  assert.match(xml, /<pane xSplit="2" ySplit="4" topLeftCell="C5"/);
  assert.match(xml, /<autoFilter ref="A4:N7"\/>/);
  const rows = [...xml.matchAll(/<row r="(\d+)"/g)].length;
  assert.equal(rows, 2 + 1 + 3 + 1 + 4); // judul(2), header(1), 3 data, total jam(1), tanda tangan(4)
  const styles = await text(zip, 'xl/styles.xml');
  assert.match(styles, /formatCode="\[h\]:mm"/);
  assert.match(styles, /formatCode="dd\/mm\/yyyy"/);
});

test('format tanggal mengikuti pengaturan', async () => {
  const { zip } = await build(seededStore(), { dateFormat: 'DD MMM YYYY' });
  assert.match(await text(zip, 'xl/styles.xml'), /formatCode="dd mmm yyyy"/);
  const b = await build(seededStore(), { dateFormat: 'YYYY-MM-DD' });
  assert.match(await text(b.zip, 'xl/styles.xml'), /formatCode="yyyy-mm-dd"/);
});

test('rekapitulasi: ringkasan dan persentase kategori', async () => {
  const { zip, report } = await build(seededStore());
  const xml = await text(zip, 'xl/worksheets/sheet2.xml');
  assert.match(xml, /Rizki Uji/);
  assert.match(xml, /Politeknik/);
  assert.match(xml, /Instansi \/ Mitra/);
  assert.match(xml, /01\/10\/2026 s\.d\. 31\/12\/2026/);
  assert.match(xml, /<mergeCell ref="B5:D5"\/>/);
  assert.equal(report.total_activities, 3);
  assert.match(xml, /<c r="D\d+" s="14"><v>0\.3333/);
});

test('sheet tugas dan refleksi: hanya kegiatan berisi refleksi', async () => {
  const { zip } = await build(seededStore());
  const tasks = await text(zip, 'xl/worksheets/sheet3.xml');
  assert.match(tasks, /Susun dokumentasi/); assert.match(tasks, /Tinggi/); assert.match(tasks, /Selesai/);
  const refl = await text(zip, 'xl/worksheets/sheet4.xml');
  assert.match(refl, /Testing modul A/);
  assert.doesNotMatch(refl, /Rapat mingguan/);
  assert.match(refl, /Data uji kurang/);
});

test('export tanpa data tetap menghasilkan berkas valid dengan header', async () => {
  const { zip } = await build(new DataStore());
  const xml = await text(zip, 'xl/worksheets/sheet1.xml');
  assert.match(xml, /Nomor/);
  assert.match(xml, /<autoFilter ref="A4:N5"\/>/);
  assert.match(await text(zip, 'xl/worksheets/sheet2.xml'), /Belum ada kegiatan pada periode ini/);
  assert.match(await text(zip, 'xl/worksheets/sheet5.xml'), /MATRIKS PROGRAM KEGIATAN DI INSTANSI/);
});

test('cakupan export: rekap saja, tugas saja, dan matriks saja', async () => {
  const a = await build(seededStore(), { sheets: EXPORT_SCOPES.recap.sheets });
  assert.deepEqual([...(await text(a.zip, 'xl/workbook.xml')).matchAll(/<sheet name="([^"]+)"/g)].map((m) => m[1]), [SHEET_SUMMARY]);
  const b = await build(seededStore(), { sheets: EXPORT_SCOPES.tasks.sheets });
  assert.ok(!b.zip.file('xl/worksheets/sheet2.xml'));
  assert.match(await text(b.zip, 'xl/workbook.xml'), new RegExp(SHEET_TASKS));
  const m = await build(seededStore(), { sheets: EXPORT_SCOPES.matrix.sheets });
  assert.deepEqual([...(await text(m.zip, 'xl/workbook.xml')).matchAll(/<sheet name="([^"]+)"/g)].map((x) => x[1]), [SHEET_MATRIX]);
  await assert.rejects(build(seededStore(), { sheets: [] }), /setidaknya satu/);
});

test('karakter XML khusus, kontrol, dan formula tidak dieksekusi', async () => {
  const s = new DataStore();
  s.createActivity({ title: '=HYPERLINK("x") <b>&</b>', date: '2026-11-02', start_time: '08:00', end_time: '09:00', category_id: 1, description: 'a\u0001b\nbaris dua' });
  const { zip } = await build(s);
  const xml = await text(zip, 'xl/worksheets/sheet1.xml');
  assert.match(xml, /t="inlineStr"><is><t xml:space="preserve">=HYPERLINK\(&quot;x&quot;\) &lt;b&gt;&amp;&lt;\/b&gt;/);
  assert.doesNotMatch(xml, /\u0001/);
  assert.doesNotMatch(xml, /<f>/);
});

test('utilitas: huruf kolom, escape, nama berkas bawaan dan judul program', async () => {
  assert.deepEqual([1, 26, 27, 52, 53, 702, 703].map(colLetter), ['A', 'Z', 'AA', 'AZ', 'BA', 'ZZ', 'AAA']);
  assert.equal(escapeXml('<&>"'), '&lt;&amp;&gt;&quot;');
  assert.equal(defaultFilename('Budi Santoso', '2026-11-02'), 'Laporan_Kegiatan_Budi_20261102.xlsx');
  assert.equal(defaultFilename('', '2026-11-02'), 'Laporan_Kegiatan_Mahasiswa_20261102.xlsx');
  assert.equal(defaultFilename('../../x', '2026-11-02'), 'Laporan_Kegiatan_x_20261102.xlsx');
  assert.equal(defaultFilename('Budi', '2026-11-02', 'mbkm'), 'Laporan_MBKM_Budi_20261102.xlsx');
  assert.equal(defaultFilename('Budi', '2026-11-02', 'pkl'), 'Laporan_PKL_Budi_20261102.xlsx');
  assert.equal(defaultFilename('Budi', '2026-11-02', 'magang'), 'Laporan_Magang_Budi_20261102.xlsx');
  assert.equal(ALL_SHEETS.length, 5);

  const mbkm = await build(seededStore(), {
    profile: {
      full_name: 'Rizki Slamet Aryanto',
      student_id: '2402070',
      company: 'Badan Penanggulangan Bencana Daerah Kabupaten Tegal',
      company_address: 'Jl. Gatot Subroto No.5, Slawi Kulon',
      supervisor: 'Putu Leo Kharisma Bangsa, S.Kom',
      supervisor_id: 'BNIP.199311262023211020',
      academic_supervisor: 'Muhamad Ainurohman, S.Kom',
      academic_supervisor_id: 'NUPTK.2463268669130302',
      program_type: 'mbkm',
    },
  });
  assert.match(await text(mbkm.zip, 'xl/worksheets/sheet1.xml'), /Data Kegiatan MBKM/);
  assert.match(await text(mbkm.zip, 'xl/worksheets/sheet2.xml'), /Rekapitulasi Kegiatan MBKM/);
  assert.match(await text(mbkm.zip, 'xl/worksheets/sheet2.xml'), /Informasi Mahasiswa MBKM/);
  assert.match(await text(mbkm.zip, 'xl/worksheets/sheet3.xml'), /Daftar Tugas MBKM/);

  const matrixXml = await text(mbkm.zip, 'xl/worksheets/sheet5.xml');
  assert.match(matrixXml, /MATRIKS PROGRAM KEGIATAN MBKM DI INSTANSI/);
  assert.match(matrixXml, /BULAN NOVEMBER TAHUN 2026/);
  assert.match(matrixXml, /Badan Penanggulangan Bencana Daerah Kabupaten Tegal/);
  assert.match(matrixXml, /Jl\. Gatot Subroto No\.5, Slawi Kulon/);
  assert.match(matrixXml, /Putu Leo Kharisma Bangsa, S\.Kom/);
  assert.match(matrixXml, /BNIP\.199311262023211020/);
  assert.match(matrixXml, /Muhamad Ainurohman, S\.Kom/);
  assert.match(matrixXml, /NUPTK\.2463268669130302/);
  assert.match(matrixXml, /NIM\.2402070/);
  assert.match(matrixXml, /JUMLAH JAM KEGIATAN/);
});
