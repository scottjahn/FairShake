// The site is served from "/" in dev and from "/FairShake/" on GitHub
// Pages (see vite.config.ts). Vite exposes that prefix as import.meta.env.BASE_URL,
// so every in-app URL is built with withBase() and every URL read back off
// window.location is normalised with stripBase().

// "" in dev, "/FairShake" in the Pages build — no trailing slash either way.
const BASE = import.meta.env.BASE_URL.replace(/\/+$/, "");

/** Prefix an app-absolute path ("/event/3") with the deploy base. */
export const withBase = (path: string): string => `${BASE}${path}`;

/** Strip the deploy base off a window.location.pathname, yielding "/event/3". */
export const stripBase = (pathname: string): string => {
  if (BASE && pathname.toLowerCase().startsWith(BASE.toLowerCase())) {
    return pathname.slice(BASE.length) || "/";
  }
  return pathname;
};
