/**
 * The player's record: results against each bot (the ladder on the menu marks the ones beaten),
 * against people in Multiplayer, and the Stellarr Elo those games earned. Saved with the player's
 * Stellarr progress, so the rating follows them to every session.
 */

import { create } from "zustand";
import { currentOpponentId, isOpponentId, type OpponentId } from "@/ai/bots";
import { readSaved, writeSaved } from "@/stellarr/storage";
import { START_ELO } from "@/online/protocol";

export interface Record3 {
  w: number;
  d: number;
  l: number;
}

export type Outcome = keyof Record3;

/** One rated game in the player's own log. */
export interface RatedGame {
  at: number;
  opponent: string;
  outcome: Outcome;
  change: number;
  elo: number;
}

/** The Stellarr Elo earned in Multiplayer games, with the record of those games. */
export interface Rating extends Record3 {
  elo: number;
  peak: number;
  games: number;
  log: RatedGame[];
  /** Games already counted, so a game seen again (a reload, a second state) moves the rating once. */
  applied: string[];
}

interface StatsState {
  bots: Partial<Record<OpponentId, Record3>>;
  online: Record3;
  rating: Rating;
  record: (against: OpponentId | "online", outcome: Outcome) => void;
  /** Count a rated game once; returns whether it was new. */
  rate: (game: { id: string; opponent: string; outcome: Outcome; change: number; at: number }) => boolean;
}

const KEY = "stats";
const EMPTY: Record3 = { w: 0, d: 0, l: 0 };

function count(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
}

function record3(value: unknown): Record3 {
  const saved = (value && typeof value === "object" ? value : {}) as Partial<Record<Outcome, unknown>>;
  return { w: count(saved.w), d: count(saved.d), l: count(saved.l) };
}

const LOG_SIZE = 30;
const APPLIED_SIZE = 60;
export const NEW_RATING: Rating = { elo: START_ELO, peak: START_ELO, games: 0, w: 0, d: 0, l: 0, log: [], applied: [] };

function rating(value: unknown): Rating {
  if (!value || typeof value !== "object") return NEW_RATING;
  const saved = value as Partial<Record<keyof Rating, unknown>>;
  const elo = typeof saved.elo === "number" && Number.isInteger(saved.elo) && saved.elo >= 100 && saved.elo <= 4000 ? saved.elo : START_ELO;
  const log = Array.isArray(saved.log)
    ? (saved.log as RatedGame[]).filter((game) => game && typeof game.elo === "number" && typeof game.change === "number" && typeof game.opponent === "string" && ["w", "d", "l"].includes(game.outcome)).slice(0, LOG_SIZE)
    : [];
  const applied = Array.isArray(saved.applied) ? (saved.applied as unknown[]).filter((id): id is string => typeof id === "string").slice(-APPLIED_SIZE) : [];
  return { ...record3(saved), elo, peak: Math.max(elo, count(saved.peak)), games: count(saved.games), log, applied };
}

function load(): Pick<StatsState, "bots" | "online" | "rating"> {
  const saved = readSaved(KEY) as { bots?: Record<string, unknown>; online?: unknown; rating?: unknown } | null;
  const bots: StatsState["bots"] = {};
  for (const [savedId, value] of Object.entries(saved?.bots ?? {})) {
    const id = currentOpponentId(savedId);
    if (isOpponentId(id)) bots[id] = record3(value);
  }
  return { bots, online: record3(saved?.online), rating: rating(saved?.rating) };
}

function save(state: Pick<StatsState, "bots" | "online" | "rating">): void {
  writeSaved(KEY, { bots: state.bots, online: state.online, rating: state.rating });
}

export const useStatsStore = create<StatsState>((set, get) => ({
  ...load(),
  record: (against, outcome) => {
    const { bots, online, rating } = get();
    const next = against === "online"
      ? { bots, online: { ...online, [outcome]: online[outcome] + 1 }, rating }
      : { bots: { ...bots, [against]: { ...(bots[against] ?? EMPTY), [outcome]: (bots[against] ?? EMPTY)[outcome] + 1 } }, online, rating };
    set(next);
    save(next);
  },
  rate: ({ id, opponent, outcome, change, at }) => {
    const { bots, online, rating } = get();
    if (rating.applied.includes(id)) return false;
    const elo = Math.min(4000, Math.max(100, rating.elo + change));
    const next: Rating = {
      ...rating,
      elo,
      peak: Math.max(rating.peak, elo),
      games: rating.games + 1,
      [outcome]: rating[outcome] + 1,
      log: [{ at, opponent, outcome, change, elo }, ...rating.log].slice(0, LOG_SIZE),
      applied: [...rating.applied, id].slice(-APPLIED_SIZE),
    };
    set({ rating: next });
    save({ bots, online, rating: next });
    return true;
  },
}));

/** Whether the player has beaten this bot at least once. */
export function hasBeaten(bots: StatsState["bots"], id: OpponentId): boolean {
  return (bots[id]?.w ?? 0) > 0;
}
