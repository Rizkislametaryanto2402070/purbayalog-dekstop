import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './helpers.mjs';

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
const own = walk(path.join(ROOT, 'src')).filter((f) => /\.(js|css|html)$/.test(f) && !f.includes(`${path.sep}vendor${path.sep}`));

test('kode sendiri tidak memuat URL eksternal atau pemanggilan jaringan', () => {
  for (const f of own) {
    const t = fs.readFileSync(f, 'utf8');
    assert.doesNotMatch(t.replace(/xmlns[^"]*"[^"]*"|http:\/\/schemas\.[^"'<\s]*|http:\/\/purl\.[^"'<\s]*|http:\/\/www\.w3\.org[^"'<\s]*/g, ''), /https?:\/\//, f);
    assert.doesNotMatch(t, /\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\s*\(/, f);
  }
});

test('tidak ada emoji dan tidak ada gradient', () => {
  for (const f of own) {
    const t = fs.readFileSync(f, 'utf8');
    assert.doesNotMatch(t, /\p{Extended_Pictographic}/u, `emoji di ${f}`);
    assert.doesNotMatch(t, /gradient\(/i, `gradient di ${f}`);
  }
});

test('index.html hanya memuat sumber lokal dan CSP ketat', () => {
  const html = fs.readFileSync(path.join(ROOT, 'src/index.html'), 'utf8');
  for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) assert.doesNotMatch(m[1], /^(https?:)?\/\//);
  const conf = JSON.parse(fs.readFileSync(path.join(ROOT, 'src-tauri/tauri.conf.json'), 'utf8'));
  assert.match(conf.app.security.csp, /default-src 'none'/);
  assert.doesNotMatch(conf.app.security.csp, /https?:\/\/(?!ipc\.localhost)/);
});

test('font lokal tersedia dan izin Tauri minimum', () => {
  for (const f of ['Nunito-Variable.ttf', 'Rubik-Variable.ttf']) assert.ok(fs.statSync(path.join(ROOT, 'src/fonts', f)).size > 100000);
  const cap = JSON.parse(fs.readFileSync(path.join(ROOT, 'src-tauri/capabilities/default.json'), 'utf8'));
  assert.ok(!cap.permissions.some((p) => /fs:(allow-write|default|allow-remove)/.test(p)));
});
