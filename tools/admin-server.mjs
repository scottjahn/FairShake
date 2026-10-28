// Local-only admin API for FairShake.
//
// Binds to 127.0.0.1 only — never reachable from the network. Vite proxies
// /api/* here during `npm run dev` so the React admin panel works against the
// live SQLite database. It is NOT deployed; the public page is one offline file.
//
// Run:     npm run dev         (starts this alongside Vite)
//          npm run dev:api     (this server alone, for debugging)

import express from 'express';
import { getDb, loadEvent, loadPublic, DB_PATH } from './db.mjs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeExport } from './export.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const PORT = Number(process.env.FAIRSHAKE_ADMIN_PORT ?? 8789);
const app = express();
app.use(express.json({ limit: '2mb' }));

const send = (res, data, status = 200) => res.status(status).json(data);
const fail = (res, msg, status = 400) => res.status(status).json({ error: msg, message: msg });
const httpError = (msg, status = 400) => Object.assign(new Error(msg), { status });

// Wrap a handler so any thrown error becomes a JSON error instead of a hung request.
const guard = (handler) => (req, res) => {
  try {
    handler(req, res);
  } catch (e) {
    if (!e.status) console.error(e);
    fail(res, e.message ?? String(e), e.status ?? 500);
  }
};

/** Load an event row, 404 if missing, 409 if locked (unless allowLocked). */
function requireEvent(id, { allowLocked = false } = {}) {
  const ev = getDb().prepare(`SELECT id, locked FROM events WHERE id=?`).get(Number(id));
  if (!ev) throw httpError('Event not found.', 404);
  if (ev.locked && !allowLocked) throw httpError('This event is locked. Unlock it to make changes.', 409);
  return ev;
}

function parseName(v) {
  const name = String(v ?? '').trim().replace(/\s+/g, ' ');
  if (!name) throw httpError('A name is required.');
  return name;
}

function parseTickets(v, label = 'Tickets') {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) throw httpError(`${label} must be a whole number of 0 or more.`);
  return n;
}

function parseEventBody(body) {
  return {
    name: parseName(body?.name),
    topCount: parseTickets(body?.topCount ?? 3, 'Top winners'),
    drawCount: parseTickets(body?.drawCount ?? 3, 'Random draw winners'),
  };
}

const isUnique = (e) => String(e).includes('UNIQUE');

// ─── service info ────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => send(res, { ok: true, service: 'fairshake-local-admin' }));

// The same shape as data/events.json, so the public pages work live
// against the database during `npm run dev`.
app.get('/api/public/events', guard((_req, res) => send(res, loadPublic())));

// Export the data and build dist/FairShake.html (the same as `npm run build`).
app.post('/api/ops/export', async (_req, res) => {
  try {
    const r = writeExport();
    await promisify(execFile)('npm', ['run', 'build'], { cwd: ROOT });
    send(res, { ...r, path: 'dist/FairShake.html' });
  } catch (e) {
    console.error(e);
    fail(res, `Build failed: ${e.stderr || e.message}`, 500);
  }
});

// ─── events ──────────────────────────────────────────────────────────────────

app.get('/api/ops/events', guard((_req, res) => {
  send(res, getDb().prepare(
    `SELECT e.id, e.name, e.top_count AS topCount, e.draw_count AS drawCount, e.locked, e.created_at AS createdAt,
            COUNT(s.id) AS studentCount, COUNT(s.winner) AS winnerCount
     FROM events e LEFT JOIN students s ON s.event_id = e.id
     GROUP BY e.id ORDER BY e.created_at DESC, e.id DESC`
  ).all().map((r) => ({ ...r, locked: !!r.locked })));
}));

app.post('/api/ops/events', guard((req, res) => {
  const ev = parseEventBody(req.body);
  const r = getDb().prepare(`INSERT INTO events (name, top_count, draw_count) VALUES (?, ?, ?)`).run(ev.name, ev.topCount, ev.drawCount);
  send(res, { id: Number(r.lastInsertRowid) }, 201);
}));

app.get('/api/ops/events/:id', guard((req, res) => {
  const ev = loadEvent(Number(req.params.id), { withIds: true });
  if (!ev) return fail(res, 'Event not found.', 404);
  send(res, ev);
}));

app.put('/api/ops/events/:id', guard((req, res) => {
  requireEvent(req.params.id);
  const ev = parseEventBody(req.body);
  getDb().prepare(`UPDATE events SET name=?, top_count=?, draw_count=? WHERE id=?`).run(ev.name, ev.topCount, ev.drawCount, Number(req.params.id));
  send(res, { updated: true });
}));

app.delete('/api/ops/events/:id', guard((req, res) => {
  requireEvent(req.params.id);
  getDb().prepare(`DELETE FROM events WHERE id=?`).run(Number(req.params.id)); // cascades to students
  send(res, { deleted: true });
}));

app.post('/api/ops/events/:id/lock', guard((req, res) => {
  requireEvent(req.params.id, { allowLocked: true });
  const locked = req.body?.locked !== false;
  getDb().prepare(`UPDATE events SET locked=?, locked_at=${locked ? "datetime('now')" : 'NULL'} WHERE id=?`)
    .run(locked ? 1 : 0, Number(req.params.id));
  send(res, { locked });
}));

