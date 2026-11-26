import { formatDate, formatDuration, formatHours, longDate } from '../../core/dates.js';
import { dashboardData, greeting, makePeriod } from '../../core/report.js';
import { truncate } from '../../core/helpers.js';
import { exportReport } from '../../actions.js';
import { h, replace } from '../dom.js';
import { icon } from '../icons.js';
import { sparklineChart, weeklyChart } from '../charts.js';
import { badge, emptyState, messageDialog, toast } from '../widgets.js';

const CAT_PALETTE = [
  'var(--teal-700)',
  'var(--teal-600)',
  'var(--amber-500)',
  'var(--coral-500)',
  'var(--ink-secondary)',
];

export function dashboardPage(ctx) {
  const { store } = ctx;
  const data = dashboardData(store);
  const profile = store.getProfile();
  const first = (profile.full_name || '').split(/\s+/)[0];
  const fmt = (d) => formatDate(d, store.dateFormat);

  const elapsedHint =
    data.elapsed_days == null
      ? 'Tanggal mulai belum diatur di Pengaturan'
      : data.internship_span_days
      ? `Hari ke-${Math.min(data.elapsed_days, data.internship_span_days)} dari ${data.internship_span_days} hari`
      : `Hari ke-${data.elapsed_days} sejak tanggal mulai`;

  const hasData = data.total_activities > 0;
  const children = [];

  // Onboarding Strip
  if (!hasData || !profile.internship_start) {
    children.push(
      h(
        'div',
        { class: 'onboarding-strip' },
        h(
          'div',
          {},
          h('div', { class: 'activity-title', text: 'Lengkapi profil dan tanggal mulai Anda' }),
          h('div', {
            class: 'activity-meta',
            text: 'Atur tanggal mulai di Pengaturan lalu catat kegiatan pertama agar grafik mingguan terisi otomatis.',
          })
        ),
        h(
          'div',
          { class: 'header-actions' },
          h(
            'button',
            {
              type: 'button',
              class: 'btn-outline',
              text: '1. Atur Tanggal Mulai',
              onclick: () => ctx.navigate('settings'),
            }
          ),
          h(
            'button',
            {
              type: 'button',
              class: 'btn-primary',
              text: '2. Catat Kegiatan',
              onclick: () => ctx.navigate('form'),
            }
          )
        )
      )
    );
  }

  // Bento Grid Row (3-Column Rhythm matching reference design)
  // Order of .stat .value: [0] recorded_days, [1] total_activities, [2] total_hours, [3] tasks_done, [4] tasks_in_progress, [5] tasks_todo
  const bentoCol1 = h(
    'div',
    { class: 'bento-col' },
    h(
      'div',
      { class: 'bento-mini-pair' },
      h(
        'div',
        { class: 'kpi-amber stat' },
        h('div', { class: 'kpi-label label', text: 'Hari Tercatat' }),
        h('div', { class: 'kpi-value value tabular-nums', text: String(data.recorded_days) }),
        h('div', { class: 'kpi-sub hint', text: elapsedHint })
      ),
      h(
        'div',
        { class: 'card kpi-card stat' },
        h(
          'div',
          {},
          h('div', { class: 'kpi-label label', text: 'Total Aktivitas' }),
          h('div', { class: 'kpi-value value tabular-nums', text: String(data.total_activities) })
        ),
        sparklineChart(data.week.map((d) => d.minutes / 60)),
        h('div', { class: 'kpi-sub hint', text: 'kegiatan tercatat' })
      )
    ),
    h(
      'div',
      { class: 'teal-summary-card stat' },
      h(
        'div',
        { style: 'display:flex;justify-content:space-between;align-items:flex-start;gap:8px' },
        h(
          'div',
          {},
          h('div', { class: 'kpi-label label', style: 'color:#D2EBE7', text: 'Total Jam Kegiatan' }),
          h(
            'div',
            { class: 'teal-title tabular-nums', style: 'margin-top:2px' },
            h('span', { class: 'value tabular-nums', text: formatHours(data.total_minutes) }),
            ' Jam Kegiatan'
          ),
          h('div', { class: 'teal-sub hint tabular-nums', text: `${formatDuration(data.total_minutes)} · ${data.total_activities} aktivitas` })
        ),
        icon('clock', 22)
      ),
      h('div', { class: 'teal-dashed-pill tabular-nums', text: `MINGGU INI: ${fmt(data.week_range[0])} - ${fmt(data.week_range[1])}` })
    )
  );

  const chartBody = hasData
    ? h(
        'div',
        { class: 'chart-svg-wrap' },
        weeklyChart(
          data.week.map((d) => ({
            label: d.label,
            value: d.minutes / 60,
            isToday: d.date === data.today,
            title: `${d.label}, ${fmt(d.date)}: ${formatDuration(d.minutes)}`,
          }))
        )
      )
    : h(
        'div',
        { class: 'empty-box', style: 'flex:1' },
        h('div', { class: 'activity-title', text: 'Grafik akan tampil setelah ada kegiatan tercatat.' }),
        h('div', { class: 'activity-meta', text: 'Catat aktivitas harian untuk melihat tren jam kegiatan.' })
      );

  const bentoCol2 = h(
    'div',
    { class: 'card chart-card' },
    h(
      'div',
      { class: 'chart-head' },
      h(
        'div',
        {},
        h('div', { class: 'kpi-label', text: 'Aktivitas Minggu Ini' }),
        h('div', { class: 'activity-title', text: `Distribusi Jam Harian (${fmt(data.week_range[0])} - ${fmt(data.week_range[1])})` })
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'circle-btn soft',
          title: 'Buka Riwayat Lengkap',
          'aria-label': 'Buka Riwayat Lengkap',
          onclick: () => ctx.navigate('history'),
        },
        icon('arrowUpRight', 15)
      )
    ),
    chartBody
  );

  const handleQuickExport = async () => {
    try {
      const path = await exportReport({ store, period: makePeriod('all'), scope: 'all' });
      if (path) toast('Laporan Excel berhasil dibuat.');
    } catch (e) {
      await messageDialog({ title: 'Export gagal', message: e.message, kind: 'error' });
    }
  };

  const bentoCol3 = h(
    'div',
    { class: 'bento-col' },
    h(
      'div',
      { class: 'card stacked-stats-card' },
      h(
        'div',
        { class: 'stat-row stat', style: 'min-height:0;flex-direction:row' },
        h(
          'div',
          {},
          h('div', { class: 'stat-row-label label', text: 'Tugas Selesai' }),
          h('div', { class: 'stat-row-val tabular-nums' }, h('span', { class: 'value', style: 'font-size:15px', text: String(data.tasks_done) }), ' tugas')
        ),
        h('span', { class: 'stat-dot', style: 'background-color:var(--teal-700)' })
      ),
      h(
        'div',
        { class: 'stat-row highlighted stat', style: 'min-height:0;flex-direction:row' },
        h(
          'div',
          {},
          h('div', { class: 'stat-row-label label', text: 'Dalam Proses' }),
          h(
            'div',
            { class: 'stat-row-val tabular-nums' },
            h('span', { class: 'value', style: 'font-size:15px', text: String(data.tasks_in_progress) }),
            ' tugas'
          )
        ),
        h('span', { class: 'stat-dot', style: 'background-color:var(--amber-500)' })
      ),
      h(
        'div',
        { class: 'stat-row stat', style: 'min-height:0;flex-direction:row' },
        h(
          'div',
          {},
          h('div', { class: 'stat-row-label label', text: 'Belum Dikerjakan' }),
          h('div', { class: 'stat-row-val tabular-nums' }, h('span', { class: 'value', style: 'font-size:15px', text: String(data.tasks_todo) }), ' tugas')
        ),
        h('span', { class: 'stat-dot', style: 'background-color:var(--coral-500)' })
      )
    ),
    h(
      'div',
      { class: 'export-action-card' },
      h(
        'div',
        {},
        h('div', { class: 'teal-title', style: 'font-size:14.5px', text: 'Ekspor Excel (.xlsx)' }),
        h('div', { class: 'teal-sub', text: 'Logbook & Matriks Program (5 Sheet)' })
      ),
      h(
        'div',
        { class: 'export-action-footer' },
        h('span', { class: 'export-pill tabular-nums', text: `${data.total_activities} baris` }),
        h(
          'button',
          {
            type: 'button',
            class: 'circle-btn amber',
            title: 'Unduh Excel .xlsx',
            'aria-label': 'Unduh Excel .xlsx',
            onclick: handleQuickExport,
          },
          icon('arrowRight', 15)
        )
      )
    )
  );

  children.push(h('div', { class: 'bento-grid' }, bentoCol1, bentoCol2, bentoCol3));

  // Distribusi Kategori Card
  const maxCatCount = Math.max(...data.categories.map((c) => c.count), 1);
  const catContent =
    data.categories.length === 0
      ? h('div', { class: 'activity-meta', text: 'Belum ada kategori yang dipakai.' })
      : h(
          'div',
          { class: 'cat-bars-list' },
          data.categories.map((c, idx) => {
            const pct = data.total_activities > 0 ? Math.round((c.count / data.total_activities) * 100) : 0;
            const widthPct = Math.max(8, Math.round((c.count / maxCatCount) * 100));
            const color = CAT_PALETTE[idx % CAT_PALETTE.length];
            return h(
              'div',
              { class: 'cat-bar-item' },
              h(
                'div',
                { class: 'cat-bar-meta' },
                h('span', { style: 'font-weight:700', text: truncate(c.name, 22), title: c.name }),
                h('span', {
                  class: 'tabular-nums',
                  style: 'color:var(--ink-muted);font-family:var(--font-display)',
                  text: `${c.count} kegiatan · ${formatHours(c.minutes)}j (${pct}%)`,
                })
              ),
              h(
                'div',
                { class: 'cat-track bar', role: 'img', 'aria-label': `${c.name}: ${c.count} kegiatan` },
                h('i', {
                  class: 'cat-fill',
                  style: `width:${widthPct}%;background-color:${color}`,
                })
              )
            );
          })
        );

  children.push(
    h(
      'section',
      { class: 'card', style: 'display:flex;flex-direction:column;gap:12px' },
      h(
        'div',
        { class: 'section-bar' },
        h('h2', { class: 'section-heading', style: 'font-size:14.5px;margin:0', text: 'Distribusi Kategori' }),
        h('span', { class: 'activity-meta tabular-nums', text: `${data.categories.length} kategori aktif` })
      ),
      catContent
    )
  );

  // Aktivitas Terbaru (2-column cards matching reference design)
  children.push(
    h(
      'div',
      { class: 'section-bar' },
      h('h2', { class: 'section-heading', text: 'Aktivitas Terbaru' }),
      h(
        'button',
        {
          type: 'button',
          class: 'btn-text-link link',
          text: 'Lihat semua >',
          onclick: () => ctx.navigate('history'),
        }
      )
    )
  );

  const recentBox = h('div');

  function renderRecent(query = '') {
    const q = String(query || '').trim().toLowerCase();
    const list = data.recent.filter(
      (a) => !q || a.title.toLowerCase().includes(q) || a.category_name.toLowerCase().includes(q)
    );

    if (data.recent.length === 0) {
      replace(
        recentBox,
        emptyState(
          'Belum ada kegiatan',
          'Catat kegiatan pertama Anda untuk mulai membangun riwayat aktivitas.',
          'Catat Kegiatan',
          () => ctx.navigate('form')
        )
      );
      return;
    }

    if (list.length === 0) {
      replace(
        recentBox,
        emptyState('Tidak ada aktivitas yang cocok', 'Coba kata kunci pencarian lain atau lihat seluruh riwayat.', 'Buka Riwayat', () =>
          ctx.navigate('history')
        )
      );
      return;
    }

    replace(
      recentBox,
      h(
        'div',
        { class: 'items-grid-2' },
        list.map((a) =>
          h(
            'article',
            { class: 'activity-card' },
            h(
              'div',
              { class: 'activity-card-top' },
              h(
                'div',
                {},
                h('div', { class: 'activity-title', text: truncate(a.title, 64), title: a.title }),
                h('div', { class: 'activity-meta tabular-nums', text: `${fmt(a.date)} · ${a.start_time} - ${a.end_time}` })
              ),
              h('span', { class: 'duration-badge tabular-nums', text: `${formatHours(a.duration_minutes)}j` })
            ),
            a.description || a.result
              ? h('div', { class: 'activity-notes', text: truncate(a.result || a.description, 110) })
              : null,
            h(
              'div',
              { class: 'activity-card-footer' },
              h(
                'div',
                { class: 'tag-row' },
                badge(a.category_name, 'primary'),
                h('span', { class: 'tag-pill tag-amber tabular-nums', text: formatDuration(a.duration_minutes) })
              ),
              h(
                'button',
                {
                  type: 'button',
                  class: 'circle-btn outline',
                  title: 'Edit kegiatan',
                  'aria-label': 'Edit kegiatan',
                  onclick: () => ctx.navigate('form', { id: a.id }),
                },
                icon('edit', 13)
              )
            )
          )
        )
      )
    );
  }

  renderRecent(ctx.quickSearch);
  children.push(recentBox);

  const hello = greeting(new Date().getHours()) + (first ? `, ${first}` : '');
  const el = h(
    'div',
    { class: 'page' },
    h(
      'div',
      { class: 'page-head workspace-title-row' },
      h(
        'div',
        {},
        h('h1', { class: 'workspace-title', text: 'Dashboard' }),
        h('p', { class: 'workspace-subtitle', text: `${hello}  ·  ${longDate(data.today)}` })
      )
    ),
    h('div', { class: 'stack' }, ...children)
  );

  return { el, filterRecent: renderRecent };
}
