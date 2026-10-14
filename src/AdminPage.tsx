import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { withBase } from "./basePath";
import { byTickets, DrawResult, runDraw, splitTop } from "./draw";
import { parseRoster } from "./parseRoster";
import { AdminEvent, AdminEventSummary, AdminStudent, WinnerKind } from "./types";

// The admin API is the local-only server in tools/admin-server.mjs, reached
// through the Vite dev proxy. Same origin, no auth — it binds to 127.0.0.1.
const api = async <T,>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`/api${path}`, {
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    ...init,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.message ?? `Request failed (${response.status})`);
  return body as T;
};

const send = <T,>(method: string, path: string, body?: unknown) =>
  api<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });

type Banner = { text: string; isError: boolean } | null;

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

// The selected event lives in ?event=<id> so a refresh keeps your place.
const readSelected = () => {
  const v = new URLSearchParams(window.location.search).get("event");
  return v ? Number(v) : null;
};
const writeSelected = (id: number | null) => {
  const url = new URL(window.location.href);
  if (id == null) url.searchParams.delete("event");
  else url.searchParams.set("event", String(id));
  window.history.replaceState(null, "", url);
};

export default function AdminPage() {
  const [events, setEvents] = useState<AdminEventSummary[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(readSelected);
  const [banner, setBanner] = useState<Banner>(null);
  const [newName, setNewName] = useState("");
  const [newTop, setNewTop] = useState("3");
  const [newDraw, setNewDraw] = useState("3");

  const loadEvents = useCallback(() => api<AdminEventSummary[]>("/ops/events").then(setEvents), []);
  useEffect(() => { loadEvents().catch((e) => setBanner({ text: errText(e), isError: true })); }, [loadEvents]);

  const select = (id: number | null) => {
    setSelectedId(id);
    writeSelected(id);
  };

  const createEvent = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const { id } = await send<{ id: number }>("POST", "/ops/events", { name: newName, topCount: Number(newTop), drawCount: Number(newDraw) });
      setNewName("");
      await loadEvents();
      select(id);
    } catch (err) {
      setBanner({ text: errText(err), isError: true });
    }
  };

  const exportSite = async () => {
    try {
      const r = await send<{ path: string; events: number; locked: number }>("POST", "/ops/export");
      setBanner({
        text: `Exported ${r.events} event(s) (${r.locked} locked) to ${r.path}. Commit and push it to publish.`,
        isError: false,
      });
    } catch (err) {
      setBanner({ text: errText(err), isError: true });
    }
  };

  return (
    <main className="app-shell admin">
      <header className="hero hero-admin">
        <div>
          <a href={withBase("/")} className="brand"><span className="brand-mark" aria-hidden>🎟️</span> FairShake</a>
          <p className="tagline">Admin · local only</p>
        </div>
        <button className="secondary" onClick={exportSite} title="Same as npm run export">
          Export for publishing
        </button>
      </header>

      {banner && (
        <div className={`banner ${banner.isError ? "banner-error" : "banner-ok"}`}>
          {banner.text} <button className="link" onClick={() => setBanner(null)}>Dismiss</button>
        </div>
      )}

      <div className="admin-layout">
        <aside className="panel admin-events">
          <h2>Events</h2>
          <ul className="event-nav">
            {events.map((e) => (
              <li key={e.id}>
                <button className={e.id === selectedId ? "active" : ""} onClick={() => select(e.id)}>
                  <span>{e.locked ? "🔒 " : ""}{e.name}</span>
                  <span className="muted small">
                    {e.studentCount} students · {e.winnerCount}/{e.topCount + e.drawCount} winners
                  </span>
                </button>
              </li>
            ))}
            {events.length === 0 && <li className="muted">No events yet.</li>}
          </ul>
          <form className="stack" onSubmit={createEvent}>
            <h3>New event</h3>
            <label>Name<input value={newName} onChange={(e) => setNewName(e.target.value)} required /></label>
            <div className="pair">
              <label>Top winners
                <input type="number" min={0} value={newTop} onChange={(e) => setNewTop(e.target.value)} required />
              </label>
              <label>Random draw
                <input type="number" min={0} value={newDraw} onChange={(e) => setNewDraw(e.target.value)} required />
              </label>
            </div>
            <button type="submit">Create event</button>
          </form>
        </aside>

        {selectedId != null
          ? <EventEditor key={selectedId} id={selectedId} onChanged={loadEvents} onDeleted={() => { select(null); loadEvents(); }} />
          : <section className="panel muted">Select or create an event.</section>}
      </div>
    </main>
  );
}

// ─── one event ───────────────────────────────────────────────────────────────

