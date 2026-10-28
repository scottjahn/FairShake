# FairShake

Prize drawings for students: a local admin tool for setting up events and recording winners,
and a single offline page, `FairShake.html`, that shows the tickets and runs the draw. The page
is one self-contained file: copy it to any computer and open it in a browser, with no
internet, no install and nothing published online.

## How winners are chosen

Each event has a list of students, a ticket count for each, and two numbers: how many **top**
winners and how many **random draw** winners (e.g. top 3, then 5 drawn). On the public page the
random draw is open-ended: each press of the button draws one more winner, for as long as you
keep pressing. Enter the final random-draw count in admin afterwards, when you record the winners.

1. **Top** — the students with the most tickets win outright.
2. **Random draw** — more are drawn at random, one per press, weighted by tickets (10 tickets =
   10× the chance of 1 ticket). Each pick is removed from the pool before the next one.
3. **Once per event** — top winners are not in the random pool, and nobody can be drawn twice.

Edge cases:

- **Tie at the top cutoff** — if more students share the last top spot(s) than there are
  spots, the draw button settles it with an even draw among them first. Whoever misses out
  joins the weighted random pool like everyone else.
- **0 tickets** — never wins anything.
- **Not enough students** — the draw picks as many as are eligible.

Randomness comes from the browser's `crypto.getRandomValues`. The rules live in
[`src/draw.ts`](src/draw.ts), shared by the draw page and the admin panel.

## Architecture

| Layer | What it is |
|---|---|
| **Database** | SQLite file (`data/fairshake.db`) — lives on your machine, not in the repo |
| **Admin tool** | Local Express server (`tools/admin-server.mjs`) on `127.0.0.1:8789` — never deployed |
| **Draw page** | `dist/FairShake.html` — one offline file with the script, styles and a snapshot of the events (`data/events.json`) baked in |

## Quick start

```bash
npm install
npm run seed     # optional: two demo events so the site has something to show
npm run dev      # http://localhost:5173 (public) and http://localhost:5173/admin
```

## Everyday workflow

1. **Set up the event** — in `/admin`, create the event (name, top winners, random draw winners), then upload students.
   Paste `name, tickets` lines or two columns copied from a spreadsheet, or choose a CSV.
   *Merge* updates tickets for names already there and adds new ones; *Replace* swaps the
   whole roster.
2. **Build the draw page** — press **Build offline file** in admin (or run `npm run build`), then
   copy `dist/FairShake.html` to the computer that will run the draw.
3. **Hold the draw** — open `FairShake.html`, pick the event and press **Draw a winner**, then **Draw next
   winner** as many times as you have prizes. The picks are kept in that browser if the page is
   refreshed; **Start over** clears them. Nothing is saved anywhere else.
4. **Record the winners** — back in admin, set **Random draw** to the number drawn, mark each winner as *Top* or *Drawn* in the student
   list (or use **Run a draw here → Record these winners**), then **Lock event**. A locked event
   can't be edited until unlocked, and its page shows the recorded winners instead of the draw
   button.
5. **Share the results** (optional) — build the file again; it now shows the final winners.

The event data never goes into git: `data/` (the database and its export) is ignored.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server (`:5173`) + local admin API (`:8789`) together |
| `npm run seed` | Seed demo data (skips if any event already exists) |
| `npm run export` | Dump SQLite → `data/events.json` |
| `npm run build` | Export, type-check and build → `dist/FairShake.html` (the admin **Build offline file** button runs this) |
