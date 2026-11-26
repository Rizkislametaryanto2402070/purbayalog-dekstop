import { h, replace } from './dom.js';
import { icon } from './icons.js';

// ------------------------------------------------------------------ toast
export function toast(message, kind = 'info', ms = 3200) {
  const root = document.getElementById('toasts');
  const el = h('div', { class: `toast ${kind}`, role: kind === 'error' ? 'alert' : 'status', text: message });
  root.append(el);
  while (root.children.length > 3) root.firstChild.remove();
  setTimeout(() => el.remove(), kind === 'error' ? Math.max(ms, 6000) : ms);
  return el;
}

// ------------------------------------------------------------------ modal
export function modal({ title, body, actions = [], width = null, onClose = null }) {
  const root = document.getElementById('modal-root');
  const previous = document.activeElement;
  const heading = h('h2', { id: 'modal-title', text: title });
  const foot = h('div', { class: 'foot' });
  const box = h(
    'div',
    {
      class: 'modal',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'modal-title',
      style: width ? `width:min(${width}px,100%)` : null,
    },
    heading,
    body,
    foot
  );
  const overlay = h('div', { class: 'overlay' }, box);
  let closed = false;
  const api = {
    el: box,
    foot,
    close(result) {
      if (closed) return;
      closed = true;
      overlay.remove();
      document.removeEventListener('keydown', onKey, true);
      if (previous && previous.focus) previous.focus();
      if (onClose) onClose(result);
    },
  };
  function onKey(e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      api.close(undefined);
      return;
    }
    if (e.key === 'Tab') {
      const items = [...box.querySelectorAll('button, input, select, textarea, [href], [tabindex]:not([tabindex="-1"])')].filter(
        (x) => !x.disabled && x.offsetParent !== null
      );
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }
  for (const a of actions) {
    foot.append(h('button', { class: `btn ${a.kind || ''}`, type: 'button', onclick: () => a.onClick(api) }, a.label));
  }
  document.addEventListener('keydown', onKey, true);
  root.append(overlay);
  const focusTarget =
    box.querySelector('input, select, textarea') || foot.querySelector('.btn.primary, .btn.danger') || foot.querySelector('button');
  if (focusTarget) focusTarget.focus();
  return api;
}

/** Dialog konfirmasi. Resolve true bila dikonfirmasi. */
export function confirmDialog({ title, message, confirmText = 'Ya', cancelText = 'Batal', danger = false }) {
  return new Promise((resolve) => {
    modal({
      title,
      body: h('p', { class: 'muted', style: 'margin:0', text: message }),
      width: 460,
      onClose: (r) => resolve(r === true),
      actions: [
        { label: cancelText, onClick: (m) => m.close(false) },
        { label: confirmText, kind: danger ? 'danger' : 'primary', onClick: (m) => m.close(true) },
      ],
    });
  });
}

export function messageDialog({ title, message, kind = 'info' }) {
  return new Promise((resolve) => {
    modal({
      title,
      body: h('p', { class: kind === 'error' ? '' : 'muted', style: 'margin:0;white-space:pre-wrap', text: message }),
      width: 480,
      onClose: () => resolve(),
      actions: [{ label: 'Tutup', kind: 'primary', onClick: (m) => m.close() }],
    });
  });
}

// ------------------------------------------------------------------ form
let fieldSeq = 0;
/** Bungkus kontrol input dengan label, bantuan, dan pesan galat inline. */
export function field({ label, control, required = false, help = null, span = null }) {
  fieldSeq += 1;
  const id = `f${fieldSeq}`;
  control.id = id;
  const errorEl = h('div', { class: 'err', id: `${id}-err`, hidden: true });
  const el = h(
    'div',
    { class: `field field-group ${span ? `span-${span}` : ''}`.trim() },
    h('label', { class: 'field-label', for: id }, label, required ? h('span', { class: 'req', 'aria-hidden': 'true' }, ' *') : null),
    control,
    help ? h('div', { class: 'help', text: help }) : null,
    errorEl
  );
  return {
    el,
    control,
    setError(message) {
      errorEl.textContent = message || '';
      errorEl.hidden = !message;
      if (message) {
        control.setAttribute('aria-invalid', 'true');
        control.setAttribute('aria-describedby', errorEl.id);
      } else {
        control.removeAttribute('aria-invalid');
        control.removeAttribute('aria-describedby');
      }
    },
  };
}

