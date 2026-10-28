# FairShake

Prize drawings for students: a local admin tool for setting up events and recording winners,
and a public site, published statically to GitHub Pages, where anyone can see the tickets and
run the draw.

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
[`src/draw.ts`](src/draw.ts), shared by the public page and the admin panel.

## Architecture

| Layer | What it is |
|---|---|
| **Database** | SQLite file (`data/fairshake.db`) — lives on your machine, not in the repo |
| **Admin tool** | Local Express server (`tools/admin-server.mjs`) on `127.0.0.1:8789` — never deployed |
| **Public site** | Fully static — built from the snapshot in `public/data/events.json` |
| **Hosting** | GitHub Pages at <https://scottjahn.github.io/FairShake/>, deployed by GitHub Actions |

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
2. **Publish the roster** — export and push (below) so the public page shows the event.
3. **Hold the draw** — open the event's public page and press **Draw a winner**, then **Draw next
   winner** as many times as you have prizes. The picks are kept in that browser if the page is
   refreshed; **Start over** clears them. The page records nothing on the server.
4. **Record the winners** — back in admin, set **Random draw** to the number drawn, mark each winner as *Top* or *Drawn* in the student
   list (or use **Run a draw here → Record these winners**), then **Lock event**. A locked event
   can't be edited until unlocked, and its public page shows the recorded winners instead of the
   draw button.
5. **Publish** — export and push:

   ```bash
   npm run export
   git add public/data/
   git commit -m "Winners for <event>"
   git push
   ```

   The admin page's **Export for publishing** button does the same as `npm run export`.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server (`:5173`) + local admin API (`:8789`) together |
| `npm run seed` | Seed demo data (skips if any event already exists) |
| `npm run export` | Dump SQLite → `public/data/events.json` for the static build |
| `npm run build` | Type-check + production build (also copies `index.html` → `404.html` for deep links) |
| `npm run preview` | Serve the production build locally |

## GitHub Pages setup

In the repo's **Settings → Pages**, set **Source** to **GitHub Actions**. Every push to `main`
then builds and deploys via [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).
