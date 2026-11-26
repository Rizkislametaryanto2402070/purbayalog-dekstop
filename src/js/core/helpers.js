export function truncate(text, limit) {
  const s = String(text ?? '');
  return s.length <= limit ? s : `${s.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

/** Nama berkas aman: pemisah jadi "_", karakter terlarang dibuang. */
export function safeFilename(text, fallback = 'file') {
  const cleaned = String(text ?? '')
    .replace(/[\\/\s]+/g, '_')
    .replace(/[<>:"|?*\u0000-\u001f]/g, '')
    .replace(/^[._]+|[._]+$/g, '');
  return cleaned || fallback;
}

export function clampPage(page, total, pageSize) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return Math.min(Math.max(1, Number(page) || 1), pages);
}

export function paginate(items, page, pageSize) {
  const total = items.length;
  const current = clampPage(page, total, pageSize);
  const start = (current - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    total,
    page: current,
    pageSize,
    pages: Math.max(1, Math.ceil(total / pageSize)),
    first: total ? start + 1 : 0,
    last: Math.min(total, start + pageSize),
  };
}

export function pickText(source, keys) {
  const out = {};
  for (const key of keys) out[key] = source?.[key] == null ? '' : String(source[key]);
  return out;
}
