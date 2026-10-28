// Turn the Vite build into one self-contained page: dist/FairShake.html.
//
// The script, the stylesheet and the exported events (data/events.json) are
// all inlined, so the file runs offline, opened straight from disk, with
// nothing else beside it. `npm run build` runs this last.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXPORT_PATH } from './export.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
export const OFFLINE_PATH = join(DIST, 'FairShake.html');

// Inline text must not close the <script> or <style> tag it sits in.
const safe = (text) => text.replace(/<\/(script|style)/gi, '<\\/$1');

let html = readFileSync(join(DIST, 'index.html'), 'utf8');
const events = readFileSync(EXPORT_PATH, 'utf8');

const scripts = [...html.matchAll(/<script type="module"[^>]*src="\.\/([^"]+)"[^>]*><\/script>/g)];
const styles = [...html.matchAll(/<link rel="stylesheet"[^>]*href="\.\/([^"]+)"[^>]*>/g)];
if (scripts.length !== 1 || styles.length > 1 || /\shref="\.\/|\ssrc="\.\//.test(
  html.replace(scripts[0]?.[0] ?? '', '').replace(styles[0]?.[0] ?? '', ''))) {
  throw new Error('Unexpected build output: expected one script, at most one stylesheet, nothing else.');
}

const read = (rel) => readFileSync(join(DIST, rel), 'utf8');
html = html.replace(scripts[0][0], () =>
  `<script>window.__FAIRSHAKE_EVENTS__ = ${events.trim().replace(/</g, '\\u003c')};</script>\n` +
  `<script type="module">${safe(read(scripts[0][1]))}</script>`);
if (styles[0]) html = html.replace(styles[0][0], () => `<style>${safe(read(styles[0][1]))}</style>`);

writeFileSync(OFFLINE_PATH, html);
console.log(`Built -> dist/FairShake.html (${Math.round(html.length / 1024)} KB)`);
