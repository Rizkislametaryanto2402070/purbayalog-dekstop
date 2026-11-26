import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, JSZip } from './helpers.mjs';

// DOM simulator to test all UI modules, pages, widgets, charts, and redesign interactions in node:test
class MockElement {
  constructor(tag, ns = null) {
    this.tagName = String(tag).toUpperCase();
    this.namespaceURI = ns;
    this.className = '';
    this.id = '';
    this.textContent = '';
    this.value = '';
    this.type = '';
    this.hidden = false;
    this.disabled = false;
    this.dataset = {};
    this.style = {};
    this.attributes = new Map();
    this.children = [];
    this.parentNode = null;
    this.listeners = new Map();
    this.scrollTop = 0;
    const self = this;
    this.classList = {
      add(...cls) {
        const set = new Set(self.className.split(/\s+/).filter(Boolean));
        cls.forEach((c) => set.add(c));
        self.className = [...set].join(' ');
      },
      remove(...cls) {
        const set = new Set(self.className.split(/\s+/).filter(Boolean));
        cls.forEach((c) => set.delete(c));
        self.className = [...set].join(' ');
      },
      toggle(c, force) {
        const set = new Set(self.className.split(/\s+/).filter(Boolean));
        const shouldHave = force !== undefined ? Boolean(force) : !set.has(c);
        if (shouldHave) set.add(c);
        else set.delete(c);
        self.className = [...set].join(' ');
      },
      contains(c) {
        return self.className.split(/\s+/).filter(Boolean).includes(c);
      },
    };
  }
  get firstChild() {
    return this.children[0] || null;
  }
  get offsetParent() {
    return this.hidden ? null : this.parentNode;
  }
  setAttribute(k, v) {
    const val = String(v);
    this.attributes.set(k, val);
    if (k === 'class') this.className = val;
    if (k === 'id') this.id = val;
  }
  getAttribute(k) {
    if (k === 'class') return this.className;
    if (k === 'id') return this.id;
    return this.attributes.get(k) ?? null;
  }
  removeAttribute(k) {
    this.attributes.delete(k);
  }
  append(...nodes) {
    for (const n of nodes) {
      if (n == null) continue;
      const child = typeof n === 'string' ? { nodeType: 3, textContent: n, remove() {} } : n;
      child.parentNode = this;
      this.children.push(child);
    }
  }
  appendChild(n) {
    this.append(n);
    return n;
  }
  remove() {
    if (!this.parentNode) return;
    const idx = this.parentNode.children.indexOf(this);
    if (idx >= 0) this.parentNode.children.splice(idx, 1);
    this.parentNode = null;
  }
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }
  removeEventListener(type, fn) {
    const list = this.listeners.get(type) || [];
    const idx = list.indexOf(fn);
    if (idx >= 0) list.splice(idx, 1);
  }
  dispatchEvent(evt) {
    evt.target = this;
    evt.currentTarget = this;
    evt.preventDefault = evt.preventDefault || (() => {});
    evt.stopPropagation = evt.stopPropagation || (() => {});
    for (const fn of this.listeners.get(evt.type) || []) fn(evt);
  }
  click() {
    this.dispatchEvent({ type: 'click' });
  }
  focus() {
    globalThis.document.activeElement = this;
  }
  querySelectorAll(selector) {
    const out = [];
    const visit = (node) => {
      if (!node || !node.children) return;
      for (const c of node.children) {
        if (c.tagName) {
          if (matches(c, selector)) out.push(c);
          visit(c);
        }
      }
    };
    visit(this);
    return out;
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
  allText() {
    let s = this.textContent || '';
    for (const c of this.children || []) {
      if (c.allText) s += ' ' + c.allText();
      else if (c.textContent) s += ' ' + c.textContent;
    }
    return s;
  }
}

