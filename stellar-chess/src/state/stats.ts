/**
 * The player's record: results against each bot (the ladder on the menu marks the ones beaten)
 * and against people in the voice channel. Saved with the player's Stellarr progress.
 */

import { create } from "zustand";
import { isOpponentId, type OpponentId } from "@/ai/bots";
import { readSaved, writeSaved } from "@/stellarr/storage";

export interface Record3 {
  w: number;
  d: number;
  l: number;
}

export type Outcome = keyof Record3;

interface StatsState {
  bots: Partial<Record<OpponentId, Record3>>;
  online: Record3;
  record: (against: OpponentId | "online", outcome: Outcome) => void;
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

function load(): Pick<StatsState, "bots" | "online"> {
  const saved = readSaved(KEY) as { bots?: Record<string, unknown>; online?: unknown } | null;
  const bots: StatsState["bots"] = {};
  for (const [id, value] of Object.entries(saved?.bots ?? {})) if (isOpponentId(id)) bots[id] = record3(value);
  return { bots, online: record3(saved?.online) };
}

export const useStatsStore = create<StatsState>((set, get) => ({
  ...load(),
  record: (against, outcome) => {
    const { bots, online } = get();
    const next = against === "online"
      ? { bots, online: { ...online, [outcome]: online[outcome] + 1 } }
      : { bots: { ...bots, [against]: { ...(bots[against] ?? EMPTY), [outcome]: (bots[against] ?? EMPTY)[outcome] + 1 } }, online };
    set(next);
    writeSaved(KEY, next);
  },
}));

/** Whether the player has beaten this bot at least once. */
export function hasBeaten(bots: StatsState["bots"], id: OpponentId): boolean {
  return (bots[id]?.w ?? 0) > 0;
}