export const textInput = (props = {}) => h('input', { class: 'input input-box', type: 'text', autocomplete: 'off', ...props });
export const textArea = (props = {}) => h('textarea', { class: 'input textarea-box', ...props });
export function selectInput(options, value = options[0]?.[0] ?? '', props = {}) {
  const el = h(
    'select',
    { class: 'input select-box', ...props },
    options.map(([v, text]) => h('option', { value: String(v) }, text))
  );
  el.value = String(value);
  return el;
}

// ------------------------------------------------------------ elemen kecil
const BADGE_CLASS = {
  primary: 'primary tag-teal',
  success: 'success tag-teal',
  warning: 'warning tag-amber',
  danger: 'danger tag-coral',
  '': 'tag-teal',
};

export const badge = (text, kind = '') => h('span', { class: `badge tag-pill ${BADGE_CLASS[kind] ?? kind}`.trim(), text });

export function emptyState(title, text, actionLabel = null, onAction = null) {
  return h(
    'div',
    { class: 'empty empty-box' },
    h('h3', { class: 'activity-title', text: title }),
    h('div', { class: 'activity-meta', text }),
    actionLabel
      ? h('button', { class: 'btn primary btn-primary', type: 'button', onclick: onAction }, icon('plus', 14), h('span', { text: actionLabel }))
      : null
  );
}

export function statCard(label, value, hint = '', extraClass = '') {
  const v = h('div', { class: `kpi-value value tabular-nums ${String(value).length > 7 ? 'long' : ''}`.trim(), text: value });
  const hi = h('div', { class: 'kpi-sub hint', text: hint });
  return {
    el: h('div', { class: `card kpi-card stat ${extraClass}`.trim() }, h('div', { class: 'kpi-label label', text: label }), v, hi),
    set(value2, hint2) {
      v.className = `kpi-value value tabular-nums ${String(value2).length > 7 ? 'long' : ''}`.trim();
      v.textContent = value2;
      hi.textContent = hint2;
    },
  };
}

export function card(title, body, action = null) {
  return h(
    'section',
    { class: 'card' },
    title ? h('h2', { class: 'section-bar' }, h('span', { class: 'section-heading', style: 'font-size:15px', text: title }), action) : null,
    body
  );
}

export function pager(page, onChange) {
  const info = h('span', {
    class: 'muted small tabular-nums',
    text: page.total ? `Menampilkan ${page.first}-${page.last} dari ${page.total} data` : 'Tidak ada data',
  });
  const prev = h(
    'button',
    {
      class: 'btn icon-only circle-btn outline',
      type: 'button',
      'aria-label': 'Halaman sebelumnya',
      disabled: page.page <= 1,
      onclick: () => onChange(page.page - 1),
    },
    icon('left', 14)
  );
  const next = h(
    'button',
    {
      class: 'btn icon-only circle-btn outline',
      type: 'button',
      'aria-label': 'Halaman berikutnya',
      disabled: page.page >= page.pages,
      onclick: () => onChange(page.page + 1),
    },
    icon('right', 14)
  );
  return h(
    'div',
    { class: 'pager' },
    info,
    h('div', { class: 'row' }, prev, h('span', { class: 'small tabular-nums', text: `Halaman ${page.page} dari ${page.pages}` }), next)
  );
}

export function iconButton(name, label, onClick, kind = 'ghost') {
  const cls = kind === 'ghost' ? 'btn ghost icon-only circle-btn outline' : `btn ${kind} icon-only`;
  return h('button', { class: cls, type: 'button', title: label, 'aria-label': label, onclick: onClick }, icon(name, 14));
}

export { replace };
