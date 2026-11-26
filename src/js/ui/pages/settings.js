import { DATE_FORMATS, APP_NAME, APP_VERSION, DEFAULT_PROGRAM_TYPE, PROFILE_FIELDS, PROGRAM_TYPES } from '../../core/config.js';
import { formatDate } from '../../core/dates.js';
import { BackupError, ValidationError } from '../../core/errors.js';
import { applyRestore, backupData, pickBackup } from '../../actions.js';
import * as platform from '../../platform.js';
import { h, replace } from '../dom.js';
import { icon } from '../icons.js';
import { card, confirmDialog, field, iconButton, messageDialog, selectInput, textInput, toast } from '../widgets.js';

export function settingsPage(ctx) {
  const { store } = ctx;
  const profile = store.getProfile();
  const fmt = (d) => formatDate(d, store.dateFormat);
  const example = fmt('2026-12-31');

  // ---- profil
  const pf = {};
  for (const [key, label] of PROFILE_FIELDS) pf[key] = field({ label, control: textInput({ value: profile[key] || '' }) });
  pf.program_type = field({
    label: 'Jenis program',
    help: 'Menyesuaikan judul & nama file laporan Excel (opsional)',
    control: selectInput(Object.entries(PROGRAM_TYPES), profile.program_type || DEFAULT_PROGRAM_TYPE),
  });
  pf.internship_start = field({
    label: 'Tanggal mulai',
    help: `Contoh: ${example}`,
    control: textInput({ value: profile.internship_start ? fmt(profile.internship_start) : '', placeholder: example }),
  });
  pf.internship_end = field({
    label: 'Tanggal selesai',
    help: `Contoh: ${example}`,
    control: textInput({ value: profile.internship_end ? fmt(profile.internship_end) : '', placeholder: example }),
  });

  function saveProfile() {
    Object.values(pf).forEach((f) => f.setError(null));
    try {
      store.setProfile(Object.fromEntries(Object.entries(pf).map(([k, f]) => [k, f.control.value])));
    } catch (e) {
      if (!(e instanceof ValidationError)) throw e;
      let first = null;
      for (const [k, m] of Object.entries(e.errors)) {
        pf[k]?.setError(m);
        first ||= pf[k];
      }
      first?.control.focus();
      return false;
    }
    toast('Profil disimpan.');
    return true;
  }

  // ---- tampilan
  const theme = field({
    label: 'Tema',
    control: selectInput(
      [
        ['light', 'Mode Terang'],
        ['dark', 'Mode Gelap'],
      ],
      store.theme
    ),
  });
  const dateFormat = field({
    label: 'Format tanggal',
    control: selectInput(
      Object.entries(DATE_FORMATS).map(([k, v]) => [k, `${k}  (${v[0]})`]),
      store.dateFormat
    ),
  });
  theme.control.addEventListener('change', () => {
    ctx.setTheme(theme.control.value);
    toast('Tema diperbarui.');
  });
  dateFormat.control.addEventListener('change', () => {
    store.setDateFormat(dateFormat.control.value);
    toast('Format tanggal diperbarui.');
    ctx.navigate('settings', {}, { force: true });
  });

  // ---- kategori
  const catName = field({ label: 'Kategori baru', control: textInput({ maxLength: 80, placeholder: 'Contoh: Dokumentasi' }) });
  const catList = h('div', { class: 'list' });
  function renderCats() {
    replace(
      catList,
      store.categories().map((c) => {
        const used = store.categoryUsage(c.id);
        return h(
          'div',
          { class: 'item' },
          h('span', { class: 'grow', style: 'font-weight:600', text: c.name }),
          h('span', { class: 'tag-pill tag-teal tabular-nums', text: `${used} kegiatan` }),
          iconButton('trash', `Hapus kategori ${c.name}`, () => {
            try {
              store.deleteCategory(c.id);
              renderCats();
              toast('Kategori dihapus.');
            } catch (e) {
              if (e instanceof ValidationError) toast(e.errors.name, 'error');
              else throw e;
            }
          })
        );
      })
    );
  }
  function addCategory() {
    catName.setError(null);
    try {
      store.addCategory(catName.control.value);
    } catch (e) {
      if (e instanceof ValidationError) {
        catName.setError(e.errors.name);
        return false;
      }
      throw e;
    }
    catName.control.value = '';
    renderCats();
    toast('Kategori ditambahkan.');
    return true;
  }
  renderCats();

  // ---- data
  const location = h('code', { style: 'font-family:var(--font-display);color:var(--teal-700);overflow-wrap:anywhere', text: '...' });
  platform
    .dataLocation()
    .then((p) => {
      location.textContent = p;
    })
    .catch(() => {});

  async function backup() {
    try {
      const path = await backupData(ctx);
      if (!path) return false;
      toast('Backup berhasil dibuat dan diverifikasi.');
      return true;
    } catch (e) {
      await messageDialog({ title: 'Backup gagal', message: e.message, kind: 'error' });
      return false;
    }
  }

  async function restore() {
    let picked;
    try {
      picked = await pickBackup();
    } catch (e) {
      await messageDialog({ title: 'Restore ditolak', message: `${e.message}\n\nData aktif tidak diubah.`, kind: 'error' });
      return false;
    }
    if (!picked) return false;
    const n = picked.state.activities.length;
    const t = picked.state.tasks.length;
    const ok = await confirmDialog({
      title: 'Pulihkan data dari backup?',
      message: `Berkas berisi ${n} kegiatan dan ${t} tugas. Seluruh data aktif akan diganti. Salinan pengaman data aktif dibuat otomatis sebelum penggantian.`,
      confirmText: 'Pulihkan',
      danger: true,
    });
    if (!ok) return false;
    try {
      await applyRestore(ctx, picked.state);
    } catch (e) {
      await messageDialog({
        title: 'Restore gagal',
        message: `${e instanceof BackupError ? e.message : e.message}\n\nData aktif tidak diubah.`,
        kind: 'error',
      });
      return false;
    }
    toast('Data berhasil dipulihkan.');
    ctx.afterRestore();
    return true;
  }

  const grid2 = (...kids) => h('div', { class: 'form-grid-2 grid cols-2' }, kids);
  const el = h(
    'div',
    { class: 'page' },
    h(
      'div',
      { class: 'page-head workspace-title-row' },
      h(
        'div',
        {},
        h('h1', { class: 'workspace-title', text: 'Pengaturan' }),
        h('p', { class: 'workspace-subtitle', text: 'Profil, tampilan, kategori, serta backup dan restore data.' })
      )
    ),
    h(
      'div',
      { class: 'stack' },
      card(
        'Profil Mahasiswa',
        h(
          'div',
          {},
          grid2(...Object.values(pf).map((f) => f.el)),
          h(
            'div',
            { class: 'row', style: 'margin-top:18px;justify-content:flex-end' },
            h('button', { class: 'btn primary btn-primary', type: 'button', id: 'profile-save', onclick: saveProfile }, 'Simpan Profil')
          )
        )
      ),
      card('Tampilan', grid2(theme.el, dateFormat.el)),
      card(
        'Kategori Kegiatan',
        h(
          'div',
          { class: 'stack' },
          h(
            'div',
            { class: 'row', style: 'align-items:flex-end' },
            h('div', { style: 'flex:1;max-width:360px' }, catName.el),
            h('button', { class: 'btn btn-outline', type: 'button', id: 'cat-add', onclick: addCategory }, icon('plus', 15), h('span', { text: 'Tambah' }))
          ),
          catList
        )
      ),
      card(
        'Data & Backup',
        h(
          'div',
          { class: 'stack' },
          h('p', { class: 'muted', style: 'margin:0' }, 'Semua data tersimpan lokal di komputer ini: ', location),
          h(
            'div',
            { class: 'row' },
            h('button', { class: 'btn primary btn-primary', type: 'button', id: 'backup-btn', onclick: backup }, icon('download', 15), h('span', { text: 'Backup Data' })),
            h('button', { class: 'btn btn-outline', type: 'button', id: 'restore-btn', onclick: restore }, icon('upload', 15), h('span', { text: 'Restore Data' }))
          )
        )
      ),
      card(
        'Tentang Aplikasi',
        h(
          'div',
          { class: 'row', style: 'gap:12px' },
          h('img', { src: 'assets/logo-politeknik-purbaya.png', alt: 'Logo Politeknik Purbaya', class: 'brand-logo' }),
          h(
            'div',
            {},
            h('div', { class: 'activity-title', text: `${APP_NAME} v${APP_VERSION} — Politeknik Purbaya` }),
            h('p', {
              class: 'muted',
              style: 'margin:0',
              text: 'Pencatat logbook aktivitas, tugas, dan ekspor laporan Excel secara offline di perangkat Anda.',
            })
          )
        )
      )
    )
  );
  return {
    el,
    saveProfile,
    addCategory,
    backup,
    restore,
    syncTheme(mode) {
      theme.control.value = mode === 'dark' ? 'dark' : 'light';
    },
  };
}
