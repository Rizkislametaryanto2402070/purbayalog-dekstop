import { APP_FULL_NAME, APP_NAME, STATUSES } from './core/config.js';
import { loadState } from './core/backup.js';
import { DAYS_SHORT, MONTHS, MONTHS_SHORT, formatDate, monthRange, todayISO, weekday } from './core/dates.js';
import { emptyState, DataStore, deadlineState } from './core/store.js';
import * as platform from './platform.js';
import { applyRestore, backupData, pickBackup } from './actions.js';
import { h, replace } from './ui/dom.js';
import { icon } from './ui/icons.js';
import { messageDialog, toast } from './ui/widgets.js';
import { dashboardPage } from './ui/pages/dashboard.js';
import { formPage } from './ui/pages/form.js';
import { historyPage } from './ui/pages/history.js';
import { tasksPage } from './ui/pages/tasks.js';
import { reportsPage } from './ui/pages/reports.js';
import { settingsPage } from './ui/pages/settings.js';

const LOGO_SRC = 'assets/logo-politeknik-purbaya.png';

const PAGES = {
  dashboard: { label: 'Dashboard', icon: 'dashboard', create: dashboardPage },
  form: { label: 'Catat Kegiatan', icon: 'form', create: formPage },
  history: { label: 'Riwayat', icon: 'history', create: historyPage },
  tasks: { label: 'Tugas', icon: 'tasks', create: tasksPage },
  reports: { label: 'Laporan', icon: 'reports', create: reportsPage },
  settings: { label: 'Pengaturan', icon: 'settings', create: settingsPage },
};

const topbar = document.getElementById('topbar');
const subtabsBar = document.getElementById('subtabs-bar');
const sidebar = document.getElementById('sidebar');
const content = document.getElementById('content');

function applyTheme(mode) {
  document.documentElement.dataset.theme = mode === 'dark' ? 'dark' : 'light';
}

function buildContext(store) {
  const today = todayISO();
  const ctx = {
    store,
    current: null,
    currentKey: null,
    quickSearch: '',
    calMonth: today.slice(0, 7),
    selectedDate: today,
    syncQuickSearch(value) {
      ctx.quickSearch = String(value ?? '');
      const inp = topbar?.querySelector('.search-capsule-input');
      if (inp && inp.value !== ctx.quickSearch) inp.value = ctx.quickSearch;
    },
    async navigate(key, params = {}, opts = {}) {
      if (!PAGES[key]) return false;
      if (ctx.current?.canLeave && !opts.force && !(await ctx.current.canLeave())) return false;
      if (params.search !== undefined) ctx.syncQuickSearch(params.search);
      const page = PAGES[key].create(ctx, params);
      ctx.current = page;
      ctx.currentKey = key;
      replace(content, page.el);
      content.scrollTop = 0;

      const activeKey = key === 'form' && params.id != null ? 'history' : key;
      for (const b of document.querySelectorAll('.nav-item')) {
        if (b.dataset.key === activeKey) {
          b.setAttribute('aria-current', 'page');
          b.classList.add('active');
        } else {
          b.removeAttribute('aria-current');
          b.classList.remove('active');
        }
      }
      for (const b of document.querySelectorAll('.primary-nav-btn')) {
        const isLaporan = activeKey === 'reports';
        const match = (b.dataset.primary === 'laporan' && isLaporan) || (b.dataset.primary === 'overview' && !isLaporan);
        b.classList.toggle('active', match);
      }
      renderRightPanel(ctx);
      return true;
    },
    setTheme(mode) {
      store.setTheme(mode);
      applyTheme(mode);
      ctx.current?.syncTheme?.(mode);
      renderRightPanel(ctx);
    },
    afterRestore() {
      applyTheme(store.theme);
      renderShell(ctx);
      ctx.navigate('dashboard', {}, { force: true });
    },
  };
  return ctx;
}