function matches(el, selector) {
  for (const part of selector.split(',').map((s) => s.trim())) {
    if (!part) continue;
    if (part.startsWith('#')) {
      if (el.id === part.slice(1)) return true;
    } else if (part.startsWith('.')) {
      const classes = part.slice(1).split('.');
      if (classes.every((c) => el.classList.contains(c))) return true;
    } else if (part === 'input[type="search"]' || part === 'input[type=search]') {
      if (el.tagName === 'INPUT' && el.type === 'search') return true;
    } else if (part === 'b[aria-live]') {
      if (el.tagName === 'B' && el.attributes.has('aria-live')) return true;
    } else if (el.tagName === part.toUpperCase()) {
      return true;
    }
  }
  return false;
}

function setupDOM() {
  globalThis.Node = MockElement;
  globalThis.Event = class {
    constructor(type, opts = {}) {
      this.type = type;
      Object.assign(this, opts);
    }
  };
  const storage = new Map();
  globalThis.localStorage = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    clear: () => storage.clear(),
  };

  const docEl = new MockElement('html');
  const bodyEl = new MockElement('body');
  const topbarEl = new MockElement('header'); topbarEl.id = 'topbar';
  const subtabsEl = new MockElement('div'); subtabsEl.id = 'subtabs-bar';
  const sidebarEl = new MockElement('aside'); sidebarEl.id = 'sidebar';
  const contentEl = new MockElement('main'); contentEl.id = 'content';
  const toastsEl = new MockElement('div'); toastsEl.id = 'toasts';
  const modalRootEl = new MockElement('div'); modalRootEl.id = 'modal-root';
  bodyEl.append(topbarEl, subtabsEl, sidebarEl, contentEl, toastsEl, modalRootEl);
  docEl.append(bodyEl);

  globalThis.document = {
    documentElement: docEl,
    body: bodyEl,
    activeElement: null,
    title: '',
    createElement: (tag) => new MockElement(tag),
    createElementNS: (ns, tag) => new MockElement(tag, ns),
    createTextNode: (t) => ({ nodeType: 3, textContent: String(t), remove() {} }),
    getElementById: (id) => docEl.querySelector(`#${id}`),
    querySelectorAll: (sel) => docEl.querySelectorAll(sel),
    querySelector: (sel) => docEl.querySelector(sel),
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  globalThis.window = {
    addEventListener: () => {},
    __magang: null,
  };
  globalThis.URL = {
    createObjectURL: () => 'blob:mock',
    revokeObjectURL: () => {},
  };
  globalThis.JSZip = JSZip;
  return { docEl, topbarEl, subtabsEl, sidebarEl, contentEl, toastsEl, modalRootEl };
}