function EventEditor({ id, onChanged, onDeleted }: { id: number; onChanged: () => void; onDeleted: () => void }) {
  const [event, setEvent] = useState<AdminEvent | null>(null);
  const [banner, setBanner] = useState<Banner>(null);

  const reload = useCallback(async () => {
    setEvent(await api<AdminEvent>(`/ops/events/${id}`));
    onChanged();
  }, [id, onChanged]);

  useEffect(() => {
    api<AdminEvent>(`/ops/events/${id}`).then(setEvent).catch((e) => setBanner({ text: errText(e), isError: true }));
  }, [id]);

  /** Run a mutation, then reload; report errors (or `ok`) in the banner. */
  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn();
      await reload();
      setBanner(ok ? { text: ok, isError: false } : null);
      return true;
    } catch (e) {
      setBanner({ text: errText(e), isError: true });
      return false;
    }
  };

  if (!event) {
    return <section className="panel">{banner ? <span className="error">{banner.text}</span> : "Loading…"}</section>;
  }

  const recorded = event.students.filter((s) => s.winner);
  const toggleLock = () => {
    if (!event.locked && recorded.length === 0 && !confirm("No winners are recorded yet. Lock anyway?")) return;
    act(() => send("POST", `/ops/events/${id}/lock`, { locked: !event.locked }),
      event.locked ? "Unlocked — the event can be edited again." : "Locked. Run an export to publish the winners.");
  };

  return (
    <div className="stack-lg">
      <section className="panel event-head">
        <div>
          <h1>{event.locked ? "🔒 " : ""}{event.name}</h1>
          <p className="muted">
            {event.students.length} students · top {event.topCount} + {event.drawCount} drawn ·{" "}
            <a href={`/event/${event.id}`} target="_blank" rel="noreferrer">public page ↗</a>
          </p>
        </div>
        <button className={event.locked ? "secondary" : "lock-button"} onClick={toggleLock}>
          {event.locked ? "Unlock" : "Lock event"}
        </button>
      </section>

      {banner && (
        <div className={`banner ${banner.isError ? "banner-error" : "banner-ok"}`}>
          {banner.text} <button className="link" onClick={() => setBanner(null)}>Dismiss</button>
        </div>
      )}

      {event.locked && (
        <p className="locked-note">This event is locked: its roster and winners are final. Unlock it to make changes.</p>
      )}

      <WinnersPanel event={event} act={act} />
      {!event.locked && <SettingsPanel event={event} act={act} onDeleted={onDeleted} />}
      {!event.locked && <UploadPanel event={event} act={act} />}
      <StudentsPanel event={event} act={act} />
    </div>
  );
}

type Act = (fn: () => Promise<unknown>, ok?: string) => Promise<boolean>;

function SettingsPanel({ event, act, onDeleted }: { event: AdminEvent; act: Act; onDeleted: () => void }) {
  const [name, setName] = useState(event.name);
  const [top, setTop] = useState(String(event.topCount));
  const [drawn, setDrawn] = useState(String(event.drawCount));
  const dirty = name !== event.name || top !== String(event.topCount) || drawn !== String(event.drawCount);

  const save = (e: FormEvent) => {
    e.preventDefault();
    act(() => send("PUT", `/ops/events/${event.id}`, { name, topCount: Number(top), drawCount: Number(drawn) }), "Saved.");
  };
  const remove = async () => {
    if (!confirm(`Delete "${event.name}" and all ${event.students.length} students? This can't be undone.`)) return;
    try {
      await send("DELETE", `/ops/events/${event.id}`);
      onDeleted();
    } catch (e) {
      alert(errText(e));
    }
  };

  return (
    <section className="panel">
      <h2>Event settings</h2>
      <form className="row-form" onSubmit={save}>
        <label className="grow">Name<input value={name} onChange={(e) => setName(e.target.value)} required /></label>
        <label>Top winners
          <input type="number" min={0} value={top} onChange={(e) => setTop(e.target.value)} required />
        </label>
        <label>Random draw
          <input type="number" min={0} value={drawn} onChange={(e) => setDrawn(e.target.value)} required />
        </label>
        <button type="submit" disabled={!dirty}>Save</button>
        <button type="button" className="danger" onClick={remove}>Delete event</button>
      </form>
    </section>
  );
}

