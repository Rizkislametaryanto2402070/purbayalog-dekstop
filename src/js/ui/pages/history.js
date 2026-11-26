import {
  DAYS_SHORT,
  addDays,
  formatDate,
  formatDuration,
  longDate,
  monthName,
  monthRange,
  parseDate,
  todayISO,
  weekday,
} from '../../core/dates.js';
import { truncate } from '../../core/helpers.js';
import { h, replace } from '../dom.js';
import { badge, card, confirmDialog, emptyState, field, iconButton, modal, pager, selectInput, textInput, toast } from '../widgets.js';
import { icon } from '../icons.js';

export function historyPage(ctx, params = {}) {
  const { store } = ctx;
  const fmt = (d) => formatDate(d, store.dateFormat);
  const example = fmt('2026-12-31');
  const state = { page: 1, view: 'table', month: todayISO().slice(0, 7) };

  const search = field({
    label: 'Cari nama kegiatan',
    control: textInput({ placeholder: 'Ketik untuk mencari', type: 'search', value: params.search ?? ctx.quickSearch ?? '' }),
  });
  const category = field({
    label: 'Kategori',
    control: selectInput([['', 'Semua kategori'], ...store.categories().map((c) => [c.id, c.name])]),
  });
  const from = field({ label: 'Dari tanggal', control: textInput({ placeholder: example }) });
  const to = field({ label: 'Sampai tanggal', control: textInput({ placeholder: example }) });
  const order = field({ label: 'Urutan', control: selectInput([['desc', 'Terbaru dulu'], ['asc', 'Terlama dulu']], 'desc') });
  if (params.date) {
    from.control.value = fmt(params.date);
    to.control.value = fmt(params.date);
  }

  const body = h('div');
  const filterError = h('div', { class: 'err', hidden: true });

  function currentFilter() {
    filterError.hidden = true;
    const out = {
      text: search.control.value,
      categoryId: category.control.value ? Number(category.control.value) : null,
      newestFirst: order.control.value === 'desc',
    };
    for (const [ctl, key, label] of [
      [from, 'dateFrom', 'Dari tanggal'],
      [to, 'dateTo', 'Sampai tanggal'],
    ]) {
      ctl.setError(null);
      const raw = ctl.control.value.trim();
      if (!raw) continue;
      try {
        out[key] = parseDate(raw);
      } catch (e) {
        ctl.setError(`${label}: ${e.message}`);
        out.invalid = true;
      }
    }
    if (out.dateFrom && out.dateTo && out.dateTo < out.dateFrom) {
      filterError.textContent = 'Tanggal akhir tidak boleh lebih awal dari tanggal awal.';
      filterError.hidden = false;
      out.invalid = true;
    }
    return out;
  }

  async function remove(a) {
    const ok = await confirmDialog({
      title: 'Hapus kegiatan?',
      message: `Kegiatan "${truncate(a.title, 60)}" akan dihapus permanen.`,
      confirmText: 'Hapus',
      danger: true,
    });
    if (!ok) return false;
    store.deleteActivity(a.id);
    toast('Kegiatan dihapus.');
    render();
    return true;
  }

  function showDetail(a) {
    const rows = [
      ['Tanggal', longDate(a.date)],
      ['Waktu', `${a.start_time} - ${a.end_time} (${formatDuration(a.duration_minutes)})`],
      ['Kategori', a.category_name],
      ['Deskripsi', a.description],
      ['Hasil', a.result],
      ['Kendala', a.obstacle],
      ['Solusi', a.solution],
      ['Refleksi', a.reflection],
    ];
    modal({
      title: a.title,
      body: h(
        'div',
        { class: 'detail' },
        h(
          'dl',
          {},
          rows.filter(([, v]) => v).flatMap(([k, v]) => [h('dt', { text: k }), h('dd', { text: v })])
        )
      ),
      actions: [
        {
          label: 'Edit',
          onClick: (m) => {
            m.close();
            ctx.navigate('form', { id: a.id });
          },
        },
        { label: 'Tutup', kind: 'primary', onClick: (m) => m.close() },
      ],
    });
  }

  function renderTable(filter) {
    const page = store.searchActivities(filter, state.page);
    state.page = page.page;
    if (!page.total) {
      const filtered = filter.text || filter.categoryId || filter.dateFrom || filter.dateTo;
      return filtered
        ? emptyState(
            'Tidak ada hasil',
            'Tidak ada kegiatan yang cocok dengan pencarian atau filter. Ubah kata kunci atau hapus filter.',
            'Reset filter',
            reset
          )
        : emptyState('Belum ada kegiatan', 'Riwayat akan tampil setelah Anda mencatat kegiatan.', 'Catat Kegiatan', () =>
            ctx.navigate('form')
          );
    }
    const rows = page.items.map((a) =>
      h(
        'tr',
        {},
        h('td', { class: 'tabular-nums', text: fmt(a.date), style: 'white-space:nowrap' }),
        h('td', { class: 'tabular-nums', text: `${a.start_time} - ${a.end_time}`, style: 'white-space:nowrap' }),
        h(
          'td',
          {},
          h('b', { style: 'font-weight:700;color:var(--ink-primary)', text: truncate(a.title, 70), title: a.title }),
          a.description ? h('div', { class: 'activity-meta', text: truncate(a.description, 80) }) : null
        ),
        h('td', {}, badge(a.category_name, 'primary')),
        h('td', { class: 'num tabular-nums', text: formatDuration(a.duration_minutes), style: 'white-space:nowrap;font-weight:600' }),
        h(
          'td',
          {},
          h(
            'div',
            { class: 'actions' },
            iconButton('eye', 'Lihat detail', () => showDetail(a)),
            iconButton('edit', 'Edit kegiatan', () => ctx.navigate('form', { id: a.id })),
            iconButton('trash', 'Hapus kegiatan', () => remove(a))
          )
        )
      )
    );
    return h(
      'div',
      {},
      h(
        'div',
        { class: 'table-wrap' },
        h(
          'table',
          { class: 'data-table' },
          h(
            'thead',
            {},
            h(
              'tr',
              {},
              ['Tanggal', 'Waktu', 'Kegiatan', 'Kategori'].map((t) => h('th', { text: t })),
              h('th', { class: 'num', text: 'Durasi' }),
              h('th', { class: 'num', text: 'Aksi' })
            )
          ),
          h('tbody', {}, rows)
        )
      ),
      pager(page, (p) => {
        state.page = p;
        render();
      })
    );
  }

  function renderCalendar(filter) {
    const [year, month] = state.month.split('-').map(Number);
    const [first, last] = monthRange(year, month);
    const items = store.listActivities({ ...filter, dateFrom: first, dateTo: last });
    const byDay = new Map();
    for (const a of items) {
      const e = byDay.get(a.date) || { n: 0, min: 0 };
      e.n += 1;
      e.min += a.duration_minutes;
      byDay.set(a.date, e);
    }
    const shift = (delta) => {
      const d = new Date(Date.UTC(year, month - 1 + delta, 1));
      state.month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      render();
    };
    const cells = [...DAYS_SHORT.map((d) => h('div', { class: 'dow', text: d }))];
    for (let i = 0; i < weekday(first); i += 1) cells.push(h('div', { class: 'blank' }));
    for (let d = first; d <= last; d = addDays(d, 1)) {
      const e = byDay.get(d);
      cells.push(
        h(
          'button',
          {
            type: 'button',
            class: `day tabular-nums ${e ? 'has' : ''} ${d === todayISO() ? 'today' : ''}`.trim(),
            'aria-label': `${longDate(d)}${e ? `, ${e.n} kegiatan` : ', tidak ada kegiatan'}`,
            onclick: () => {
              from.control.value = fmt(d);
              to.control.value = fmt(d);
              state.view = 'table';
              state.page = 1;
              render();
            },
          },
          h('b', { text: String(Number(d.slice(8))) }),
          e ? h('small', { text: `${e.n} kegiatan` }) : null
        )
      );
    }
    return h(
      'div',
      {},
      h(
        'div',
        { class: 'row between', style: 'margin-bottom:14px' },
        iconButton('left', 'Bulan sebelumnya', () => shift(-1), 'btn'),
        h('b', { style: 'font-family:var(--font-display);font-size:15px', text: `${monthName(month)} ${year}` }),
        iconButton('right', 'Bulan berikutnya', () => shift(1), 'btn')
      ),
      h('div', { class: 'calendar' }, cells),
      h('p', { class: 'muted small', style: 'margin-top:10px', text: 'Klik tanggal untuk melihat kegiatan pada hari itu.' })
    );
  }

  function render() {
    const filter = currentFilter();
    if (filter.invalid) {
      replace(body, h('div', { class: 'muted', text: 'Perbaiki filter tanggal untuk menampilkan data.' }));
      return;
    }
    replace(body, state.view === 'table' ? renderTable(filter) : renderCalendar(filter));
    for (const b of viewButtons) {
      const active = b.key === state.view;
      b.el.setAttribute('aria-pressed', String(active));
      b.el.classList.toggle('active', active);
    }
  }

  function reset() {
    search.control.value = '';
    category.control.value = '';
    from.control.value = '';
    to.control.value = '';
    order.control.value = 'desc';
    ctx.syncQuickSearch?.('');
    state.page = 1;
    render();
  }

  const viewButtons = [
    ['table', 'Tabel', 'list'],
    ['calendar', 'Kalender', 'calendar'],
  ].map(([key, label, ic]) => ({
    key,
    el: h(
      'button',
      {
        type: 'button',
        class: `seg-btn ${key === state.view ? 'active' : ''}`,
        'aria-pressed': String(key === state.view),
        onclick: () => {
          state.view = key;
          state.page = 1;
          render();
        },
      },
      h('span', { class: 'row', style: 'gap:6px' }, icon(ic, 15), label)
    ),
  }));

  let timer = null;
  const onChange = () => {
    state.page = 1;
    render();
  };
  search.control.addEventListener('input', () => {
    ctx.syncQuickSearch?.(search.control.value);
    clearTimeout(timer);
    timer = setTimeout(onChange, 200);
  });
  for (const f of [category, order]) f.control.addEventListener('change', onChange);
  for (const f of [from, to]) f.control.addEventListener('change', onChange);

  const el = h(
    'div',
    { class: 'page' },
    h(
      'div',
      { class: 'page-head workspace-title-row' },
      h(
        'div',
        {},
        h('h1', { class: 'workspace-title', text: 'Riwayat Kegiatan' }),
        h('p', { class: 'workspace-subtitle', text: 'Cari, filter, ubah, atau hapus kegiatan yang sudah tercatat.' })
      ),
      h('div', { class: 'segmented segmented-control' }, viewButtons.map((b) => b.el))
    ),
    h(
      'div',
      { class: 'stack' },
      h(
        'section',
        { class: 'card' },
        h(
          'div',
          { class: 'form-grid' },
          [
            [search, 4],
            [category, 2],
            [from, 2],
            [to, 2],
            [order, 2],
          ].map(([f, n]) => {
            f.el.classList.add(`span-${n === 2 ? 3 : n === 4 ? 6 : 3}`);
            return f.el;
          })
        ),
        filterError,
        h(
          'div',
          { class: 'row', style: 'margin-top:14px' },
          h('button', { class: 'btn btn-outline', type: 'button', id: 'history-reset', onclick: reset }, 'Reset filter')
        )
      ),
      card(null, body)
    )
  );
  render();
  return { el, remove, render, reset };
}
