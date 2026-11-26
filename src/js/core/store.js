// Penyimpanan data dalam memori + persistensi lewat adapter (Rust: berkas JSON atomik).
import {
  DATE_FORMATS, DEADLINE_WARNING_DAYS, DEFAULT_CATEGORIES, DEFAULT_DATE_FORMAT, DEFAULT_PROGRAM_TYPE, PAGE_SIZE, PRIORITIES, SCHEMA_VERSION, STATUSES,
} from './config.js';
import { addDays, todayISO } from './dates.js';
import { NotFoundError, ValidationError } from './errors.js';
import { paginate } from './helpers.js';
import {
  PROFILE_TEXT_FIELDS, validateActivity, validateCategoryName, validateProfile, validateTask,
} from './validators.js';

export const APP_MARKER = 'PurbayaLog';
export const LEGACY_APP_MARKERS = Object.freeze(['MagangLog']);

export function emptyState() {
  return {
    app: APP_MARKER,
    version: SCHEMA_VERSION,
    counters: { activity: 1, task: 1, category: DEFAULT_CATEGORIES.length + 1 },
    profile: {
      ...Object.fromEntries([...PROFILE_TEXT_FIELDS, 'internship_start', 'internship_end'].map((k) => [k, ''])),
      program_type: DEFAULT_PROGRAM_TYPE,
    },
    settings: { theme: 'light', date_format: DEFAULT_DATE_FORMAT },
    categories: DEFAULT_CATEGORIES.map((name, i) => ({ id: i + 1, name })),
    activities: [],
    tasks: [],
  };
}

const STATUS_ORDER = { in_progress: 0, todo: 1, done: 2 };

export function deadlineState(task, today = todayISO(), warningDays = DEADLINE_WARNING_DAYS) {
  if (task.status === 'done' || !task.deadline) return null;
  if (task.deadline < today) return 'overdue';
  if (task.deadline <= addDays(today, warningDays)) return 'soon';
  return null;
}

export class DataStore {
  /**
   * @param {object} [state] state valid (hasil emptyState / parseBackup)
   * @param {{save:(json:string)=>Promise<void>}} [adapter]
   */
  constructor(state = emptyState(), adapter = null) {
    this.state = state;
    this.adapter = adapter;
    this.onSaveError = null;
    this.onChange = null;
    this._chain = Promise.resolve();
    this._pending = 0;
  }

  // ----------------------------------------------------------- persistensi
  _touch() {
    if (this.onChange) this.onChange();
    if (!this.adapter) return;
    this._pending += 1;
    this._chain = this._chain.then(async () => {
      try {
        await this.adapter.save(JSON.stringify(this.state));
      } catch (error) {
        if (this.onSaveError) this.onSaveError(error);
      } finally {
        this._pending -= 1;
      }
    });
  }

  /** Tunggu semua penyimpanan yang sedang berjalan selesai. */
  flush() { return this._chain; }

  replaceState(state) { this.state = state; this._touch(); }
  snapshot() { return JSON.stringify(this.state); }

  // -------------------------------------------------------------- kategori
  categories() { return this.state.categories.map((c) => ({ ...c })); }
  categoryName(id) { return this.state.categories.find((c) => c.id === id)?.name ?? '(kategori dihapus)'; }
  categoryUsage(id) { return this.state.activities.filter((a) => a.category_id === id).length; }

  addCategory(name) {
    const clean = validateCategoryName(name);
    if (this.state.categories.some((c) => c.name.toLowerCase() === clean.toLowerCase())) {
      throw new ValidationError({ name: 'Kategori dengan nama tersebut sudah ada.' });
    }
    const category = { id: this.state.counters.category, name: clean };
    this.state.counters.category += 1;
    this.state.categories.push(category);
    this._touch();
    return category.id;
  }

  deleteCategory(id) {
    const index = this.state.categories.findIndex((c) => c.id === id);
    if (index < 0) throw new NotFoundError('Kategori tidak ditemukan.');
    const used = this.categoryUsage(id);
    if (used) throw new ValidationError({ name: `Kategori dipakai oleh ${used} kegiatan dan tidak dapat dihapus.` });
    this.state.categories.splice(index, 1);
    this._touch();
  }

  // -------------------------------------------------------------- kegiatan
  _withCategory(activity) { return { ...activity, category_name: this.categoryName(activity.category_id) }; }

  createActivity(data) {
    const cleaned = validateActivity(data, this.state.categories.map((c) => c.id));
    const now = new Date().toISOString();
    const activity = { id: this.state.counters.activity, ...cleaned, created_at: now, updated_at: now };
    this.state.counters.activity += 1;
    this.state.activities.push(activity);
    this._touch();
    return activity.id;
  }

  updateActivity(id, data) {
    const index = this.state.activities.findIndex((a) => a.id === id);
    if (index < 0) throw new NotFoundError('Kegiatan tidak ditemukan. Mungkin sudah dihapus.');
    const cleaned = validateActivity(data, this.state.categories.map((c) => c.id));
    const old = this.state.activities[index];
    this.state.activities[index] = { ...old, ...cleaned, id: old.id, created_at: old.created_at, updated_at: new Date().toISOString() };
    this._touch();
  }

  deleteActivity(id) {
    const index = this.state.activities.findIndex((a) => a.id === id);
    if (index < 0) throw new NotFoundError('Kegiatan tidak ditemukan. Mungkin sudah dihapus.');
    this.state.activities.splice(index, 1);
    this._touch();
  }

  getActivity(id) {
    const found = this.state.activities.find((a) => a.id === id);
    if (!found) throw new NotFoundError('Kegiatan tidak ditemukan. Mungkin sudah dihapus.');
    return this._withCategory(found);
  }

