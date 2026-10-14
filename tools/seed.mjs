// Demo data so the site has something to show. Skips if any event exists.
//
//   npm run seed

import { getDb } from './db.mjs';

const d = getDb();
if (d.prepare(`SELECT COUNT(*) AS n FROM events`).get().n > 0) {
  console.log('Events already exist — nothing seeded.');
  process.exit(0);
}

const names = [
  'Ava', 'Ben', 'Chloe', 'Diego', 'Emma', 'Finn', 'Grace', 'Hiro', 'Isla', 'Jack',
  'Kai', 'Lena', 'Maya', 'Noah', 'Olive', 'Priya', 'Quinn', 'Ruby', 'Sam', 'Theo',
];

const addEvent = d.prepare(`INSERT INTO events (name, top_count, draw_count) VALUES (?, ?, ?)`);
const addStudent = d.prepare(`INSERT INTO students (event_id, name, tickets) VALUES (?, ?, ?)`);

d.transaction(() => {
  for (const [name, top, drawn] of [['Fall Reading Challenge', 3, 5], ['Math Facts Marathon', 2, 2]]) {
    const id = addEvent.run(name, top, drawn).lastInsertRowid;
    for (const s of names) addStudent.run(id, s, Math.floor(Math.random() * 15) + 1);
  }
})();

console.log('Seeded 2 events with 20 students each.');
