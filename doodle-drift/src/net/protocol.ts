/**
 * What travels through the Stellarr room.
 *
 * - Shared state holds only small public facts: phase, settings, roster, the plan, the
 *   round clock, who has finished and the reveal pointer. Page content never goes there,
 *   except sentences once they are revealed.
 * - Each player's private assignment holds the prompt they need now and a copy of every
 *   sentence they wrote, so a new host can rebuild the sentences from the checkpoint.
 * - Pictures travel as binary messages (`img`), acknowledged by the host, because the room's
 *   command ledger (4096 entries, 4 MiB per room) would fill up with drawings.
 */
import { buildPlan } from "../game/plan.ts";
import { COUNTDOWN_MS } from "../game/rules.ts";
import type { MatchPlan, MatchSettings, PageRef } from "../game/types.ts";
import { DEFAULT_SETTINGS, MAX_PLAYERS } from "../game/types.ts";

export interface Player {
  id: string;
  name: string;
  avatar: string | null;
}

export type Phase = "lobby" | "play" | "reveal" | "end";

export interface MatchMeta {
  id: string;
  players: Player[];
  plan: MatchPlan;
  startedAt: number;
}

export interface RoundClock {
  index: number;
  startsAt: number;
  endsAt: number;
}

export interface RevealPointer {
  /** Index into `revealOrder(plan)`. */
  index: number;
}

export interface GameState {
  [key: string]: unknown;
  v: 1;
  phase: Phase;
  settings: MatchSettings;
  /** Boot id of the host tab that holds the pictures. A change asks everyone to re-send theirs. */
  store: string;
  match: MatchMeta | null;
  round: RoundClock | null;
  /** Players who handed in this round. */
  done: string[];
  reveal: RevealPointer | null;
  /** Sentences already shown on the reveal (all of them at the end), by page key. */
  texts: Record<string, string>;
  /** Pages nobody handed in, by page key. */
  empty: string[];
  /** Na punkty: page key -> ids of players who said the page fits. */
  votes: Record<string, string[]>;
}

export const initialState = (): GameState => ({
  v: 1,
  phase: "lobby",
  settings: { ...DEFAULT_SETTINGS },
  store: "",
  match: null,
  round: null,
  done: [],
  reveal: null,
  texts: {},
  empty: [],
  votes: {},
});

export interface Assignment {
  match: string;
  round: number;
  /** Text of the task's prompt page, if it has one. */
  prompt: string | null;
  /** Every sentence this player wrote in the match, by page key. */
  own: Record<string, string>;
}

export const pageKey = (ref: PageRef) => `${ref.album}:${ref.page}`;

export function parseKey(key: string): PageRef {
  const [album, page] = key.split(":").map(Number);
  return { album, page };
}

/** The roster for a new match: connected people in join order, at most 14. */
export function rosterFor(people: { id: string; name: string; avatar: string | null; connected: boolean }[]): Player[] {
  return people.filter((p) => p.connected).slice(0, MAX_PLAYERS).map(({ id, name, avatar }) => ({ id, name, avatar }));
}

export function startPatch(settings: MatchSettings, players: Player[], matchId: string, now: number): Partial<GameState> {
  const plan = buildPlan(settings, players.length, matchId);
  const first = plan.rounds[0];
  const startsAt = now + COUNTDOWN_MS;
  return {
    phase: "play",
    settings,
    match: { id: matchId, players, plan, startedAt: now },
    round: { index: 0, startsAt, endsAt: startsAt + first.seconds * 1000 },
    done: [],
    reveal: null,
    texts: {},
    empty: [],
    votes: {},
  };
}

/** Every key of a page the given round produces. */
export function roundKeys(plan: MatchPlan, round: number): string[] {
  return plan.rounds[round].tasks.map((task) => pageKey(task));
}

/** Image pages a task needs on screen before the player can work. */
export function taskImageRefs(plan: MatchPlan, round: number, player: number): string[] {
  const task = plan.rounds[round]?.tasks[player];
  if (!task) return [];
  const refs = [task.source, task.onion, ...(task.base ?? [])].filter((ref): ref is PageRef => !!ref);
  return [...new Set(refs.map(pageKey))];
}

export const playerIndex = (match: MatchMeta | null, id: string) => (match ? match.players.findIndex((p) => p.id === id) : -1);
