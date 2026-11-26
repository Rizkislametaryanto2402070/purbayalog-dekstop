# TEST_REPORT - PurbayaLog (Tauri v2) 1.0.0

Tanggal pembaruan laporan: 25 November 2026. Lingkungan: Windows, Node v22.23.4, Rust/Cargo, Microsoft Edge (CDP).

## 1. Ringkasan jujur

| Bagian | Diuji? | Hasil |
|---|---|---|
| Logika bisnis JS & integrasi UI (`dates`, `validators`, `store`, `report`, `backup`, `xlsx`, `offline`, `ui`) | Ya, `node --test` | **64/64 lulus** |
| Inti Rust `core/` (tulis atomik, backup pengaman, validasi jalur, log) | Ya, `cargo test` | **16/16 lulus** |
| Antarmuka lengkap di browser (Edge CDP: 6 halaman, Light/Dark, sinkronisasi pencarian, kalender mini, ekspor `.xlsx`) | Ya, Edge headless CDP | **Lulus (0 galat konsol)** |
| Skrip Playwright (`tests/e2e/ui.e2e.mjs`) | Tidak dijalankan ulang | Memerlukan paket `playwright` yang tidak dipasang di `devDependencies` |
| Kompilasi backend Tauri (`src-tauri/`) & installer Windows | Ya (`npx tauri build -- --offline`) | **Lulus**, menghasilkan `purbayalog.exe`, `PurbayaLog_1.0.0_x64-setup.exe`, dan `PurbayaLog_1.0.0_x64_en-US.msi` |
| Interaksi native di jendela `.exe` (dialog simpan/buka `tauri-plugin-dialog`, baca `tauri-plugin-fs`, tutup jendela `onCloseRequested`, buka di Microsoft Excel) | **Belum diuji interaktif** | Perlu uji klik manual langsung di Windows melalui `purbayalog.exe` |

## 2. Rincian pengujian

### Node (`npm run test`) - 64 pengujian

| Berkas | Jumlah | Cakupan |
|---|---|---|
| dates.test.mjs | 9 | parse 7 format tanggal, 11 input tidak valid, tahun kabisat, format 4 jenis, hari/minggu Senin-Minggu, aritmetika tanggal tanpa DST, serial Excel (diverifikasi 3 nilai), jam, durasi |
| validators.test.mjs | 10 | kegiatan valid, nama kosong, batas panjang (150/5000), jam selesai <= mulai, banyak galat sekaligus, kategori tidak ada, Unicode, tugas (bawaan, deadline, prioritas, status), profil, kategori |
| store.test.mjs | 15 | CRUD, id tidak dipakai ulang, pencarian (case-insensitive, `%` dan `_` literal), filter, sorting, paginasi, kategori, tugas, status deadline, perlu perhatian, profil/pengaturan, persistensi berurutan, kegagalan simpan dilaporkan |
| report.test.mjs | 9 | periode (5 jenis + galat), rekap bulan/hari/minggu, periode kosong, tugas pada periode, angka dashboard, masa magang belum mulai/selesai, sapaan |
| backup.test.mjs | 6 | round-trip identik, berkas rusak/bukan PurbayaLog/JSON kosong ditolak (backup lama `MagangLog` tetap diterima), versi lebih baru, rekaman tidak valid, id ganda, counter pulih |
| xlsx.test.mjs | 10 | bagian OpenXML wajib, 5 nama sheet (*Data Kegiatan*, *Rekapitulasi*, *Daftar Tugas*, *Refleksi*, *Matriks Program*) & judul program, kolom `Ket.`, total jam & blok tanda tangan 3 pihak, matriks tanggal 1-31 berwarna ganjil/genap, tanggal serial, jam/durasi pecahan hari, `[h]:mm`, freeze pane, filter, label `Politeknik` & `Instansi / Mitra`, default pemilik `Mahasiswa`, format tanggal mengikuti pengaturan, rekap, refleksi hanya yang berisi, export tanpa data, cakupan export, karakter XML khusus/kontrol/formula |
| offline.test.mjs | 4 | tanpa URL eksternal / `fetch` / XHR, tanpa emoji dan gradient, `index.html` hanya sumber lokal + CSP ketat, font lokal ada, izin Tauri tanpa `fs:allow-write` |
| ui.test.mjs | 1 | integrasi shell 2-kolom tanpa footer runtime, dashboard bento, sinkronisasi pencarian topbar, urutan bawaan Riwayat (`desc`), kalender mini & legenda, modal tugas, grid laporan responsif, label `Politeknik` & `Instansi / Mitra`, opsi `Jenis program`, kartu `Tentang Aplikasi`, sinkronisasi tema Pengaturan, backup JSON, dan ketersediaan aset logo |

### Rust (`npm run test:rust`) - 16 pengujian
Tulis atomik (buat, ganti, tanpa sisa berkas sementara, target folder ditolak, kegagalan tidak merusak berkas lama), store (kosong -> `None`, round-trip, `.bak`, tolak non-objek tanpa menyentuh berkas, tolak data terlalu besar, UTF-8 tidak valid), backup pengaman, pemangkasan backup, cap waktu, percent-decode (Unicode, galat), validasi ekstensi tujuan, override folder data, log, dan pesan izin ditolak.

### Verifikasi browser langsung (Edge CDP)
Memverifikasi font lokal (`Nunito` & `Rubik`), dashboard kosong & terisi data, grafik SVG, Mode Terang & Gelap (`color-scheme`), sinkronisasi pencarian topbar & reset filter, kalender mini & legenda, validasi inline formulir + durasi otomatis, riwayat (tabel & kalender), tugas, laporan + ekspor `.xlsx` (header ZIP valid `PK`), sinkronisasi dropdown tema di Pengaturan, serta 0 galat konsol. Tangkapan layar terbaru disimpan di `docs/screenshots/`.

## 3. Belum diuji secara interaktif
- Pengujian manual di dalam jendela `purbayalog.exe` untuk dialog berkas native Windows (`tauri-plugin-dialog` & `tauri-plugin-fs`), perilaku kunci file saat berkas `.xlsx` sedang dibuka di Microsoft Excel, serta dialog konfirmasi tutup jendela (`onCloseRequested`) saat formulir berisi perubahan belum disimpan.
- Pengujian beban besar (puluhan ribu kegiatan) dan audit aksesibilitas formal WCAG.

## 4. Kriteria penerimaan

| Kriteria | Status |
|---|---|
| Dashboard data nyata & desain Bento 2-kolom | LULUS (UI di browser) |
| Catat/edit/hapus, riwayat, cari, filter, kalender | LULUS |
| Tugas, deadline | LULUS |
| Rekap per periode | LULUS |
| Export Excel valid, 5 sheet (termasuk Matriks Program & TTD 3 pihak) | LULUS (logika + OpenXML ZIP header di browser) |
| Data bertahan, simpan atomik | LULUS (logika + Rust); jalur native Tauri belum diklik manual di `.exe` |
| Backup / Restore | LULUS (logika + UI browser); dialog native belum diklik manual di `.exe` |
| Light/Dark (`color-scheme`) | LULUS |
| Offline & CSP ketat | LULUS |
| Pengujian otomatis | LULUS (`64` JS + `16` Rust + verifikasi Edge CDP) |
| Aplikasi Tauri terkompilasi (`purbayalog.exe`) & installer | **LULUS** (`src-tauri\target\release\purbayalog.exe`, NSIS `PurbayaLog_1.0.0_x64-setup.exe`, MSI `PurbayaLog_1.0.0_x64_en-US.msi`) |
