// Where the public pages read events from:
//  - dev:   the local admin server (Vite proxies /api → http://localhost:8789).
//  - build: the snapshot baked into FairShake.html by tools/single-file.mjs,
//           so the file works offline, opened straight from disk.
import { PublicEvent } from "./types";

declare global {
  interface Window {
    __FAIRSHAKE_EVENTS__?: PublicEvent[];
  }
}

export async function fetchEvents(): Promise<PublicEvent[]> {
  if (!import.meta.env.DEV) return window.__FAIRSHAKE_EVENTS__ ?? [];
  const res = await fetch("/api/public/events");
  if (!res.ok) throw new Error(`Could not load events (${res.status})`);
  return res.json();
}