function renderTopbar(ctx) {
  if (!topbar) return;
  const searchInput = h('input', {
    type: 'text',
    class: 'search-capsule-input',
    placeholder: 'Cari kegiatan atau tugas...',
    'aria-label': 'Cari cepat kegiatan atau tugas',
    value: ctx.quickSearch,
    oninput: (e) => {
      ctx.syncQuickSearch(e.target.value);
      const pageSearch = content.querySelector('input[type="search"]');
      if (pageSearch) {
        pageSearch.value = ctx.quickSearch;
        pageSearch.dispatchEvent(new Event('input', { bubbles: true }));
      } else if (ctx.currentKey === 'dashboard' && ctx.current?.filterRecent) {
        ctx.current.filterRecent(ctx.quickSearch);
      }
    },
    onkeydown: (e) => {
      if (e.key === 'Enter' && ctx.currentKey !== 'history' && ctx.currentKey !== 'tasks') {
        e.preventDefault();
        ctx.navigate('history', { search: ctx.quickSearch });
      }
    },
  });

  replace(
    topbar,
    h(
      'div',
      { class: 'brand-lockup' },
      h('img', { src: LOGO_SRC, alt: 'Logo Politeknik Purbaya', class: 'brand-logo' }),
      h(
        'div',
        {},
        h('div', { class: 'brand-name', text: APP_NAME }),
        h('div', { class: 'brand-sub', text: APP_FULL_NAME })
      )
    ),
    h(
      'nav',
      { class: 'primary-nav', 'aria-label': 'Area kerja' },
      h('button', {
        type: 'button',
        class: `primary-nav-btn ${ctx.currentKey !== 'reports' ? 'active' : ''}`,
        dataset: { primary: 'overview' },
        text: 'Overview',
        onclick: () => ctx.navigate('dashboard'),
      }),
      h('button', {
        type: 'button',
        class: `primary-nav-btn ${ctx.currentKey === 'reports' ? 'active' : ''}`,
        dataset: { primary: 'laporan' },
        text: 'Laporan',
        onclick: () => ctx.navigate('reports'),
      })
    ),
    h('div', { class: 'search-capsule' }, searchInput, icon('search', 15))
  );
}

function renderSubtabs(ctx) {
  if (!subtabsBar) return;
  replace(
    subtabsBar,
    h(
      'nav',
      { class: 'subtabs', 'aria-label': 'Halaman' },
      Object.entries(PAGES).map(([key, p]) =>
        h(
          'button',
          {
            class: 'subtab-btn nav-item',
            type: 'button',
            dataset: { key },
            title: p.label,
            onclick: () => ctx.navigate(key),
          },
          icon(p.icon, 15),
          h('span', { text: p.label })
        )
      )
    ),
    h(
      'div',
      { class: 'header-actions', style: 'padding-bottom:6px' },
      h(
        'button',
        {
          type: 'button',
          class: 'btn-primary',
          onclick: () => ctx.navigate('form'),
        },
        icon('plus', 14),
        h('span', { text: 'Catat Kegiatan' })
      )
    )
  );
}