// ─── students ────────────────────────────────────────────────────────────────

/**
 * Bulk upload. `mode: "replace"` swaps the whole roster (and so clears any
 * recorded winners); `mode: "merge"` updates tickets for names already present
 * and adds the rest, keeping recorded winners.
 */
app.put('/api/ops/events/:id/students', guard((req, res) => {
  const eventId = requireEvent(req.params.id).id;
  const rows = Array.isArray(req.body?.students) ? req.body.students : [];
  const mode = req.body?.mode === 'merge' ? 'merge' : 'replace';

  const parsed = rows.map((r, i) => {
    try {
      return { name: parseName(r?.name), tickets: parseTickets(r?.tickets) };
    } catch (e) {
      throw httpError(`Row ${i + 1}: ${e.message}`);
    }
  });
  const seen = new Set();
  for (const r of parsed) {
    const key = r.name.toLowerCase();
    if (seen.has(key)) throw httpError(`"${r.name}" appears more than once.`);
    seen.add(key);
  }

  const d = getDb();
  d.transaction(() => {
    if (mode === 'replace') d.prepare(`DELETE FROM students WHERE event_id=?`).run(eventId);
    const upsert = d.prepare(
      `INSERT INTO students (event_id, name, tickets) VALUES (?, ?, ?)
       ON CONFLICT (event_id, name COLLATE NOCASE) DO UPDATE SET tickets=excluded.tickets, name=excluded.name`
    );
    for (const r of parsed) upsert.run(eventId, r.name, r.tickets);
  })();
  send(res, { saved: parsed.length, mode });
}));

app.post('/api/ops/events/:id/students', guard((req, res) => {
  const eventId = requireEvent(req.params.id).id;
  const name = parseName(req.body?.name);
  const tickets = parseTickets(req.body?.tickets);
  try {
    const r = getDb().prepare(`INSERT INTO students (event_id, name, tickets) VALUES (?, ?, ?)`).run(eventId, name, tickets);
    send(res, { id: Number(r.lastInsertRowid) }, 201);
  } catch (e) {
    if (isUnique(e)) throw httpError(`"${name}" is already in this event.`, 409);
    throw e;
  }
}));

function requireStudent(id) {
  const s = getDb().prepare(`SELECT id, event_id FROM students WHERE id=?`).get(Number(id));
  if (!s) throw httpError('Student not found.', 404);
  requireEvent(s.event_id);
  return s;
}

app.put('/api/ops/students/:id', guard((req, res) => {
  const s = requireStudent(req.params.id);
  const name = parseName(req.body?.name);
  const tickets = parseTickets(req.body?.tickets);
  try {
    getDb().prepare(`UPDATE students SET name=?, tickets=? WHERE id=?`).run(name, tickets, s.id);
  } catch (e) {
    if (isUnique(e)) throw httpError(`"${name}" is already in this event.`, 409);
    throw e;
  }
  send(res, { updated: true });
}));

app.delete('/api/ops/students/:id', guard((req, res) => {
  const s = requireStudent(req.params.id);
  getDb().prepare(`DELETE FROM students WHERE id=?`).run(s.id);
  send(res, { deleted: true });
}));

// ─── winners ─────────────────────────────────────────────────────────────────

/**
 * Record the outcome: the full list of winners replaces whatever was recorded
 * before. Each student can win at most once per event — enforced by there
 * being a single `winner` column per student row.
 */
app.put('/api/ops/events/:id/winners', guard((req, res) => {
  const eventId = requireEvent(req.params.id).id;
  const winners = Array.isArray(req.body?.winners) ? req.body.winners : [];
  const d = getDb();
  const ids = new Set(d.prepare(`SELECT id FROM students WHERE event_id=?`).all(eventId).map((r) => r.id));

  const seen = new Set();
  let order = 0;
  const parsed = winners.map((w) => {
    const studentId = Number(w?.studentId);
    if (!ids.has(studentId)) throw httpError('A winner is not a student in this event.');
    if (seen.has(studentId)) throw httpError('A student can only be selected once per event.');
    seen.add(studentId);
    if (w?.kind !== 'top' && w?.kind !== 'random') throw httpError('Winner kind must be "top" or "random".');
    return { studentId, kind: w.kind, pickOrder: w.kind === 'random' ? ++order : null };
  });

  d.transaction(() => {
    d.prepare(`UPDATE students SET winner=NULL, pick_order=NULL WHERE event_id=?`).run(eventId);
    const set = d.prepare(`UPDATE students SET winner=?, pick_order=? WHERE id=?`);
    for (const w of parsed) set.run(w.kind, w.pickOrder, w.studentId);
  })();
  send(res, { recorded: parsed.length });
}));

// ─── start ───────────────────────────────────────────────────────────────────

app.listen(PORT, '127.0.0.1', () => {
  console.log(`FairShake admin server → http://127.0.0.1:${PORT}`);
  console.log(`DB: ${DB_PATH}`);
}).on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} already in use. Kill the other process or set FAIRSHAKE_ADMIN_PORT.`);
  } else {
    throw e;
  }
});
