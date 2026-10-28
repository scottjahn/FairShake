// In-app page addresses. In dev the app uses real paths (/event/3, /admin) so
// the admin panel lives at http://localhost:5173/admin. The built file is
// opened straight from disk, where only the #fragment can change, so it
// routes on the hash instead: FairShake.html#/event/3.

const HASH = !import.meta.env.DEV;

/** The in-app path being shown, e.g. "/event/3". */
export const currentPath = (): string =>
  HASH ? window.location.hash.replace(/^#/, "") || "/" : window.location.pathname;

/** An href for an in-app path. */
export const pathHref = (path: string): string => (HASH ? `#${path}` : path);

/** Go to an in-app path, adding a browser history entry. */
export function navigate(path: string) {
  if (HASH) window.location.hash = path;
  else window.history.pushState(null, "", path);
}