function renderRightPanel(ctx) {
  if (!sidebar) return;
  const { store } = ctx;
  const profile = store.getProfile();
  const isDark = store.theme === 'dark';

  const themeBtn = h(
    'button',
    {
      type: 'button',
      class: 'icon-btn',
      title: isDark ? 'Mode Terang' : 'Mode Gelap',
      'aria-label': 'Ganti tema terang atau gelap',
      onclick: () => {
        ctx.setTheme(isDark ? 'light' : 'dark');
        toast(isDark ? 'Mode Terang aktif.' : 'Mode Gelap aktif.');
      },
    },
    icon(isDark ? 'sun' : 'moon', 17)
  );

  const backupBtn = h(
    'button',
    {
      type: 'button',
      class: 'icon-btn',
      title: 'Simpan Backup JSON',
      'aria-label': 'Simpan Backup JSON',
      onclick: async () => {
        try {
          const path = await backupData(ctx);
          if (path) toast('Backup berhasil dibuat dan diverifikasi.');
        } catch (e) {
          await messageDialog({ title: 'Backup gagal', message: e.message, kind: 'error' });
        }
      },
    },
    icon('download', 17)
  );

  // Mini Calendar for ctx.calMonth
  const today = todayISO();
  const [year, month] = ctx.calMonth.split('-').map(Number);
  const [firstIso, lastIso] = monthRange(year, month);
  const daysInMonth = Number(lastIso.slice(8));
  const monthActs = store.listActivities({ dateFrom: firstIso, dateTo: lastIso });
  const actCounts = new Map();
  for (const a of monthActs) actCounts.set(a.date, (actCounts.get(a.date) || 0) + 1);
  const deadlineDates = new Set(
    store.listTasks().filter((t) => t.status !== 'done' && t.deadline && t.deadline >= firstIso && t.deadline <= lastIso).map((t) => t.deadline)
  );

  const showSelectedDay = ctx.selectedDate.startsWith(ctx.calMonth);
  const calTitleMain = showSelectedDay
    ? `${MONTHS_SHORT[month - 1]}, ${Number(ctx.selectedDate.slice(8))}`
    : MONTHS[month - 1];

  const shiftMonth = (delta) => {
    const d = new Date(Date.UTC(year, month - 1 + delta, 1));
    ctx.calMonth = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    renderRightPanel(ctx);
  };

  const calNodes = DAYS_SHORT.map((d) => h('div', { class: 'cal-dow', text: d }));
  const startOffset = weekday(firstIso);
  for (let i = 0; i < startOffset; i += 1) {
    calNodes.push(h('div', { class: 'cal-blank' }));
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const iso = `${ctx.calMonth}-${String(day).padStart(2, '0')}`;
    const actCount = actCounts.get(iso) || 0;
    const hasDeadline = deadlineDates.has(iso);
    const isSelected = iso === ctx.selectedDate;
    const isToday = iso === today;

    let cls = 'cal-day tabular-nums';
    if (isSelected) cls += ' amber-mark';
    else if (hasDeadline) cls += ' has-deadline';
    else if (actCount > 0) cls += ' has-act';
    if (isToday && !isSelected) cls += ' is-today';

    const titleParts = [formatDate(iso, store.dateFormat)];
    if (actCount > 0) titleParts.push(`${actCount} kegiatan`);
    if (hasDeadline) titleParts.push('Deadline tugas');

    calNodes.push(
      h('button', {
        type: 'button',
        class: cls,
        text: String(day),
        title: titleParts.join(' · '),
        'aria-label': titleParts.join(', '),
        onclick: () => {
          ctx.selectedDate = iso;
          ctx.navigate('history', { date: iso, search: '' });
        },
      })
    );
  }

  // Pantauan Deadline
  const attentionTasks = store.tasksNeedingAttention(today, 4);
  const upcomingTasks = attentionTasks.length
    ? attentionTasks
    : store
        .listTasks()
        .filter((t) => t.status !== 'done' && t.deadline)
        .slice(0, 4)
        .map((t) => ({ ...t, deadline_state: deadlineState(t, today) }));

  const tones = ['teal', 'amber', 'coral'];
  const timelineItems =
    upcomingTasks.length === 0
      ? [h('div', { class: 'activity-meta', text: 'Tidak ada tugas yang mendekati atau melewati deadline.' })]
      : upcomingTasks.map((t, i) => {
          const tone = t.deadline_state === 'overdue' ? 'coral' : t.deadline_state === 'soon' ? 'amber' : tones[i % tones.length];
          const statusLabel = STATUSES[t.status] || 'Belum dikerjakan';
          const stateSuffix = t.deadline_state === 'overdue' ? ' · Terlambat' : t.deadline_state === 'soon' ? ' · Segera' : '';
          return h(
            'div',
            { class: 'timeline-row' },
            h('div', { class: 'timeline-time tabular-nums', text: t.deadline ? t.deadline.slice(5) : '-' }),
            h(
              'div',
              { class: `timeline-card ${tone}` },
              h('div', { class: 'timeline-icon' }, icon(t.status === 'in_progress' ? 'clock' : 'calendar', 13)),
              h(
                'div',
                { style: 'min-width:0' },
                h('div', { class: 'timeline-title', text: t.title }),
                h('div', { class: 'timeline-sub', text: `${statusLabel}${stateSuffix}` })
              )
            )
          );
        });

  const uniName = profile.university || 'Politeknik Purbaya';
  const subName = profile.study_program || profile.company || 'Kabupaten Tegal';

  replace(
    sidebar,
    h(
      'div',
      { class: 'right-panel-top' },
      h('div', { class: 'utility-icons' }, themeBtn, backupBtn),
      h(
        'div',
        { class: 'institution-chip' },
        h(
          'div',
          { style: 'min-width:0' },
          h('div', { class: 'institution-name', text: uniName, title: uniName }),
          h('div', { class: 'institution-sub', text: subName, title: subName })
        ),
        h('img', { src: LOGO_SRC, alt: 'Politeknik Purbaya', class: 'institution-avatar' })
      )
    ),
    h(
      'div',
      {},
      h(
        'div',
        { class: 'calendar-header' },
        h(
          'div',
          { class: 'calendar-title tabular-nums' },
          calTitleMain,
          h('span', { text: String(year) })
        ),
        h(
          'div',
          { class: 'utility-icons' },
          h(
            'button',
            {
              type: 'button',
              class: 'icon-btn',
              style: 'width:28px;height:28px',
              'aria-label': 'Bulan sebelumnya',
              title: 'Bulan sebelumnya',
              onclick: () => shiftMonth(-1),
            },
            icon('chevLeft', 14)
          ),
          h(
            'button',
            {
              type: 'button',
              class: 'icon-btn',
              style: 'width:28px;height:28px',
              'aria-label': 'Bulan berikutnya',
              title: 'Bulan berikutnya',
              onclick: () => shiftMonth(1),
            },
            icon('chevRight', 14)
          )
        )
      ),
      h('div', { class: 'cal-grid' }, calNodes),
      h(
        'div',
        { class: 'cal-legend' },
        h('span', { class: 'cal-legend-item' }, h('span', { class: 'cal-legend-dot', style: 'background:var(--teal-700)' }), 'Kegiatan'),
        h('span', { class: 'cal-legend-item' }, h('span', { class: 'cal-legend-dot', style: 'background:var(--coral-500)' }), 'Deadline'),
        h('span', { class: 'cal-legend-item' }, h('span', { class: 'cal-legend-dot', style: 'background:var(--amber-500)' }), 'Dipilih')
      )
    ),
    h(
      'div',
      { class: 'timeline-block' },
      h(
        'div',
        { class: 'section-bar' },
        h('span', { class: 'field-label', text: 'Pantauan Deadline' }),
        h('button', {
          type: 'button',
          class: 'btn-text-link',
          style: 'font-size:11.5px',
          text: 'Kelola',
          onclick: () => ctx.navigate('tasks'),
        })
      ),
      ...timelineItems
    )
  );
}

