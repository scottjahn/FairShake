import { MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { stripBase, withBase } from "./basePath";
import { fetchEvents } from "./dataSource";
import { byTickets, DrawResult, runDraw, splitTop } from "./draw";
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
            {e.students.length} students · {totalTickets(e.students)} tickets · {e.topCount} top + {e.drawCount} drawn
          </p>
        </Link>
      ))}
    </section>
  );
}

// ─── event page ──────────────────────────────────────────────────────────────

/** How long each random winner takes to be revealed after pressing Draw. */
const REVEAL_MS = 900;

function EventPage({ event }: { event: PublicEvent }) {
  const { topCount, drawCount } = event;
  const split = useMemo(() => splitTop(event.students, topCount), [event, topCount]);
  const [draw, setDraw] = useState<DrawResult<Student> | null>(null);
  const [revealed, setRevealed] = useState(0);
  const timer = useRef<number>();

  useEffect(() => () => window.clearInterval(timer.current), []);

  const startDraw = () => {
    window.clearInterval(timer.current);
    const result = runDraw(event.students, topCount, drawCount);
    setDraw(result);
    setRevealed(0);
    if (result.random.length === 0) return;
    timer.current = window.setInterval(() => {
      setRevealed((r) => {
        if (r + 1 >= result.random.length) window.clearInterval(timer.current);
        return r + 1;
      });
    }, REVEAL_MS);
  };

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
      draw.random.slice(0, revealed).forEach((s, i) => badges.set(s, `Drawn #${i + 1}`));
    }
  }

  // Everyone not guaranteed a top spot is in the pool (tied students may be).
  const poolTickets = totalTickets([...split.rest, ...split.tied]);
  const sorted = [...event.students].sort(byTickets);
  const drawing = draw != null && revealed < draw.random.length;

  return (
    <>
      <section className="panel event-head">
        <div>
          <h1>{event.name}</h1>
          <p className="muted">
            {event.students.length} students · {totalTickets(event.students)} tickets ·
            top {topCount} win, then {drawCount} more drawn at random (weighted by tickets)
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
            <p className="muted small">{drawCount} more, weighted by tickets · top winners can't be picked again</p>
            {draw ? (
              <ol className="winner-list">
                {draw.random.slice(0, revealed).map((s, i) => (
                  <WinnerItem key={s.name} s={s} num={i + 1} fresh />
                ))}
                {drawing && <li className="winner-item pending"><span className="spinner" /> Drawing…</li>}
                {!drawing && draw.random.length < drawCount && (
                  <li className="muted small">Not enough eligible students for {drawCount} draws.</li>
                )}
              </ol>
            ) : (
              <p className="draw-empty">Press the button to draw {drawCount} winner{drawCount === 1 ? "" : "s"}.</p>
            )}
            <button className="draw-button" onClick={startDraw} disabled={drawing || drawCount === 0}>
              {draw ? "Draw again" : `Draw ${drawCount} winner${drawCount === 1 ? "" : "s"}`}
            </button>
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
