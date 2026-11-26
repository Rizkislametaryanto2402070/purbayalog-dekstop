// Grafik SVG kustom (tanpa pustaka eksternal): Sparkline & Grafik Batang Mingguan.
import { svgEl } from './dom.js';

/** Skala rapi bilangan bulat untuk sumbu vertikal. */
function niceScale(value) {
  const step = value <= 4 ? 1 : value <= 10 ? 2 : value <= 20 ? 5 : 10;
  const max = Math.max(step, Math.ceil(value / step) * step);
  return { max, step, ticks: max / step };
}

export function sparklineChart(values) {
  const w = 120;
  const h = 32;
  const safe = values && values.length ? values : [0, 0, 0, 0, 0, 0, 0];
  const max = Math.max(...safe, 1);
  const stepX = safe.length > 1 ? (w - 8) / (safe.length - 1) : 0;

  const d = safe
    .map((val, idx) => {
      const x = 4 + idx * stepX;
      const y = h - 4 - (val / max) * (h - 10);
      return `${idx === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');

  return svgEl(
    'svg',
    { viewBox: `0 0 ${w} ${h}`, width: '100%', height: '30', fill: 'none', 'aria-hidden': 'true' },
    svgEl('path', {
      d,
      stroke: 'var(--teal-700)',
      'stroke-width': '2.2',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    })
  );
}

/** Batang vertikal: [{label, value, title, isToday}] -- value dalam jam. */
export function weeklyChart(days, { width = 380, height = 176, unit = 'jam' } = {}) {
  const pad = { l: 30, r: 10, t: 18, b: 26 };
  const svg = svgEl('svg', {
    class: 'chart',
    viewBox: `0 0 ${width} ${height}`,
    width: '100%',
    height: String(height),
    role: 'img',
    'aria-label': `Durasi kegiatan per hari dalam ${unit}`,
  });

  const { max } = niceScale(Math.max(...days.map((d) => d.value), 4));
  const iw = width - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const gridRatios = [0, 0.5, 1];

  for (const ratio of gridRatios) {
    const val = Math.round(max * ratio);
    const y = pad.t + ih - ratio * ih;
    svg.append(
      svgEl('line', {
        class: 'grid-line',
        x1: pad.l,
        x2: width - pad.r,
        y1: y.toFixed(1),
        y2: y.toFixed(1),
      }),
      svgEl(
        'text',
        {
          x: pad.l - 6,
          y: (y + 3.5).toFixed(1),
          'text-anchor': 'end',
          textContent: `${val}j`,
        }
      )
    );
  }

  const slot = iw / days.length;
  const bw = Math.min(28, slot * 0.54);

  days.forEach((d, i) => {
    const hours = d.value || 0;
    const x = pad.l + slot * i + (slot - bw) / 2;
    const bh = Math.max(hours > 0 ? 6 : 2, max ? (ih * hours) / max : 2);
    const y = pad.t + ih - bh;
    const barClass = hours <= 0 ? 'bar-fill empty-bar' : d.isToday ? 'bar-fill today' : 'bar-fill';

    const bar = svgEl(
      'rect',
      {
        class: barClass,
        x: x.toFixed(1),
        y: y.toFixed(1),
        width: bw.toFixed(1),
        height: bh.toFixed(1),
        rx: 5,
      },
      svgEl('title', { textContent: d.title || `${d.label}: ${hours}` })
    );
    svg.append(bar);

    if (hours > 0) {
      svg.append(
        svgEl('text', {
          class: 'val',
          x: (x + bw / 2).toFixed(1),
          y: (y - 5).toFixed(1),
          'text-anchor': 'middle',
          textContent: String(+hours.toFixed(1)).replace('.', ','),
        })
      );
    }

    svg.append(
      svgEl('text', {
        x: (x + bw / 2).toFixed(1),
        y: (height - 8).toFixed(1),
        'text-anchor': 'middle',
        style: d.isToday ? 'fill:var(--ink-primary);font-weight:600' : null,
        textContent: d.label,
      })
    );
  });

  return svg;
}