function renderShell(ctx) {
  renderTopbar(ctx);
  renderSubtabs(ctx);
  renderRightPanel(ctx);
}

function recoveryScreen(error, startFresh, restoreFromFile) {
  replace(
    content,
    h(
      'div',
      { class: 'page', style: 'max-width:640px' },
      h(
        'div',
        { class: 'page-head' },
        h(
          'div',
          {},
          h('h1', { text: 'Data tidak dapat dibaca' }),
          h('p', { text: 'Berkas data aplikasi rusak atau tidak valid.' })
        )
      ),
      h('div', { class: 'banner error', role: 'alert', text: error.message }),
      h('p', { class: 'muted', text: 'Berkas yang rusak tidak dihapus: salinannya disimpan di folder backups sebelum Anda melanjutkan.' }),
      h(
        'div',
        { class: 'row' },
        h('button', { class: 'btn primary', type: 'button', id: 'recover-restore', onclick: restoreFromFile }, 'Pulihkan dari berkas backup'),
        h('button', { class: 'btn', type: 'button', id: 'recover-fresh', onclick: startFresh }, 'Mulai dengan data kosong')
      )
    )
  );
}

async function boot() {
  window.addEventListener('error', (e) => platform.logMessage('ERROR', `${e.message} @ ${e.filename}:${e.lineno}`));
  window.addEventListener('unhandledrejection', (e) => {
    platform.logMessage('ERROR', `Promise: ${e.reason?.message || e.reason}`);
    toast('Terjadi kesalahan tak terduga. Rincian tersimpan di berkas log.', 'error');
  });

  let text = null;
  try {
    text = await platform.loadData();
  } catch (e) {
    replace(content, h('div', { class: 'page' }, h('div', { class: 'banner error', role: 'alert', text: `Aplikasi tidak dapat membaca data: ${e.message}` })));
    return;
  }
  const adapter = { save: (json) => platform.saveData(json) };
  let store;
  try {
    store = new DataStore(loadState(text), adapter);
  } catch (error) {
    const empty = new DataStore(emptyState(), adapter);
    const ctxRecovery = buildContext(empty);
    renderShell(ctxRecovery);
    const finish = () => {
      applyTheme(empty.theme);
      renderShell(ctxRecovery);
      ctxRecovery.navigate('dashboard', {}, { force: true });
    };
    recoveryScreen(
      error,
      async () => {
        try {
          await platform.safetyBackup();
          empty.replaceState(emptyState());
          await empty.flush();
          finish();
        } catch (e) {
          toast(e.message, 'error');
        }
      },
      async () => {
        try {
          const picked = await pickBackup();
          if (!picked) return;
          await applyRestore({ store: empty }, picked.state);
          finish();
        } catch (e) {
          await messageDialog({ title: 'Restore gagal', message: e.message, kind: 'error' });
        }
      }
    );
    return;
  }
  store.onSaveError = (e) => toast(`Data gagal disimpan: ${e.message}`, 'error');
  applyTheme(store.theme);
  const ctx = buildContext(store);
  store.onChange = () => renderRightPanel(ctx);
  renderShell(ctx);
  window.addEventListener('beforeunload', (e) => {
    if (ctx.current?.isDirty?.()) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
  const tauriWindowApi = globalThis.__TAURI__?.window;
  if (platform.isTauri && typeof tauriWindowApi?.getCurrentWindow === 'function') {
    const appWindow = tauriWindowApi.getCurrentWindow();
    let closingPrompt = false;
    appWindow
      .onCloseRequested(async (event) => {
        if (!ctx.current?.isDirty?.()) return;
        event.preventDefault();
        if (closingPrompt) return;
        closingPrompt = true;
        try {
          const ok = await ctx.current.canLeave();
          if (ok) {
            await store.flush();
            await appWindow.destroy();
          }
        } finally {
          closingPrompt = false;
        }
      })
      .catch((err) => platform.logMessage('WARN', `onCloseRequested: ${err}`));
  }
  await ctx.navigate('dashboard', {}, { force: true });
  if (!platform.isTauri) window.__magang = { ctx, platform };
  document.title = `${APP_NAME} - ${APP_FULL_NAME}`;
}

boot();
