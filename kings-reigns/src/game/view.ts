/** What one player may see, worked out on their own client from the shared state and their note. */

import { collapsedStat, destructiveSide, effectiveEffects, eventById } from "./catalog";
import { roleOf, type Assignment, type SharedState } from "./rules";
import { ADVISORS, ROLE_META, STATS, type AdvisorRole, type ChoiceSide, type RoleId, type StatId, type Stats } from "./types";

export interface SideIntel {
  /** The player's own pillar and its change, for advisors. */
  own: { stat: StatId; delta: number } | null;
  /** Stability, which only the traitor sees. */
  stability: number | null;
  /** Marked on the decree that hurts the realm more, for the traitor. */
  worse: boolean;
}

export function myRole(state: SharedState, me: string): RoleId | null {
  return roleOf(state, me);
}

export function isTraitor(assignment: Assignment | null): boolean {
  return !!assignment?.traitor;
}

export function intelFor(state: SharedState, role: RoleId | null, traitor: boolean, side: ChoiceSide): SideIntel | null {
  if (!state.event || !role || role === "king") return null;
  const event = eventById(state.event);
  const effects = effectiveEffects(event, side, state.omen);
  const stat = ROLE_META[role].stat!;
  return {
    own: { stat, delta: effects[stat] },
    stability: traitor ? effects.stability : null,
    worse: traitor && destructiveSide(state.stats, event, state.omen) === side,
  };
}

/** The pillar closest to an edge, for the traitor's reminder. */
export function nearestEdge(stats: Stats): { stat: StatId; value: number } {
  let best: StatId = "faith";
  for (const stat of STATS) {
    if (Math.min(stats[stat], 100 - stats[stat]) < Math.min(stats[best], 100 - stats[best])) best = stat;
  }
  return { stat: best, value: stats[best] };
}

export function backers(state: SharedState, side: ChoiceSide): AdvisorRole[] {
  return ADVISORS.filter((role) => state.votes[role] === side);
}

export function signed(value: number): string {
  return value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : "0";
}

/** Total change shown on the header after a decree: the decree plus the omen. */
export function shownDeltas(state: SharedState): Partial<Stats> | null {
  if (state.phase !== "outcome" || !state.outcome) return null;
  const total: Partial<Stats> = {};
  for (const stat of STATS) {
    const value = (state.outcome.deltas[stat] ?? 0) + (state.outcome.passive[stat] ?? 0);
    if (value) total[stat] = value;
  }
  return total;
}

export { collapsedStat };

export const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

export const YEAR_NAMES = ["", "pierwszy", "drugi", "trzeci"];

/** Polish accusative of a role name, for sentences like "Rada straciła Generała". */
export const ROLE_ACC: Record<RoleId, string> = {
  king: "Króla",
  treasury: "Skarbnika",
  army: "Generała",
  faith: "Biskupa",
  people: "Trybuna",
};
