// Ikon SVG outline kustom dibuat murni menggunakan createElementNS (tanpa innerHTML).
import { svgEl } from './dom.js';

const ICON_PATHS = {
  dashboard: [
    ['rect', { x: 3, y: 3, width: 7, height: 9, rx: 1.5 }],
    ['rect', { x: 14, y: 3, width: 7, height: 5, rx: 1.5 }],
    ['rect', { x: 14, y: 12, width: 7, height: 9, rx: 1.5 }],
    ['rect', { x: 3, y: 16, width: 7, height: 5, rx: 1.5 }],
  ],
  form: [
    ['path', { d: 'M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z' }],
    ['path', { d: 'M14 7l3 3' }],
  ],
  history: [
    ['circle', { cx: 12, cy: 12, r: 9 }],
    ['path', { d: 'M12 7v5l3 2' }],
  ],
  tasks: [
    ['rect', { x: 4, y: 4, width: 16, height: 16, rx: 2 }],
    ['path', { d: 'M8 12l3 3 5-6' }],
  ],
  reports: [
    ['path', { d: 'M4 20V10M10 20V4M16 20v-7M22 20H2' }],
  ],
  settings: [
    ['circle', { cx: 12, cy: 12, r: 3 }],
    ['path', { d: 'M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5h0a1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z' }],
  ],
  search: [
    ['circle', { cx: 11, cy: 11, r: 7 }],
    ['path', { d: 'm21 21-4.3-4.3' }],
  ],
  plus: [
    ['line', { x1: 12, y1: 5, x2: 12, y2: 19 }],
    ['line', { x1: 5, y1: 12, x2: 19, y2: 12 }],
  ],
  download: [
    ['path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' }],
    ['polyline', { points: '7 10 12 15 17 10' }],
    ['line', { x1: 12, y1: 15, x2: 12, y2: 3 }],
  ],
  upload: [
    ['path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' }],
    ['polyline', { points: '17 8 12 3 7 8' }],
    ['line', { x1: 12, y1: 3, x2: 12, y2: 15 }],
  ],
  sun: [
    ['circle', { cx: 12, cy: 12, r: 4 }],
    ['path', { d: 'M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41' }],
  ],
  moon: [
    ['path', { d: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z' }],
  ],
  arrowRight: [
    ['line', { x1: 5, y1: 12, x2: 19, y2: 12 }],
    ['polyline', { points: '12 5 19 12 12 19' }],
  ],
  arrowUpRight: [
    ['line', { x1: 7, y1: 17, x2: 17, y2: 7 }],
    ['polyline', { points: '7 7 17 7 17 17' }],
  ],
  left: [['polyline', { points: '15 18 9 12 15 6' }]],
  right: [['polyline', { points: '9 18 15 12 9 6' }]],
  chevLeft: [['polyline', { points: '15 18 9 12 15 6' }]],
  chevRight: [['polyline', { points: '9 18 15 12 9 6' }]],
  trash: [
    ['polyline', { points: '3 6 5 6 21 6' }],
    ['path', { d: 'M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6' }],
    ['path', { d: 'M10 11v6M14 11v6M9 6V4h6v2' }],
  ],
  edit: [
    ['path', { d: 'M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z' }],
  ],
  eye: [
    ['path', { d: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z' }],
    ['circle', { cx: 12, cy: 12, r: 3 }],
  ],
  x: [
    ['path', { d: 'M6 6l12 12M18 6L6 18' }],
  ],
  check: [['polyline', { points: '20 6 9 17 4 12' }]],
  clock: [
    ['circle', { cx: 12, cy: 12, r: 9 }],
    ['polyline', { points: '12 7 12 12 15 15' }],
  ],
  calendar: [
    ['rect', { x: 3, y: 4, width: 18, height: 18, rx: 2 }],
    ['line', { x1: 16, y1: 2, x2: 16, y2: 6 }],
    ['line', { x1: 8, y1: 2, x2: 8, y2: 6 }],
    ['line', { x1: 3, y1: 10, x2: 21, y2: 10 }],
  ],
  list: [
    ['path', { d: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01' }],
  ],
  file: [
    ['path', { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' }],
    ['polyline', { points: '14 2 14 8 20 8' }],
  ],
};

export function icon(name, size = 16) {
  const shapes = ICON_PATHS[name] || ICON_PATHS.file;
  const children = shapes.map(([tag, attrs]) => svgEl(tag, attrs));
  return svgEl(
    'svg',
    {
      class: 'icon',
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '2',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'aria-hidden': 'true',
    },
    ...children
  );
}

export const createIcon = icon;
export const ICON_NAMES = Object.keys(ICON_PATHS);