test('integrasi penuh UI redesign: shell 2-kolom, dashboard bento, form, riwayat, tugas, laporan, pengaturan', async () => {
  const { docEl, topbarEl, subtabsEl, sidebarEl, contentEl, modalRootEl } = setupDOM();
  await import(`file:///${path.join(ROOT, 'src/js/main.js').replace(/\\/g, '/')}`);
  await new Promise((r) => setTimeout(r, 30));

  const { ctx, platform } = globalThis.window.__magang;
  assert.ok(ctx, 'konteks aplikasi siap');

  // 1. Shell & Navigasi Redesign
  assert.ok(topbarEl.querySelector('.brand-logo'), 'logo Politeknik Purbaya tampil di topbar');
  assert.ok(topbarEl.allText().includes('PurbayaLog'), 'nama aplikasi PurbayaLog tampil di topbar');
  assert.ok(topbarEl.allText().includes('Logbook Aktivitas Mahasiswa'), 'subjudul netral Logbook Aktivitas Mahasiswa tampil di topbar');
  assert.equal(globalThis.document.title, 'PurbayaLog - Logbook Aktivitas Mahasiswa', 'judul jendela sesuai branding baru');
  assert.equal(topbarEl.querySelectorAll('.primary-nav-btn').length, 2, 'navigasi primer Overview dan Laporan');
  assert.ok(topbarEl.querySelector('.search-capsule'), 'search capsule tampil di topbar');
  assert.equal(subtabsEl.querySelectorAll('.nav-item').length, 6, '6 subtab halaman utama');
  assert.ok(sidebarEl.querySelector('.institution-chip'), 'chip identitas Politeknik Purbaya di panel kanan');
  assert.ok(sidebarEl.querySelector('.cal-grid'), 'kalender mini di panel kanan');
  assert.ok(sidebarEl.querySelector('.timeline-block'), 'pantauan deadline di panel kanan');
  assert.equal(sidebarEl.querySelector('.runtime-footer'), null, 'footer runtime dihapus dari panel kanan');

  // 2. Dashboard kosong
  assert.ok(contentEl.allText().includes('Belum ada kegiatan'));
  assert.ok(contentEl.querySelector('.onboarding-strip'), 'strip onboarding tampil saat data kosong');
  const initialStats = contentEl.querySelectorAll('.stat').map((s) => s.querySelector('.value')?.textContent);
  assert.deepEqual(initialStats.slice(0, 3), ['0', '0', '0,0']);

  // 3. Catat Kegiatan: validasi inline, kalkulasi durasi langsung, pelindung perubahan belum disimpan
  await ctx.navigate('form');
  const formInputs = contentEl.querySelectorAll('input');
  const formSelect = contentEl.querySelector('select');
  assert.equal(await ctx.current.save(), false, 'simpan kosong gagal validasi');
  const visibleErrors = contentEl.querySelectorAll('.err').filter((e) => !e.hidden);
  assert.ok(visibleErrors.length >= 3, 'pesan galat inline tampil');

  formInputs[0].value = 'Membuat laporan';
  formInputs[1].value = '02/11/2026';
  formInputs[2].value = '08:00';
  formInputs[2].dispatchEvent(new Event('input'));
  formInputs[3].value = '10:30';
  formInputs[3].dispatchEvent(new Event('input'));
  assert.equal(contentEl.querySelector('b[aria-live]')?.textContent, '2 jam 30 menit', 'durasi dihitung otomatis');

  // Pelindung perubahan belum disimpan (canLeave menampilkan modal konfirmasi)
  assert.equal(ctx.current.isDirty(), true, 'form terdeteksi dirty');
  const leavePromise = ctx.navigate('history');
  await new Promise((r) => setTimeout(r, 10));
  assert.ok(modalRootEl.querySelector('.modal'), 'modal konfirmasi perubahan belum disimpan tampil');
  // Klik "Tetap di sini"
  modalRootEl.querySelectorAll('button')[0].click();
  assert.equal(await leavePromise, false, 'tetap di halaman form');

  // Simpan 3 kegiatan
  formSelect.value = '3'; // Development
  assert.equal(await ctx.current.save(), true, 'simpan kegiatan pertama berhasil');
  ctx.store.createActivity({ title: 'Rapat mingguan', date: '03/11/2026', start_time: '13:00', end_time: '14:00', category_id: 5 });
  ctx.store.createActivity({ title: 'Testing modul A', date: '03/11/2026', start_time: '15:00', end_time: '16:15', category_id: 8 });

  // 4. Dashboard Bento dengan data nyata
  await ctx.navigate('dashboard', {}, { force: true });
  const populatedStats = contentEl.querySelectorAll('.stat').map((s) => s.querySelector('.value')?.textContent);
  assert.equal(populatedStats[0], '2', 'hari tercatat = 2');
  assert.equal(populatedStats[1], '3', 'total aktivitas = 3');
  assert.equal(populatedStats[2], '4,8', 'total jam = 4,8');
  assert.ok(contentEl.querySelector('.chart'), 'grafik batang SVG tampil');
  assert.equal(contentEl.querySelectorAll('.cat-bar-item').length, 3, '3 kategori aktif tampil di distribusi kategori');
  assert.equal(contentEl.querySelectorAll('.activity-card').length, 3, '3 kartu aktivitas terbaru tampil');

  // 4b. Sinkronisasi pencarian topbar antar-halaman (Dashboard -> Riwayat -> Reset -> Tugas)
  const topSearchInput = topbarEl.querySelector('.search-capsule-input');
  topSearchInput.value = 'Rapat';
  topSearchInput.dispatchEvent(new Event('input'));
  assert.equal(contentEl.querySelectorAll('.activity-card').length, 1, 'pencarian topbar menyaring kartu dashboard');
  await ctx.navigate('history');
  assert.equal(contentEl.querySelector('input[type="search"]').value, 'Rapat', 'kata kunci topbar terbawa saat pindah ke Riwayat');
  assert.equal(contentEl.querySelectorAll('tr').length, 2, 'tabel Riwayat ikut tersaring oleh pencarian topbar');
  contentEl.querySelector('#history-reset').click();
  assert.equal(topSearchInput.value, '', 'Reset filter di Riwayat mengosongkan pencarian topbar');

  // 5. Riwayat: urutan bawaan (Terbaru dulu), tabel, kalender
  await ctx.navigate('history');
  const historySelects = contentEl.querySelectorAll('select');
  assert.equal(historySelects[1].value, 'desc', 'filter Urutan default ke Terbaru dulu (desc)');
  const rowsDesc = contentEl.querySelectorAll('tr');
  assert.equal(rowsDesc.length, 4, '3 baris kegiatan di tabel riwayat');
  assert.ok(rowsDesc[1].allText().includes('Testing modul A'), 'baris pertama adalah kegiatan terbaru');
  historySelects[1].value = 'asc';
  historySelects[1].dispatchEvent(new Event('change'));
  assert.ok(contentEl.querySelectorAll('tr')[1].allText().includes('Membuat laporan'), 'urutan asc menampilkan kegiatan terlama dulu');
  historySelects[1].value = 'desc';
  historySelects[1].dispatchEvent(new Event('change'));
  // Beralih ke tampilan Kalender
  const segBtns = contentEl.querySelectorAll('.seg-btn');
  segBtns[1].click();
  assert.ok(contentEl.querySelectorAll('.has').length >= 1, 'kalender menandai tanggal berisi kegiatan');
  segBtns[0].click();

  // 6. Manajemen Tugas: dialog modal tambah, ubah status, sinkronisasi panel kanan & kalender mini
  await ctx.navigate('tasks');
  const dialog = ctx.current.openDialog();
  assert.equal(dialog.save(dialog.api), false, 'validasi form tugas kosong menolak penyimpanan');
  dialog.fields.title.control.value = 'Susun dokumentasi API';
  dialog.fields.created_at.control.value = '01/11/2026';
  dialog.fields.deadline.control.value = '02/11/2026';
  assert.equal(dialog.save(dialog.api), true, 'simpan tugas baru berhasil');
  assert.equal(contentEl.querySelectorAll('tr').length, 2, '1 tugas tampil di tabel');
  assert.ok(sidebarEl.allText().includes('Susun dokumentasi API'), 'panel kanan otomatis menampilkan tugas di Pantauan Deadline');
  assert.ok(sidebarEl.querySelector('.cal-legend'), 'legenda kalender mini tampil');

  // Cek geser bulan kalender mini tidak menimpa selectedDate ke tanggal 1
  const prevSelected = ctx.selectedDate;
  const calNavBtns = sidebarEl.querySelector('.calendar-header').querySelectorAll('.icon-btn');
  calNavBtns[0].click();
  assert.equal(ctx.selectedDate, prevSelected, 'geser bulan kalender tidak menimpa tanggal terpilih');
  sidebarEl.querySelector('.calendar-header').querySelectorAll('.icon-btn')[1].click();

  // Cek tombol Reset filter pada tugas saat pencarian kosong
  const taskSearch = contentEl.querySelector('input[type="search"]');
  taskSearch.value = 'tidak_ada_tugas_xyz';
  taskSearch.dispatchEvent(new Event('input'));
  await new Promise((r) => setTimeout(r, 230));
  assert.ok(contentEl.allText().includes('Reset filter'), 'tampilan tugas kosong hasil filter punya tombol Reset filter');
  ctx.syncQuickSearch('');

  // 7. Laporan & Export Excel (.xlsx)
  await ctx.navigate('reports');
  ctx.current.setKind('all');
  assert.equal(ctx.current.generate(), true);
  assert.ok(contentEl.querySelector('.report-stats-grid'), 'grid statistik laporan memakai class responsif');
  assert.equal(await ctx.current.doExport(), true);
  assert.ok(platform.lastWritten.path.endsWith('.xlsx'), 'berkas .xlsx berhasil ditulis');
  assert.deepEqual([platform.lastWritten.bytes[0], platform.lastWritten.bytes[1]], [0x50, 0x4b], 'header ZIP OpenXML valid');

  // 8. Pengaturan: profil (jenis program), tema gelap/terang, kategori, backup, tentang aplikasi
  await ctx.navigate('settings');
  assert.ok(contentEl.allText().includes('Profil Mahasiswa'), 'judul Profil Mahasiswa tampil di Pengaturan');
  assert.ok(contentEl.allText().includes('Politeknik'), 'label Politeknik tampil di Profil Mahasiswa');
  assert.ok(contentEl.allText().includes('Instansi / Mitra'), 'label Instansi / Mitra tampil di Profil Mahasiswa');
  assert.ok(contentEl.allText().includes('Alamat instansi / mitra'), 'label Alamat instansi / mitra tampil di Profil Mahasiswa');
  assert.ok(contentEl.allText().includes('Pembimbing instansi'), 'label Pembimbing instansi tampil di Profil Mahasiswa');
  assert.ok(contentEl.allText().includes('NIP / BNIP pembimbing instansi'), 'label NIP / BNIP tampil di Profil Mahasiswa');
  assert.ok(contentEl.allText().includes('Dosen pembimbing'), 'label Dosen pembimbing tampil di Profil Mahasiswa');
  assert.ok(contentEl.allText().includes('NUPTK / NIDN dosen pembimbing'), 'label NUPTK / NIDN tampil di Profil Mahasiswa');
  assert.ok(contentEl.allText().includes('Tentang Aplikasi'), 'kartu Tentang Aplikasi tampil');
  assert.ok(
    contentEl.allText().includes('Pencatat logbook aktivitas, tugas, dan ekspor laporan Excel secara offline di perangkat Anda.'),
    'deskripsi informatif kartu Tentang Aplikasi tampil'
  );
  const settingsSelects = contentEl.querySelectorAll('select');
  assert.equal(settingsSelects[0].value, 'umum', 'jenis program default adalah umum');
  settingsSelects[0].value = 'mbkm';
  assert.equal(ctx.current.saveProfile(), true, 'simpan profil dengan jenis program MBKM berhasil');
  ctx.setTheme('dark');
  assert.equal(docEl.dataset.theme, 'dark');
  assert.equal(settingsSelects[1].value, 'dark', 'dropdown Tema di Pengaturan ikut tersinkron ke mode gelap');
  assert.ok(sidebarEl.querySelector('.institution-chip'), 'panel kanan tetap sinkron saat ganti tema');
  ctx.setTheme('light');
  assert.equal(docEl.dataset.theme, 'light');
  assert.equal(settingsSelects[1].value, 'light', 'dropdown Tema di Pengaturan ikut tersinkron ke mode terang');
  assert.equal(await ctx.current.backup(), true, 'backup JSON berhasil');
  assert.ok(platform.lastWritten.path.includes('PurbayaLog_Backup_'));

  // Pastikan ekspor Excel setelah pilih MBKM memakai awalan Laporan_MBKM_
  await ctx.navigate('reports');
  ctx.current.setKind('all');
  assert.equal(await ctx.current.doExport(), true);
  assert.ok(platform.lastWritten.path.includes('Laporan_MBKM_'), 'nama berkas ekspor menyesuaikan jenis program MBKM');

  // Pastikan aset logo lokal benar-benar tersedia di src/assets/
  const logoStat = fs.statSync(path.join(ROOT, 'src/assets/logo-politeknik-purbaya.png'));
  assert.ok(logoStat.size > 10000, 'berkas logo Politeknik Purbaya tersedia secara lokal');
});
