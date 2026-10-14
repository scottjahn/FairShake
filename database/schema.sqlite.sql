-- FairShake schema. Idempotent: run on every start by tools/db.mjs.

CREATE TABLE IF NOT EXISTS events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  -- How many top ticket holders win outright.
  top_count   INTEGER NOT NULL DEFAULT 3 CHECK (top_count >= 0),
  -- How many more are then drawn at random, weighted by tickets.
  draw_count  INTEGER NOT NULL DEFAULT 3 CHECK (draw_count >= 0),
  locked      INTEGER NOT NULL DEFAULT 0,
  locked_at   TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS students (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id   INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name       TEXT    NOT NULL,
  tickets    INTEGER NOT NULL CHECK (tickets >= 0),
  -- The recorded outcome: 'top' (most tickets) or 'random' (weighted draw).
  winner     TEXT    CHECK (winner IN ('top', 'random')),
  -- Order the random winners were drawn in (1-based); null for top winners.
  pick_order INTEGER
);

-- A student appears once per event, case-insensitively.
CREATE UNIQUE INDEX IF NOT EXISTS students_event_name
  ON students (event_id, name COLLATE NOCASE);
