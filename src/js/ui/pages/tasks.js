import { formatDate, todayISO } from '../../core/dates.js';
import { PRIORITIES, STATUSES } from '../../core/config.js';
import { deadlineState } from '../../core/store.js';
import { ValidationError } from '../../core/errors.js';
import { truncate } from '../../core/helpers.js';
import { h, replace } from '../dom.js';
import { badge, card, confirmDialog, emptyState, field, iconButton, modal, pager, selectInput, textArea, textInput, toast } from '../widgets.js';
import { icon } from '../icons.js';

const PRIORITY_KIND = { low: '', medium: 'warning', high: 'danger' };

export function tasksPage(ctx, params = {}) {
  const { store } = ctx;
  const fmt = (d) => formatDate(d, store.dateFormat);
  const state = { page: 1 };
  const search = field({
    label: 'Cari tugas',
    control: textInput({ type: 'search', placeholder: 'Ketik nama tugas', value: params.search ?? ctx.quickSearch ?? '' }),
  });
  const status = field({ label: 'Status', control: selectInput([['', 'Semua status'], ...Object.entries(STATUSES)]) });
  const priority = field({ label: 'Prioritas', control: selectInput([['', 'Semua prioritas'], ...Object.entries(PRIORITIES)]) });
  const body = h('div');

  function openDialog(task = null) {
    const example = fmt('2026-12-31');
    const f = {
      title: field({ label: 'Nama tugas', required: true, control: textInput({ maxLength: 400 }) }),
      description: field({ label: 'Deskripsi', control: textArea({ rows: 3 }) }),
      priority: field({ label: 'Prioritas', control: selectInput(Object.entries(PRIORITIES), task?.priority ?? 'medium') }),
      status: field({ label: 'Status', control: selectInput(Object.entries(STATUSES), task?.status ?? 'todo') }),
      created_at: field({ label: 'Tanggal dibuat', help: `Contoh: ${example}`, control: textInput({ placeholder: example }) }),
      deadline: field({ label: 'Deadline (opsional)', help: `Contoh: ${example}`, control: textInput({ placeholder: example }) }),
      result_notes: field({ label: 'Catatan hasil', control: textArea({ rows: 2 }) }),
    };
    f.title.control.value = task?.title ?? '';
    f.description.control.value = task?.description ?? '';
    f.created_at.control.value = fmt(task?.created_at ?? todayISO());
    f.deadline.control.value = task?.deadline ? fmt(task.deadline) : '';
    f.result_notes.control.value = task?.result_notes ?? '';

    const save = (m) => {
      Object.values(f).forEach((x) => x.setError(null));
      const data = Object.fromEntries(Object.entries(f).map(([k, x]) => [k, x.control.value]));
      try {
        if (task) store.updateTask(task.id, data);
        else store.createTask(data);
      } catch (e) {
        if (!(e instanceof ValidationError)) throw e;
        let first = null;
        for (const [k, msg] of Object.entries(e.errors)) {
          f[k]?.setError(msg);
          first ||= f[k];
        }
        first?.control.focus();
        return false;
      }
      m.close(true);
      toast(task ? 'Tugas diperbarui.' : 'Tugas ditambahkan.');
      render();
      return true;
    };

    const form = h(
      'form',
      {
        novalidate: true,
        onsubmit: (e) => {
          e.preventDefault();
        },
      },
      h(
        'div',
        { class: 'form-grid' },
        f.title.el,
        f.description.el,
        ...[f.priority, f.status, f.created_at, f.deadline].map((x) => {
          x.el.classList.add('span-6');
          return x.el;
        }),
        f.result_notes.el
      )
    );
    for (const x of Object.values(f)) if (!x.el.className.includes('span-')) x.el.classList.add('span-12');
    return {
      api: modal({
        title: task ? 'Edit Tugas' : 'Tugas Baru',
        body: form,
        width: 620,
        actions: [
          { label: 'Batal', onClick: (m) => m.close() },
          { label: 'Simpan', kind: 'primary', onClick: save },
        ],
      }),
      fields: f,
      save,
    };
  }

  async function remove(t) {
    const ok = await confirmDialog({
      title: 'Hapus tugas?',
      message: `Tugas "${truncate(t.title, 60)}" akan dihapus permanen.`,
      confirmText: 'Hapus',
      danger: true,
    });
    if (!ok) return false;
    store.deleteTask(t.id);
    toast('Tugas dihapus.');
    render();
    return true;
  }

  function resetFilters() {
    search.control.value = '';
    status.control.value = '';
    priority.control.value = '';
    ctx.syncQuickSearch?.('');
    state.page = 1;
    render();
  }

  function render() {
    const result = store.searchTasks(
      {
        status: status.control.value || null,
        priority: priority.control.value || null,
        text: search.control.value,
      },
      state.page
    );
    state.page = result.page;
    if (!result.total) {
      replace(
        body,
        store.state.tasks.length
          ? emptyState('Tidak ada hasil', 'Tidak ada tugas yang cocok dengan filter.', 'Reset filter', resetFilters)
          : emptyState(
              'Belum ada tugas',
              'Tambahkan tugas dari pembimbing untuk memantau status dan deadline.',
              'Tugas Baru',
              () => openDialog()
            )
      );
      return;
    }
    const today = todayISO();
    const rows = result.items.map((t) => {
      const st = deadlineState(t, today);
      const sel = selectInput(Object.entries(STATUSES), t.status, {
        'aria-label': `Status tugas ${t.title}`,
        style: 'min-width:155px',
      });
      sel.addEventListener('change', () => {
        store.setTaskStatus(t.id, sel.value);
        toast('Status diperbarui.');
        render();
      });
      return h(
        'tr',
        {},
        h(
          'td',
          {},
          h('b', { style: 'font-weight:700;color:var(--ink-primary)', text: truncate(t.title, 60), title: t.title }),
          t.description ? h('div', { class: 'activity-meta', text: truncate(t.description, 80) }) : null
        ),
        h('td', {}, badge(PRIORITIES[t.priority], PRIORITY_KIND[t.priority])),
        h('td', {}, sel),
        h(
          'td',
          { class: 'tabular-nums', style: 'white-space:nowrap' },
          t.deadline
            ? [
                fmt(t.deadline),
                ' ',
                st === 'overdue' ? badge('Terlambat', 'danger') : st === 'soon' ? badge('Segera', 'warning') : null,
              ]
            : h('span', { class: 'muted', text: '-' })
        ),
        h('td', { class: 'tabular-nums', style: 'white-space:nowrap', text: fmt(t.created_at) }),
        h(
          'td',
          {},
          h(
            'div',
            { class: 'actions' },
            iconButton('edit', 'Edit tugas', () => openDialog(t)),
            iconButton('trash', 'Hapus tugas', () => remove(t))
          )
        )
      );
    });
    replace(
      body,
      h(
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
                ['Tugas', 'Prioritas', 'Status', 'Deadline', 'Dibuat'].map((x) => h('th', { text: x })),
                h('th', { class: 'num', text: 'Aksi' })
              )
            ),
            h('tbody', {}, rows)
          )
        ),
        pager(result, (p) => {
          state.page = p;
          render();
        })
      )
    );
  }

  let timer = null;
  search.control.addEventListener('input', () => {
    ctx.syncQuickSearch?.(search.control.value);
    clearTimeout(timer);
    timer = setTimeout(() => {
      state.page = 1;
      render();
    }, 200);
  });
  for (const f of [status, priority]) {
    f.control.addEventListener('change', () => {
      state.page = 1;
      render();
    });
  }
  for (const f of [search, status, priority]) f.el.classList.add('span-4');

  const el = h(
    'div',
    { class: 'page' },
    h(
      'div',
      { class: 'page-head workspace-title-row' },
      h(
        'div',
        {},
        h('h1', { class: 'workspace-title', text: 'Manajemen Tugas' }),
        h('p', { class: 'workspace-subtitle', text: 'Pantau tugas dari pembimbing beserta prioritas, status, dan deadline.' })
      ),
      h(
        'button',
        { class: 'btn primary btn-primary', type: 'button', id: 'task-new', onclick: () => openDialog() },
        icon('plus', 15),
        h('span', { text: 'Tugas Baru' })
      )
    ),
    h(
      'div',
      { class: 'stack' },
      h('section', { class: 'card' }, h('div', { class: 'form-grid' }, search.el, status.el, priority.el)),
      card(null, body)
    )
  );
  render();
  return { el, openDialog, remove, render };
}