  /** Daftar kegiatan terfilter, tanpa paginasi. */
  listActivities({
    text = '', categoryId = null, dateFrom = null, dateTo = null, newestFirst = true,
  } = {}) {
    const needle = String(text || '').trim().toLowerCase();
    const rows = this.state.activities.filter((a) => (
      (!needle || a.title.toLowerCase().includes(needle))
      && (categoryId == null || a.category_id === categoryId)
      && (!dateFrom || a.date >= dateFrom)
      && (!dateTo || a.date <= dateTo)
    ));
    const sign = newestFirst ? -1 : 1;
    rows.sort((a, b) => sign * (a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time) || (a.id - b.id)));
    return rows.map((a) => this._withCategory(a));
  }

  searchActivities(filter = {}, page = 1, pageSize = PAGE_SIZE) {
    return paginate(this.listActivities(filter), page, pageSize);
  }

  recentActivities(limit = 5) {
    return this.listActivities({ newestFirst: true }).slice(0, limit);
  }

  // ----------------------------------------------------------------- tugas
  createTask(data) {
    const cleaned = validateTask(data);
    const task = { id: this.state.counters.task, ...cleaned };
    this.state.counters.task += 1;
    this.state.tasks.push(task);
    this._touch();
    return task.id;
  }

  getTask(id) {
    const found = this.state.tasks.find((t) => t.id === id);
    if (!found) throw new NotFoundError('Tugas tidak ditemukan. Mungkin sudah dihapus.');
    return { ...found };
  }

  updateTask(id, data) {
    const index = this.state.tasks.findIndex((t) => t.id === id);
    if (index < 0) throw new NotFoundError('Tugas tidak ditemukan. Mungkin sudah dihapus.');
    const cleaned = validateTask(data);
    this.state.tasks[index] = { ...cleaned, id };
    this._touch();
  }

  setTaskStatus(id, status) {
    if (!Object.hasOwn(STATUSES, status)) throw new ValidationError({ status: 'Status tidak valid.' });
    const task = this.state.tasks.find((t) => t.id === id);
    if (!task) throw new NotFoundError('Tugas tidak ditemukan. Mungkin sudah dihapus.');
    task.status = status;
    this._touch();
  }

  setTaskPriority(id, priority) {
    if (!Object.hasOwn(PRIORITIES, priority)) throw new ValidationError({ priority: 'Prioritas harus Rendah, Sedang, atau Tinggi.' });
    const task = this.state.tasks.find((t) => t.id === id);
    if (!task) throw new NotFoundError('Tugas tidak ditemukan. Mungkin sudah dihapus.');
    task.priority = priority;
    this._touch();
  }

  deleteTask(id) {
    const index = this.state.tasks.findIndex((t) => t.id === id);
    if (index < 0) throw new NotFoundError('Tugas tidak ditemukan. Mungkin sudah dihapus.');
    this.state.tasks.splice(index, 1);
    this._touch();
  }

  listTasks({ status = null, priority = null, text = '' } = {}) {
    const needle = String(text || '').trim().toLowerCase();
    const rows = this.state.tasks.filter((t) => (
      (!status || t.status === status) && (!priority || t.priority === priority)
      && (!needle || t.title.toLowerCase().includes(needle))
    ));
    rows.sort((a, b) => (STATUS_ORDER[a.status] - STATUS_ORDER[b.status])
      || (a.deadline ? 0 : 1) - (b.deadline ? 0 : 1)
      || (a.deadline && b.deadline ? a.deadline.localeCompare(b.deadline) : 0)
      || (b.id - a.id));
    return rows.map((t) => ({ ...t }));
  }

  searchTasks(filter = {}, page = 1, pageSize = PAGE_SIZE) { return paginate(this.listTasks(filter), page, pageSize); }

  taskCounts() {
    const counts = { todo: 0, in_progress: 0, done: 0 };
    for (const t of this.state.tasks) counts[t.status] += 1;
    return counts;
  }

  tasksNeedingAttention(today = todayISO(), limit = 5) {
    const until = addDays(today, DEADLINE_WARNING_DAYS);
    return this.state.tasks
      .filter((t) => t.status !== 'done' && t.deadline && t.deadline <= until)
      .sort((a, b) => a.deadline.localeCompare(b.deadline) || a.id - b.id)
      .slice(0, limit)
      .map((t) => ({ ...t, deadline_state: deadlineState(t, today) }));
  }

  /** Tugas yang dibuat atau jatuh tempo dalam periode (kedua batas inklusif). */
  tasksForPeriod(start, end) {
    return this.listTasks().filter((t) => (t.created_at >= start && t.created_at <= end)
      || (t.deadline && t.deadline >= start && t.deadline <= end));
  }

  // ----------------------------------------------------- profil & pengaturan
  getProfile() { return { ...this.state.profile }; }
  setProfile(data) {
    this.state.profile = validateProfile(data);
    this._touch();
  }

  get theme() { return this.state.settings.theme; }
  get dateFormat() { return this.state.settings.date_format; }
  setTheme(mode) {
    if (mode !== 'light' && mode !== 'dark') throw new ValidationError({ theme: 'Tema tidak valid.' });
    this.state.settings.theme = mode;
    this._touch();
  }
  setDateFormat(fmt) {
    if (!Object.hasOwn(DATE_FORMATS, fmt)) throw new ValidationError({ date_format: 'Format tanggal tidak dikenal.' });
    this.state.settings.date_format = fmt;
    this._touch();
  }
}
