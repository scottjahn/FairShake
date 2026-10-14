// Local SQLite data layer for FairShake.
//
// The single source of truth, edited locally through the admin server and read
// by the export script. It never runs in production — the deployed site is
// fully static (public/data/**).

import Database from 'better-sqlite3';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

export const DB_PATH = process.env.FAIRSHAKE_DB ?? join(ROOT, 'data', 'fairshake.db');
const SCHEMA_PATH = join(ROOT, 'database', 'schema.sqlite.sql');

let db;

/** Open (and lazily initialise) the SQLite database. */
export function getDb() {
  if (db) return db;
  mkdirSync(dirname(DB_PATH), { recursive: true });
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  db.exec(readFileSync(SCHEMA_PATH, 'utf8')); // idempotent (CREATE ... IF NOT EXISTS)
  return db;
}

// Databases created before the top and draw counts were split had a single
// prize_count used for both. Carry it into the two new columns.
function migrate(d) {
  const cols = d.prepare(`PRAGMA table_info(events)`).all().map((c) => c.name);
  if (!cols.includes('prize_count')) return;
  d.transaction(() => {
    d.exec(`ALTER TABLE events RENAME COLUMN prize_count TO top_count`);
    d.exec(`ALTER TABLE events ADD COLUMN draw_count INTEGER NOT NULL DEFAULT 3 CHECK (draw_count >= 0)`);
    d.exec(`UPDATE events SET draw_count = top_count`);
  })();
}

const bool = (v) => !!v;

const eventRow = (r) => ({
  id: r.id,
  name: r.name,
  topCount: r.top_count,
  drawCount: r.draw_count,
  locked: bool(r.locked),
  lockedAt: r.locked_at,
  createdAt: r.created_at,
});

/** Students of one event, most tickets first. `withIds` adds the admin-only row id. */
export function loadStudents(eventId, { withIds = false } = {}, d = getDb()) {
  return d.prepare(
    `SELECT id, name, tickets, winner, pick_order FROM students
     WHERE event_id=? ORDER BY tickets DESC, name COLLATE NOCASE`
  ).all(eventId).map((r) => ({
    ...(withIds ? { id: r.id } : {}),
    name: r.name,
    tickets: r.tickets,
    winner: r.winner ?? null,
    pickOrder: r.pick_order ?? null,
  }));
}

export function loadEvent(id, opts, d = getDb()) {
  const r = d.prepare(`SELECT * FROM events WHERE id=?`).get(id);
  return r ? { ...eventRow(r), students: loadStudents(r.id, opts, d) } : null;
}

/**
 * Every event with its students — the exact shape of public/data/events.json.
 * Newest event first.
 */
export function loadPublic(d = getDb()) {
  return d.prepare(`SELECT * FROM events ORDER BY created_at DESC, id DESC`).all()
    .map((r) => ({ ...eventRow(r), students: loadStudents(r.id, {}, d) }));
}
