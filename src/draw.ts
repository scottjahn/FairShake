// The selection rules, shared by the public draw button and the admin panel.
//
//  1. The top `topCount` ticket holders win outright.
//  2. `drawCount` more are drawn at random from everyone else, weighted by tickets.
//  3. Nobody can be picked twice: top winners are not in the random pool.
//
// If several students are tied for the last top spot(s), those spots are
// decided by an even draw among them (they all hold the same tickets), and
// whoever misses out goes into the weighted pool like everyone else.
// Students with 0 tickets can never win.

export interface Entrant {
  name: string;
  tickets: number;
}

export interface TopSplit<T extends Entrant> {
  /** Certain top winners. */
  sure: T[];
  /** Tied at the cutoff, competing for `tiedSlots` remaining top spots. */
  tied: T[];
  tiedSlots: number;
  /** Everyone else — the random pool (before tie losers join it). */
  rest: T[];
}

export const byTickets = <T extends Entrant>(a: T, b: T) =>
  b.tickets - a.tickets || a.name.localeCompare(b.name);

export function splitTop<T extends Entrant>(students: T[], n: number): TopSplit<T> {
  const ranked = students.filter((s) => s.tickets > 0).sort(byTickets);
  const zero = students.filter((s) => s.tickets <= 0);
  if (n <= 0) return { sure: [], tied: [], tiedSlots: 0, rest: [...ranked, ...zero] };
  if (ranked.length <= n) return { sure: ranked, tied: [], tiedSlots: 0, rest: zero };

  const cutoff = ranked[n - 1].tickets;
  const sure = ranked.filter((s) => s.tickets > cutoff);
  const atCutoff = ranked.filter((s) => s.tickets === cutoff);
  const below = ranked.filter((s) => s.tickets < cutoff);
  const tiedSlots = n - sure.length;
  if (atCutoff.length === tiedSlots) {
    return { sure: [...sure, ...atCutoff], tied: [], tiedSlots: 0, rest: [...below, ...zero] };
  }
  return { sure, tied: atCutoff, tiedSlots, rest: [...below, ...zero] };
}

/** A uniform float in [0, 1) from the browser's cryptographic RNG. */
export function secureRandom(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] / 2 ** 32;
}

/** Pick `k` distinct entries, each pick weighted by `weight`, without replacement. */
export function pickWeighted<T>(
  pool: T[],
  k: number,
  weight: (t: T) => number,
  rng: () => number = secureRandom,
): T[] {
  const remaining = pool.filter((t) => weight(t) > 0);
  const picked: T[] = [];
  while (picked.length < k && remaining.length > 0) {
    const total = remaining.reduce((sum, t) => sum + weight(t), 0);
    let r = rng() * total;
    let idx = remaining.findIndex((t) => (r -= weight(t)) < 0);
    if (idx < 0) idx = remaining.length - 1; // floating-point edge
    picked.push(remaining.splice(idx, 1)[0]);
  }
  return picked;
}

export interface DrawResult<T extends Entrant> {
  top: T[];
  /** In the order they were drawn. */
  random: T[];
  /** The subset of `top` that won a tie-break for the last spot(s). */
  tieWinners: T[];
}

/**
 * Settle the top spots (breaking any tie at the cutoff) and return the random
 * pool left behind: everyone else, tie losers included. The public page draws
 * from this pool one winner at a time, for as long as the button is pressed.
 */
export function settleTop<T extends Entrant>(
  students: T[],
  topCount: number,
  rng: () => number = secureRandom,
): { top: T[]; tieWinners: T[]; pool: T[] } {
  const split = splitTop(students, topCount);
  const tieWinners = pickWeighted(split.tied, split.tiedSlots, () => 1, rng);
  const tieLosers = split.tied.filter((s) => !tieWinners.includes(s));
  return { top: [...split.sure, ...tieWinners], tieWinners, pool: [...split.rest, ...tieLosers] };
}

export function runDraw<T extends Entrant>(
  students: T[],
  topCount: number,
  drawCount: number,
  rng: () => number = secureRandom,
): DrawResult<T> {
  const split = splitTop(students, topCount);
  const tieWinners = pickWeighted(split.tied, split.tiedSlots, () => 1, rng);
  const tieLosers = split.tied.filter((s) => !tieWinners.includes(s));
  const random = pickWeighted([...split.rest, ...tieLosers], drawCount, (s) => s.tickets, rng);
  return { top: [...split.sure, ...tieWinners], random, tieWinners };
}
