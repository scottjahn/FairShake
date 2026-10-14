export type WinnerKind = "top" | "random";

/** One student in an event, as published. */
export interface Student {
  name: string;
  tickets: number;
  /** The recorded outcome, set in admin. */
  winner: WinnerKind | null;
  /** 1-based order a random winner was drawn in. */
  pickOrder: number | null;
}

/** One event, as published in public/data/events.json. */
export interface PublicEvent {
  id: number;
  name: string;
  /** The top `topCount` ticket holders win outright... */
  topCount: number;
  /** ...then `drawCount` more are drawn at random, weighted by tickets. */
  drawCount: number;
  locked: boolean;
  lockedAt: string | null;
  createdAt: string;
  students: Student[];
}

export interface AdminStudent extends Student {
  id: number;
}

export interface AdminEvent extends Omit<PublicEvent, "students"> {
  students: AdminStudent[];
}

export interface AdminEventSummary {
  id: number;
  name: string;
  topCount: number;
  drawCount: number;
  locked: boolean;
  createdAt: string;
  studentCount: number;
  winnerCount: number;
}
