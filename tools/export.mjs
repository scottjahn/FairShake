// Dump SQLite to the JSON snapshot that tools/single-file.mjs bakes into the
// offline page. `npm run build` runs this first.
//
//   npm run export

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPublic } from './db.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const EXPORT_PATH = join(ROOT, 'data', 'events.json');

/** Write the snapshot; also called by the admin server's Export button. */
export function writeExport() {
  const events = loadPublic();
  mkdirSync(dirname(EXPORT_PATH), { recursive: true });
  writeFileSync(EXPORT_PATH, JSON.stringify(events, null, 2) + '\n');
  return {
    path: relative(ROOT, EXPORT_PATH),
    events: events.length,
    locked: events.filter((e) => e.locked).length,
    students: events.reduce((n, e) => n + e.students.length, 0),
  };
}

// `npm run export` runs this file directly.
if (process.argv[1]?.endsWith('export.mjs')) {
  const r = writeExport();
  console.log(`Exported -> ${r.path}\n  ${r.events} event(s) (${r.locked} locked), ${r.students} student row(s)`);
}