function UploadPanel({ event, act }: { event: AdminEvent; act: Act }) {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"replace" | "merge">(event.students.length ? "merge" : "replace");
  const parsed = useMemo(() => parseRoster(text), [text]);

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setText(await file.text());
    e.target.value = "";
  };

  const upload = async () => {
    if (mode === "replace" && event.students.length > 0 &&
        !confirm(`Replace all ${event.students.length} current students (and any recorded winners)?`)) return;
    const ok = await act(
      () => send("PUT", `/ops/events/${event.id}/students`, { mode, students: parsed.rows }),
      `${mode === "replace" ? "Replaced roster with" : "Merged"} ${parsed.rows.length} students.`,
    );
    if (ok) setText("");
  };

  return (
    <section className="panel">
      <h2>Upload students</h2>
      <p className="muted small">
        One student per line: <code>name, tickets</code>. Paste from a spreadsheet (two columns) or choose a CSV file.
        A header row is ignored.
      </p>
      <textarea rows={6} value={text} onChange={(e) => setText(e.target.value)}
        placeholder={"Ava Smith, 12\nBen Jones, 7"} />
      <div className="row-form">
        <label className="file-button">Choose CSV…<input type="file" accept=".csv,.tsv,.txt,text/*" onChange={onFile} /></label>
        <label className="radio"><input type="radio" checked={mode === "merge"} onChange={() => setMode("merge")} />
          Merge (update tickets, add new names)</label>
        <label className="radio"><input type="radio" checked={mode === "replace"} onChange={() => setMode("replace")} />
          Replace roster</label>
        <span className="grow" />
        <button onClick={upload} disabled={parsed.rows.length === 0 || parsed.errors.length > 0}>
          Upload {parsed.rows.length || ""} student{parsed.rows.length === 1 ? "" : "s"}
        </button>
      </div>
      {parsed.errors.length > 0 && (
        <ul className="error small">{parsed.errors.slice(0, 8).map((e) => <li key={e}>{e}</li>)}</ul>
      )}
    </section>
  );
}

