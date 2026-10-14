// Where the public pages read events from:
//  - dev:  the local admin server (Vite proxies /api → http://localhost:8789).
//  - prod: the static snapshot exported to /data/events.json (npm run export),
//          served under the deploy base (see basePath.ts).
import { withBase } from "./basePath";
import { PublicEvent } from "./types";

const DEV = import.meta.env.DEV;

const eventsUrl = DEV ? "/api/public/events" : withBase("/data/events.json");

/**
 * GitHub Pages serves everything with `cache-control: max-age=600`. A new
 * export rewrites events.json in place, so "no-cache" makes the browser
 * revalidate (a cheap 304 when unchanged) instead of showing stale winners.
 */
export async function fetchEvents(): Promise<PublicEvent[]> {
  const res = await fetch(eventsUrl, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Could not load events (${res.status})`);
  return res.json();
}
