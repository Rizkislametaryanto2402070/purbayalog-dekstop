import { formatDuration, durationBetween, parseTime, parseDate, todayISO, formatDate } from '../../core/dates.js';
import { ValidationError } from '../../core/errors.js';
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { field, selectInput, textArea, textInput, toast, confirmDialog } from '../widgets.js';

const TEXT_FIELDS = [
  ['description', 'Deskripsi kegiatan', 'Apa yang dikerjakan', 12],
  ['result', 'Hasil yang diperoleh', 'Output atau pembelajaran yang didapat', 12],
  ['obstacle', 'Kendala', 'Hambatan yang dihadapi', 6],
  ['solution', 'Solusi', 'Cara mengatasi kendala', 6],
  ['reflection', 'Refleksi', 'Catatan pribadi tentang kegiatan ini', 12],
];

export function formPage(ctx, params = {}) {
  const { store } = ctx;
  const editId = params.id ?? null;
  const existing = editId != null ? store.getActivity(editId) : null;
  const fmt = (iso) => formatDate(iso, store.dateFormat);
  const example = fmt('2026-12-31');

  const f = {};
  f.title = field({
    label: 'Nama kegiatan',
    required: true,
    span: 12,
    control: textInput({ maxLength: 400, placeholder: 'Contoh: Menyusun dokumentasi API' }),
  });
  f.date = field({
    label: 'Tanggal',
    required: true,
    span: 3,
    help: `Contoh: ${example}`,
    control: textInput({ placeholder: example }),
  });
  f.start_time = field({
    label: 'Jam mulai',
    required: true,
    span: 3,
    help: 'Format HH:MM',
    control: textInput({ class: 'input input-box tabular-nums', placeholder: '08:00' }),
  });
  f.end_time = field({
    label: 'Jam selesai',
    required: true,
    span: 3,
    help: 'Format HH:MM',
    control: textInput({ class: 'input input-box tabular-nums', placeholder: '10:30' }),
  });
  f.category_id = field({
    label: 'Kategori',
    required: true,
    span: 3,
    control: selectInput([['', 'Pilih kategori'], ...store.categories().map((c) => [c.id, c.name])], ''),
  });
  for (const [key, label, help, span] of TEXT_FIELDS) {
    f[key] = field({ label, span, help, control: textArea({ rows: 3 }) });
  }

  const durationEl = h('b', { class: 'duration-badge tabular-nums', 'aria-live': 'polite', text: '-' });
  const value = (k) => f[k].control.value;
  const snapshot = () => JSON.stringify(Object.keys(f).map(value));

  let initial = '';

  function fill(a) {
    f.title.control.value = a?.title ?? '';
    f.date.control.value = fmt(a?.date ?? todayISO());
    f.start_time.control.value = a?.start_time ?? '';
    f.end_time.control.value = a?.end_time ?? '';
    f.category_id.control.value = a ? String(a.category_id) : '';
    for (const [key] of TEXT_FIELDS) f[key].control.value = a?.[key] ?? '';
    Object.values(f).forEach((x) => x.setError(null));
    updateDuration();
    initial = snapshot();
  }

  function updateDuration() {
    try {
      const minutes = durationBetween(parseTime(value('start_time')), parseTime(value('end_time')));
      durationEl.textContent = minutes > 0 ? formatDuration(minutes) : '-';
    } catch {
      durationEl.textContent = '-';
    }
  }

  async function save() {
    Object.values(f).forEach((x) => x.setError(null));
    const data = Object.fromEntries(Object.keys(f).map((k) => [k, value(k)]));
    try {
      if (editId != null) store.updateActivity(editId, data);
      else store.createActivity(data);
    } catch (e) {
      if (e instanceof ValidationError) {
        let firstBad = null;
        for (const [k, message] of Object.entries(e.errors)) {
          f[k]?.setError(message);
          firstBad ||= f[k];
        }
        firstBad?.control.focus();
        return false;
      }
      throw e;
    }
    toast(editId != null ? 'Perubahan kegiatan disimpan.' : 'Kegiatan disimpan.');
    if (editId != null) {
      initial = snapshot();
      ctx.navigate('history');
    } else {
      fill(null);
      f.title.control.focus();
    }
    return true;
  }

  const form = h(
    'form',
    {
      class: 'card',
      novalidate: true,
      onsubmit: (e) => {
        e.preventDefault();
        save();
      },
    },
    h(
      'div',
      { class: 'form-grid' },
      f.title.el,
      f.date.el,
      f.start_time.el,
      f.end_time.el,
      f.category_id.el,
      h(
        'div',
        { class: 'span-12 duration-preview-strip' },
        h('div', { class: 'row', style: 'gap:8px' }, icon('clock', 16), h('span', { class: 'field-label', text: 'Durasi Tercatat:' })),
        durationEl
      ),
      TEXT_FIELDS.map(([k]) => f[k].el)
    ),
    h(
      'div',
      { class: 'row', style: 'margin-top:20px;justify-content:flex-end' },
      h(
        'button',
        {
          class: 'btn btn-outline',
          type: 'button',
          id: 'form-cancel',
          onclick: () => ctx.navigate(editId != null ? 'history' : 'dashboard'),
        },
        'Batal'
      ),
      h(
        'button',
        { class: 'btn primary btn-primary', type: 'submit', id: 'form-save' },
        icon('check', 15),
        h('span', { text: editId != null ? 'Simpan Perubahan' : 'Simpan Kegiatan' })
      )
    )
  );

  for (const k of ['start_time', 'end_time']) f[k].control.addEventListener('input', updateDuration);
  for (const k of ['date']) {
    f[k].control.addEventListener('blur', () => {
      try {
        f[k].control.value = fmt(parseDate(value(k)));
      } catch {
        /* galat ditampilkan saat simpan */
      }
    });
  }

  fill(existing);
  const el = h(
    'div',
    { class: 'page' },
    h(
      'div',
      { class: 'page-head workspace-title-row' },
      h(
        'div',
        {},
        h('h1', { class: 'workspace-title', text: editId != null ? 'Edit Kegiatan' : 'Catat Kegiatan' }),
        h('p', {
          class: 'workspace-subtitle',
          text: editId != null ? 'Ubah data kegiatan yang sudah tercatat.' : 'Tambahkan catatan kegiatan baru. Durasi dihitung otomatis.',
        })
      )
    ),
    form
  );

  return {
    el,
    save,
    isDirty: () => snapshot() !== initial,
    async canLeave() {
      if (snapshot() === initial) return true;
      return confirmDialog({
        title: 'Perubahan belum disimpan',
        message: 'Formulir berisi perubahan yang belum disimpan. Tinggalkan halaman ini dan buang perubahan?',
        confirmText: 'Buang perubahan',
        cancelText: 'Tetap di sini',
        danger: true,
      });
    },
  };
}
