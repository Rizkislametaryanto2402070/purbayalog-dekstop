import { MONTHS, formatDate, formatDuration, formatHours, longDate, parseDate, todayISO } from '../../core/dates.js';
import { ValidationError } from '../../core/errors.js';
import { PERIOD_LABELS, buildReport, makePeriod } from '../../core/report.js';
import { EXPORT_SCOPES } from '../../core/xlsx.js';
import { exportReport } from '../../actions.js';
import { h, replace } from '../dom.js';
import { icon } from '../icons.js';
import { card, emptyState, field, messageDialog, selectInput, statCard, textInput, toast } from '../widgets.js';

export function reportsPage(ctx) {
  const { store } = ctx;
  const fmt = (d) => formatDate(d, store.dateFormat);
  const example = fmt('2026-12-31');
  const today = todayISO();
  const state = { kind: 'month', period: null };

  const day = field({ label: 'Tanggal', control: textInput({ placeholder: example, value: fmt(today) }) });
  const week = field({
    label: 'Tanggal dalam minggu',
    help: 'Minggu dihitung Senin sampai Minggu',
    control: textInput({ placeholder: example, value: fmt(today) }),
  });
  const month = field({
    label: 'Bulan',
    control: selectInput(MONTHS.map((m, i) => [i + 1, m]), Number(today.slice(5, 7))),
  });
  const year = field({
    label: 'Tahun',
    control: textInput({ class: 'input input-box tabular-nums', type: 'number', min: 2000, max: 2100, value: today.slice(0, 4) }),
  });
  const start = field({ label: 'Dari tanggal', control: textInput({ placeholder: example }) });
  const end = field({ label: 'Sampai tanggal', control: textInput({ placeholder: example }) });
  const inputs = { day: [day], week: [week], month: [month, year], range: [start, end], all: [] };
  const inputBox = h('div', { class: 'row', style: 'align-items:flex-start;gap:16px' });
  const result = h('div');
  const scope = field({
    label: 'Jenis export',
    control: selectInput(Object.entries(EXPORT_SCOPES).map(([k, v]) => [k, v.label]), 'period'),
  });
  const kindButtons = Object.entries(PERIOD_LABELS).map(([key, label]) =>
    h(
      'button',
      {
        type: 'button',
        class: `seg-btn ${key === state.kind ? 'active' : ''}`,
        dataset: { kind: key },
        'aria-pressed': String(key === state.kind),
        onclick: () => setKind(key),
      },
      label
    )
  );

  function setKind(kind) {
    state.kind = kind;
    for (const b of kindButtons) {
      const active = b.dataset.kind === kind;
      b.setAttribute('aria-pressed', String(active));
      b.classList.toggle('active', active);
    }
    replace(inputBox, inputs[kind].map((f) => f.el));
  }

  function readPeriod() {
    Object.values(inputs).flat().forEach((f) => f.setError(null));
    const dateFormat = store.dateFormat;
    const parse = (f, label) => {
      try {
        return parseDate(f.control.value);
      } catch (e) {
        f.setError(`${label}: ${e.message}`);
        throw new ValidationError({ [label]: e.message });
      }
    };
    switch (state.kind) {
      case 'day':
        return makePeriod('day', { ref: parse(day, 'Tanggal'), dateFormat });
      case 'week':
        return makePeriod('week', { ref: parse(week, 'Tanggal'), dateFormat });
      case 'month': {
        const y = Number(year.control.value);
        if (!Number.isInteger(y) || y < 2000 || y > 2100) {
          year.setError('Tahun harus antara 2000 dan 2100.');
          throw new ValidationError({ year: 'tahun' });
        }
        return makePeriod('month', { year: y, month: Number(month.control.value), dateFormat });
      }
      case 'range': {
        const a = parse(start, 'Dari tanggal');
        const b = parse(end, 'Sampai tanggal');
        try {
          return makePeriod('range', { start: a, end: b, dateFormat });
        } catch (e) {
          end.setError(e.message);
          throw e;
        }
      }
      default:
        return makePeriod('all');
    }
  }

  function generate() {
    let period;
    try {
      period = readPeriod();
    } catch (e) {
      if (e instanceof ValidationError) return false;
      throw e;
    }
    state.period = period;
    const r = buildReport(store, period);
    const cards = [
      statCard('Total Aktivitas', String(r.total_activities), `${r.total_days} hari tercatat`),
      statCard('Total Durasi', formatDuration(r.total_minutes), `${formatHours(r.total_minutes)} jam`),
      statCard('Rata-rata per Kegiatan', formatDuration(r.average_minutes), 'durasi'),
      statCard('Tugas', `${r.tasks_done} / ${r.tasks.length}`, `${r.tasks_done} selesai, ${r.tasks_not_done} belum selesai`),
    ];
    const max = Math.max(...r.categories.map((c) => c.minutes), 1);
    const cat = r.categories.length
      ? h(
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
                h('th', { text: 'Kategori' }),
                h('th', { class: 'num', text: 'Jumlah' }),
                h('th', { class: 'num', text: 'Durasi' }),
                h('th', { class: 'num', text: 'Persentase' }),
                h('th', { text: 'Proporsi' })
              )
            ),
            h(
              'tbody',
              {},
              r.categories.map((c) =>
                h(
                  'tr',
                  {},
                  h('td', { style: 'font-weight:700', text: c.name }),
                  h('td', { class: 'num tabular-nums', text: String(c.count) }),
                  h('td', { class: 'num tabular-nums', text: formatDuration(c.minutes) }),
                  h('td', { class: 'num tabular-nums', text: `${((c.count / r.total_activities) * 100).toFixed(1).replace('.', ',')}%` }),
                  h('td', { style: 'width:28%' }, h('div', { class: 'cat-track bar' }, h('i', { class: 'cat-fill', style: `width:${(c.minutes / max) * 100}%` })))
                )
              )
            )
          )
        )
      : null;

    const daily = r.daily.length
      ? h(
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
                h('th', { text: 'Tanggal' }),
                h('th', { class: 'num', text: 'Kegiatan' }),
                h('th', { class: 'num', text: 'Durasi' }),
                h('th', { text: 'Ringkasan' })
              )
            ),
            h(
              'tbody',
              {},
              r.daily.map((d) =>
                h(
                  'tr',
                  {},
                  h('td', { class: 'tabular-nums', text: longDate(d.date), style: 'white-space:nowrap;font-weight:600' }),
                  h('td', { class: 'num tabular-nums', text: String(d.count) }),
                  h('td', { class: 'num tabular-nums', text: formatDuration(d.minutes) }),
                  h('td', { class: 'muted', text: d.titles.join('; ') })
                )
              )
            )
          )
        )
      : null;

    replace(
      result,
      h(
        'div',
        { class: 'stack' },
        h(
          'div',
          { class: 'duration-preview-strip' },
          h('span', { class: 'muted', text: 'Periode Rekap:' }),
          h('b', { style: 'font-family:var(--font-display);color:var(--teal-700)', text: period.label })
        ),
        h('div', { class: 'report-stats-grid' }, cards.map((c) => c.el)),
        r.has_data
          ? h('div', { class: 'stack' }, card('Ringkasan per Kategori', cat), card('Ringkasan per Hari', daily))
          : card(
              null,
              emptyState(
                'Belum ada kegiatan pada periode ini',
                'Pilih periode lain atau catat kegiatan terlebih dahulu. Export tetap dapat dibuat (berisi header dan ringkasan kosong).'
              )
            )
      )
    );
    return true;
  }

  async function doExport() {
    if (!state.period && !generate()) return false;
    if (scope.control.value !== 'all' && !generate()) return false;
    try {
      const path = await exportReport({ store, period: state.period, scope: scope.control.value });
      if (!path) return false;
      toast('Laporan Excel berhasil dibuat.');
      return true;
    } catch (e) {
      await messageDialog({ title: 'Export gagal', message: e.message, kind: 'error' });
      return false;
    }
  }

  const el = h(
    'div',
    { class: 'page' },
    h(
      'div',
      { class: 'page-head workspace-title-row' },
      h(
        'div',
        {},
        h('h1', { class: 'workspace-title', text: 'Laporan & Rekap' }),
        h('p', { class: 'workspace-subtitle', text: 'Rekap kegiatan per periode dan export ke Excel OpenXML (4 Sheet).' })
      )
    ),
    h(
      'div',
      { class: 'stack' },
      h(
        'section',
        { class: 'card' },
        h(
          'div',
          { class: 'stack' },
          h('div', { class: 'segmented segmented-control', role: 'group', 'aria-label': 'Jenis periode' }, kindButtons),
          inputBox,
          h(
            'div',
            { class: 'row' },
            h('button', { class: 'btn primary btn-primary', type: 'button', id: 'report-generate', onclick: generate }, 'Tampilkan Rekap'),
            h('span', { style: 'flex:1' }),
            h('div', { style: 'min-width:260px' }, scope.el),
            h(
              'button',
              { class: 'btn btn-outline', type: 'button', id: 'report-export', style: 'align-self:flex-end', onclick: doExport },
              icon('download', 15),
              h('span', { text: 'Export ke Excel' })
            )
          )
        )
      ),
      result
    )
  );
  setKind('month');
  generate();
  return { el, generate, doExport, setKind, state };
}