function WinnersPanel({ event, act }: { event: AdminEvent; act: Act }) {
  const { topCount, drawCount } = event;
  const [draw, setDraw] = useState<DrawResult<AdminStudent> | null>(null);
  const split = useMemo(() => splitTop(event.students, topCount), [event, topCount]);

  const top = event.students.filter((s) => s.winner === "top").sort(byTickets);
  const random = event.students.filter((s) => s.winner === "random").sort((a, b) => (a.pickOrder ?? 0) - (b.pickOrder ?? 0));

  const recordDraw = async () => {
    if (!draw) return;
    const winners = [
      ...draw.top.map((s) => ({ studentId: s.id, kind: "top" })),
      ...draw.random.map((s) => ({ studentId: s.id, kind: "random" })),
    ];
    if (await act(() => send("PUT", `/ops/events/${event.id}/winners`, { winners }), "Winners recorded.")) setDraw(null);
  };

  // Top N is deterministic unless there's a tie at the cutoff, so it can be
  // recorded on its own before the live draw happens.
  const recordTopOnly = () => {
    const winners = [
      ...split.sure.map((s) => ({ studentId: s.id, kind: "top" })),
      ...random.map((s) => ({ studentId: s.id, kind: "random" })),
    ];
    act(() => send("PUT", `/ops/events/${event.id}/winners`, { winners }), `Recorded the top ${split.sure.length}.`);
  };

  const mismatch = (top.length || random.length) && (top.length !== Math.min(topCount, event.students.filter((s) => s.tickets > 0).length) || random.length !== drawCount);

  return (
    <section className="panel">
      <h2>Winners</h2>
      <div className="winners-row">
        <div>
          <h3>Top {topCount} <span className="muted small">recorded</span></h3>
          {top.length ? <ol>{top.map((s) => <li key={s.id}>{s.name} <span className="muted">({s.tickets})</span></li>)}</ol>
            : <p className="muted">None recorded.</p>}
        </div>
        <div>
          <h3>Random draw <span className="muted small">recorded</span></h3>
          {random.length ? <ol>{random.map((s) => <li key={s.id}>{s.name} <span className="muted">({s.tickets})</span></li>)}</ol>
            : <p className="muted">None recorded.</p>}
        </div>
      </div>
      {mismatch ? <p className="warn small">Heads up: expected {topCount} top and {drawCount} random winners.</p> : null}

      {!event.locked && (
        <>
          <p className="muted small">
            Record the winners from the live draw using the Winner column in the student list below, or run a draw here.
            {split.tied.length > 0 && ` ${split.tied.map((s) => s.name).join(", ")} are tied for the last ${split.tiedSlots} top spot(s).`}
          </p>
          <div className="row-form">
            <button className="secondary" onClick={() => setDraw(runDraw(event.students, topCount, drawCount))}>
              {draw ? "Draw again" : "Run a draw here"}
            </button>
            {split.tied.length === 0 && split.sure.length > 0 && top.length === 0 && (
              <button className="secondary" onClick={recordTopOnly}>Record top {split.sure.length}</button>
            )}
          </div>
          {draw && (
            <div className="draft">
              <div className="winners-row">
                <div><h3>Top</h3><ol>{draw.top.map((s) => <li key={s.id}>{s.name} ({s.tickets}){draw.tieWinners.includes(s) ? " — won tie-break" : ""}</li>)}</ol></div>
                <div><h3>Drawn</h3><ol>{draw.random.map((s) => <li key={s.id}>{s.name} ({s.tickets})</li>)}</ol></div>
              </div>
              <button onClick={recordDraw}>Record these winners</button>{" "}
              <button className="link" onClick={() => setDraw(null)}>Discard</button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function StudentsPanel({ event, act }: { event: AdminEvent; act: Act }) {
  const [newName, setNewName] = useState("");
  const [newTickets, setNewTickets] = useState("");
  const sorted = [...event.students].sort(byTickets);
  const locked = event.locked;

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (await act(() => send("POST", `/ops/events/${event.id}/students`, { name: newName, tickets: Number(newTickets) }))) {
      setNewName("");
      setNewTickets("");
    }
  };

  // Changing one student's winner status re-sends the whole winner list,
  // keeping existing random winners in their drawn order and appending new ones.
  const setWinner = (student: AdminStudent, kind: WinnerKind | "") => {
    const current = event.students.filter((s) => s.winner && s.id !== student.id);
    const ordered = [
      ...current.filter((s) => s.winner === "top"),
      ...current.filter((s) => s.winner === "random").sort((a, b) => (a.pickOrder ?? 0) - (b.pickOrder ?? 0)),
    ].map((s) => ({ studentId: s.id, kind: s.winner }));
    if (kind) ordered.push({ studentId: student.id, kind });
    act(() => send("PUT", `/ops/events/${event.id}/winners`, { winners: ordered }));
  };

  return (
    <section className="panel">
      <h2>Students <span className="muted small">{event.students.length}</span></h2>
      <table className="roster">
        <thead>
          <tr><th>Name</th><th className="num">Tickets</th><th>Winner</th>{!locked && <th />}</tr>
        </thead>
        <tbody>
          {sorted.map((s) => (
            <StudentRow key={s.id} s={s} locked={locked} act={act} onWinner={setWinner} />
          ))}
        </tbody>
      </table>
      {!locked && (
        <form className="row-form" onSubmit={add}>
          <label className="grow">Name<input value={newName} onChange={(e) => setNewName(e.target.value)} required /></label>
          <label>Tickets<input type="number" min={0} value={newTickets} onChange={(e) => setNewTickets(e.target.value)} required /></label>
          <button type="submit">Add student</button>
        </form>
      )}
    </section>
  );
}

function StudentRow({ s, locked, act, onWinner }: {
  s: AdminStudent; locked: boolean; act: Act; onWinner: (s: AdminStudent, kind: WinnerKind | "") => void;
}) {
  const [name, setName] = useState(s.name);
  const [tickets, setTickets] = useState(String(s.tickets));
  useEffect(() => { setName(s.name); setTickets(String(s.tickets)); }, [s.name, s.tickets]);

  const commit = () => {
    if (name === s.name && tickets === String(s.tickets)) return;
    act(() => send("PUT", `/ops/students/${s.id}`, { name, tickets: Number(tickets) }))
      .then((ok) => { if (!ok) { setName(s.name); setTickets(String(s.tickets)); } });
  };
  const onKey = (e: React.KeyboardEvent) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); };
  const winnerLabel = s.winner === "top" ? "Top" : s.winner === "random" ? `Drawn #${s.pickOrder}` : "";

  if (locked) {
    return (
      <tr className={s.winner ? "is-winner" : undefined}>
        <td>{s.name}</td><td className="num">{s.tickets}</td>
        <td>{winnerLabel && <span className={`badge badge-${s.winner === "top" ? "top" : "drawn"}`}>{winnerLabel}</span>}</td>
      </tr>
    );
  }
  return (
    <tr className={s.winner ? "is-winner" : undefined}>
      <td><input className="cell" value={name} onChange={(e) => setName(e.target.value)} onBlur={commit} onKeyDown={onKey} /></td>
      <td className="num">
        <input className="cell num" type="number" min={0} value={tickets}
          onChange={(e) => setTickets(e.target.value)} onBlur={commit} onKeyDown={onKey} />
      </td>
      <td>
        <select value={s.winner ?? ""} onChange={(e) => onWinner(s, e.target.value as WinnerKind | "")}>
          <option value="">—</option>
          <option value="top">Top</option>
          <option value="random">{s.winner === "random" ? winnerLabel : "Drawn"}</option>
        </select>
      </td>
      <td>
        <button className="link danger" onClick={() => {
          if (confirm(`Remove ${s.name}?`)) act(() => send("DELETE", `/ops/students/${s.id}`));
        }}>Remove</button>
      </td>
    </tr>
  );
}
