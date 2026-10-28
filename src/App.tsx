import { MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { stripBase, withBase } from "./basePath";
import { fetchEvents } from "./dataSource";
import Footer from "./Footer";
import { byTickets, pickWeighted, settleTop, splitTop } from "./draw";
import { PublicEvent, Student } from "./types";

// ─── routing ─────────────────────────────────────────────────────────────────
// Two public routes: "/" (event list) and "/event/:id". GitHub Pages serves
// 404.html (a copy of index.html) for deep links, so both boot the SPA.

const parseRoute = (): number | null => {
  const m = stripBase(window.location.pathname).match(/^\/event\/(\d+)\/?$/i);
  return m ? Number(m[1]) : null;
};

function useRoute(): [number | null, (path: string) => void] {
  const [eventId, setEventId] = useState(parseRoute);
  useEffect(() => {
    const onPop = () => setEventId(parseRoute());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const go = (path: string) => {
    window.history.pushState(null, "", withBase(path));
    setEventId(parseRoute());
    window.scrollTo(0, 0);
  };
  return [eventId, go];
}

function Link({ to, go, children, className }: {
  to: string; go: (p: string) => void; children: React.ReactNode; className?: string;
}) {
  const onClick = (e: MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    go(to);
  };
  return <a href={withBase(to)} onClick={onClick} className={className}>{children}</a>;
}

const fmtDate = (sqlite: string) =>
  new Date(sqlite.replace(" ", "T") + "Z").toLocaleDateString(undefined, {
    year: "numeric", month: "short", day: "numeric",
  });

const totalTickets = (students: Student[]) => students.reduce((n, s) => n + s.tickets, 0);

// ─── app ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [eventId, go] = useRoute();
  const [events, setEvents] = useState<PublicEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchEvents().then(setEvents).catch((e) => setError(String(e.message ?? e)));
  }, []);

  const event = eventId != null ? events?.find((e) => e.id === eventId) : undefined;

  return (
    <main className="app-shell">
      <header className="hero">
        <Link to="/" go={go} className="brand">
          <span className="brand-mark" aria-hidden>🎟️</span> FairShake
        </Link>
        <p className="tagline">Prize drawings where every ticket counts.</p>
      </header>

      {error && <section className="panel error">{error}</section>}
      {!events && !error && <section className="panel muted">Loading…</section>}

      {events && eventId == null && <EventList events={events} go={go} />}
      {events && eventId != null && (event
        ? <EventPage key={event.id} event={event} />
        : <section className="panel">That event doesn't exist. <Link to="/" go={go}>See all events</Link></section>)}
      <Footer />
    </main>
  );
}

function EventList({ events, go }: { events: PublicEvent[]; go: (p: string) => void }) {
  if (events.length === 0) {
    return <section className="panel muted">No events yet.</section>;
  }
  return (
    <section className="event-grid">
      {events.map((e) => (
        <Link key={e.id} to={`/event/${e.id}`} go={go} className="event-card">
          <span className={`status ${e.locked ? "status-final" : "status-open"}`}>
            {e.locked ? "Winners final" : "Draw open"}
          </span>
          <h2>{e.name}</h2>
          <p className="muted">
            {e.students.length} students · {totalTickets(e.students)} tickets · {e.topCount} top +{" "}
            {e.locked ? `${e.drawCount} drawn` : "random draw"}
          </p>
        </Link>
      ))}
    </section>
  );
}

// ─── event page ──────────────────────────────────────────────────────────────

/** How long each random winner takes to be revealed after pressing Draw. */
const REVEAL_MS = 900;

/** The draw so far, by name. The first press settles any top tie. */
interface DrawState {
  tieWinners: string[];
  picks: string[];
}

// Kept in the browser so a refresh mid-draw doesn't lose the winners.
const drawKey = (id: number) => `fairshake.draw.${id}`;

function loadDraw(id: number): DrawState | null {
  try {
    const raw = localStorage.getItem(drawKey(id));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveDraw(id: number, d: DrawState | null) {
  try {
    if (d) localStorage.setItem(drawKey(id), JSON.stringify(d));
    else localStorage.removeItem(drawKey(id));
  } catch { /* storage unavailable: the draw just won't survive a refresh */ }
}

function EventPage({ event }: { event: PublicEvent }) {
  const { topCount, drawCount } = event;
  const split = useMemo(() => splitTop(event.students, topCount), [event, topCount]);
  const [state, setState] = useState<DrawState | null>(() => (event.locked ? null : loadDraw(event.id)));
  const [drawing, setDrawing] = useState(false);
  const timer = useRef<number>();

  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => { if (!event.locked) saveDraw(event.id, state); }, [event, state]);

  const byName = useMemo(() => new Map(event.students.map((s) => [s.name, s])), [event]);
  const named = (names: string[]) => names.map((n) => byName.get(n)).filter((s): s is Student => !!s);
  const draw = state && { tieWinners: named(state.tieWinners), random: named(state.picks) };

  // Who can still be drawn: the pool left after the top spots, minus earlier picks.
  const remaining = (d: DrawState | null) => {
    const tieWinners = d ? named(d.tieWinners) : [];
    const base = [...split.rest, ...split.tied.filter((s) => !tieWinners.includes(s))];
    return base.filter((s) => s.tickets > 0 && !d?.picks.includes(s.name));
  };

  const drawNext = () => {
    const settled = state ?? {
      tieWinners: settleTop(event.students, topCount).tieWinners.map((s) => s.name),
      picks: [],
    };
    setState(settled);
    const [pick] = pickWeighted(remaining(settled), 1, (s) => s.tickets);
    if (!pick) return;
    setDrawing(true);
    timer.current = window.setTimeout(() => {
      setState({ ...settled, picks: [...settled.picks, pick.name] });
      setDrawing(false);
    }, REVEAL_MS);
  };

  const startOver = () => {
    if (!window.confirm("Clear all the winners drawn so far and start over?")) return;
    window.clearTimeout(timer.current);
    setDrawing(false);
    setState(null);
  };

  const poolLeft = remaining(state).length;

  // What to highlight: the recorded outcome once locked, otherwise this draw.
  const recordedTop = event.students.filter((s) => s.winner === "top").sort(byTickets);
  const recordedRandom = event.students.filter((s) => s.winner === "random")
    .sort((a, b) => (a.pickOrder ?? 0) - (b.pickOrder ?? 0));

  const badges = new Map<Student, string>();
  if (event.locked) {
    recordedTop.forEach((s) => badges.set(s, "Top"));
    recordedRandom.forEach((s, i) => badges.set(s, `Drawn #${i + 1}`));
  } else {
    split.sure.forEach((s) => badges.set(s, "Top"));
    split.tied.forEach((s) => badges.set(s, "Tied"));
    if (draw) {
      draw.tieWinners.forEach((s) => badges.set(s, "Top"));
      draw.random.forEach((s, i) => badges.set(s, `Drawn #${i + 1}`));
    }
  }

  // Everyone not guaranteed a top spot is in the pool (tied students may be).
  const poolTickets = totalTickets([...split.rest, ...split.tied]);
  const sorted = [...event.students].sort(byTickets);

  return (
    <>
      <section className="panel event-head">
        <div>
          <h1>{event.name}</h1>
          <p className="muted">
            {event.students.length} students · {totalTickets(event.students)} tickets ·
            top {topCount} win, then {event.locked ? drawCount : "more are"} drawn at random (weighted by tickets)
          </p>
        </div>
        {event.locked && (
          <span className="status status-final">
            Winners final{event.lockedAt ? ` · ${fmtDate(event.lockedAt)}` : ""}
          </span>
        )}
      </section>

      {event.locked ? (
        <section className="winners-row">
          <WinnerColumn title={`Top ${topCount}`} subtitle="Most tickets" students={recordedTop} />
          <WinnerColumn title="Random draw" subtitle="Weighted by tickets" students={recordedRandom} numbered />
        </section>
      ) : (
        <section className="winners-row">
          <div className="panel winner-col">
            <h2>Top {topCount}</h2>
            <p className="muted small">Most tickets — guaranteed winners</p>
            <ol className="winner-list">
              {split.sure.map((s) => <WinnerItem key={s.name} s={s} />)}
              {draw?.tieWinners.map((s) => <WinnerItem key={s.name} s={s} note="won tie-break" fresh />)}
            </ol>
            {split.tied.length > 0 && (
              <p className="tie-note">
                {split.tied.map((s) => s.name).join(", ")} are tied with {split.tied[0].tickets} tickets
                for the last {split.tiedSlots === 1 ? "spot" : `${split.tiedSlots} spots`}.
                {draw ? " Decided by the draw — everyone else in the tie joined the random pool."
                      : " The draw button settles it with an even coin-flip among them."}
              </p>
            )}
          </div>

          <div className="panel winner-col draw-col">
            <h2>Random draw</h2>
            <p className="muted small">One winner per press, weighted by tickets · nobody can be picked twice</p>
            {draw && (draw.random.length > 0 || drawing) ? (
              <ol className="winner-list">
                {draw.random.map((s, i) => (
                  <WinnerItem key={s.name} s={s} num={i + 1} fresh={i === draw.random.length - 1} />
                ))}
                {drawing && <li className="winner-item pending"><span className="spinner" /> Drawing…</li>}
              </ol>
            ) : (
              <p className="draw-empty">Press the button to draw the first winner.</p>
            )}
            {!drawing && poolLeft === 0 && <p className="muted small">Everyone eligible has been drawn.</p>}
            <button className="draw-button" onClick={drawNext} disabled={drawing || poolLeft === 0}>
              {draw?.random.length ? "Draw next winner" : "Draw a winner"}
            </button>
            {draw && !drawing && (
              <button className="link small" onClick={startOver}>Start over</button>
            )}
          </div>
        </section>
      )}

      <section className="panel">
        <h2>All students</h2>
        <table className="roster public">
          <thead>
            <tr>
              <th className="num">#</th>
              <th>Name</th>
              <th className="num">Tickets</th>
              <th className="num" title="Share of the random pool's tickets (the chance of being the first pick)">
                {!event.locked && "Pool share"}
              </th>
              <th />
            </tr>
          </thead>
          <tbody>
            {sorted.map((s, i) => {
              const badge = badges.get(s);
              const inPool = !split.sure.includes(s) && s.tickets > 0 && !event.locked;
              return (
                <tr key={s.name} className={badge && badge !== "Tied" ? "is-winner" : undefined}>
                  <td className="num muted">{i + 1}</td>
                  <td>{s.name}</td>
                  <td className="num">{s.tickets}</td>
                  <td className="num muted">
                    {inPool && poolTickets > 0 ? `${((100 * s.tickets) / poolTickets).toFixed(1)}%` : ""}
                  </td>
                  <td>{badge && <span className={`badge badge-${badge.split(" ")[0].toLowerCase()}`}>{badge}</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </>
  );
}

function WinnerColumn({ title, subtitle, students, numbered }: {
  title: string; subtitle: string; students: Student[]; numbered?: boolean;
}) {
  return (
    <div className="panel winner-col">
      <h2>{title}</h2>
      <p className="muted small">{subtitle}</p>
      {students.length === 0
        ? <p className="muted">None recorded.</p>
        : <ol className="winner-list">
            {students.map((s, i) => <WinnerItem key={s.name} s={s} num={numbered ? i + 1 : undefined} />)}
          </ol>}
    </div>
  );
}

function WinnerItem({ s, num, note, fresh }: { s: Student; num?: number; note?: string; fresh?: boolean }) {
  return (
    <li className={`winner-item${fresh ? " fresh" : ""}`}>
      {num != null && <span className="pick-num">{num}</span>}
      <span className="winner-name">{s.name}</span>
      <span className="winner-tickets">{s.tickets} 🎟️{note ? ` · ${note}` : ""}</span>
    </li>
  );
}
