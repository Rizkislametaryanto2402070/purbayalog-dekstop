// Rekap laporan per periode dan data ringkasan dashboard. Semua angka dihitung dari data.
import {
  DAYS_SHORT, addDays, daysInclusive, formatDate, longDate, monthName, monthRange, todayISO, weekRange,
} from './dates.js';
import { DEFAULT_DATE_FORMAT } from './config.js';
import { ValidationError } from './errors.js';

export const PERIOD_LABELS = {
  all: 'Seluruh data', day: 'Harian', week: 'Mingguan', month: 'Bulanan', range: 'Rentang khusus',
};

export function makePeriod(kind, {
  ref = null, start = null, end = null, year = null, month = null, dateFormat = DEFAULT_DATE_FORMAT, today = todayISO(),
} = {}) {
  const fmt = (d) => formatDate(d, dateFormat);
  switch (kind) {
    case 'all': return { kind, start: null, end: null, label: 'Seluruh periode' };
    case 'day': { const d = ref || today; return { kind, start: d, end: d, label: longDate(d) }; }
    case 'week': { const [a, b] = weekRange(ref || today); return { kind, start: a, end: b, label: `${fmt(a)} s.d. ${fmt(b)}` }; }
    case 'month': {
      const [ty, tm] = today.split('-').map(Number);
      const y = year || ty; const m = month || tm;
      if (!(m >= 1 && m <= 12)) throw new ValidationError({ month: 'Bulan tidak valid.' });
      const [a, b] = monthRange(y, m);
      return { kind, start: a, end: b, label: `${monthName(m)} ${y}` };
    }
    case 'range':
      if (!start || !end) throw new ValidationError({ range: 'Tanggal awal dan akhir wajib diisi.' });
      if (end < start) throw new ValidationError({ range: 'Tanggal akhir tidak boleh lebih awal dari tanggal awal.' });
      return { kind, start, end, label: `${fmt(start)} s.d. ${fmt(end)}` };
    default: throw new ValidationError({ period: 'Jenis periode tidak dikenal.' });
  }
}

export function aggregateByCategory(activities) {
  const map = new Map();
  for (const a of activities) {
    const row = map.get(a.category_name) || { name: a.category_name, count: 0, minutes: 0 };
    row.count += 1; row.minutes += a.duration_minutes;
    map.set(a.category_name, row);
  }
  return [...map.values()].sort((x, y) => y.count - x.count || y.minutes - x.minutes || x.name.localeCompare(y.name));
}

export function tasksForPeriod(store, period) {
  return period.start == null ? store.listTasks() : store.tasksForPeriod(period.start, period.end);
}

export function buildReport(store, period) {
  const activities = store.listActivities({ dateFrom: period.start, dateTo: period.end, newestFirst: false });
  const totalMinutes = activities.reduce((s, a) => s + a.duration_minutes, 0);
  const count = activities.length;
  const daily = [];
  for (const a of activities) {
    let entry = daily[daily.length - 1];
    if (!entry || entry.date !== a.date) { entry = { date: a.date, count: 0, minutes: 0, titles: [] }; daily.push(entry); }
    entry.count += 1; entry.minutes += a.duration_minutes; entry.titles.push(a.title);
  }
  const tasks = tasksForPeriod(store, period);
  const done = tasks.filter((t) => t.status === 'done').length;
  return {
    period,
    activities,
    total_activities: count,
    total_minutes: totalMinutes,
    total_days: daily.length,
    average_minutes: count ? Math.round(totalMinutes / count) : 0,
    categories: aggregateByCategory(activities),
    daily,
    tasks,
    tasks_done: done,
    tasks_not_done: tasks.length - done,
    has_data: count > 0,
  };
}

export function dashboardData(store, today = todayISO()) {
  const all = store.listActivities({ newestFirst: false });
  const totalMinutes = all.reduce((s, a) => s + a.duration_minutes, 0);
  const profile = store.getProfile();
  let elapsed = null; let span = null;
  if (profile.internship_start) {
    const end = profile.internship_end || null;
    elapsed = profile.internship_start <= today
      ? daysInclusive(profile.internship_start, end && end < today ? end : today) : 0;
    if (end) span = daysInclusive(profile.internship_start, end);
  }
  const [monday, sunday] = weekRange(today);
  const week = [];
  for (let i = 0; i < 7; i += 1) {
    const date = addDays(monday, i);
    const rows = all.filter((a) => a.date === date);
    week.push({ date, label: DAYS_SHORT[i], minutes: rows.reduce((s, a) => s + a.duration_minutes, 0), count: rows.length });
  }
  const counts = store.taskCounts();
  return {
    today,
    total_activities: all.length,
    total_minutes: totalMinutes,
    recorded_days: new Set(all.map((a) => a.date)).size,
    elapsed_days: elapsed,
    internship_span_days: span,
    tasks_done: counts.done,
    tasks_in_progress: counts.in_progress,
    tasks_todo: counts.todo,
    week,
    week_range: [monday, sunday],
    categories: aggregateByCategory(all),
    recent: store.recentActivities(5),
    attention: store.tasksNeedingAttention(today),
  };
}

export function greeting(hour) {
  if (hour < 11) return 'Selamat pagi';
  if (hour < 15) return 'Selamat siang';
  if (hour < 18) return 'Selamat sore';
  return 'Selamat malam';
}
