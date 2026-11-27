/**
 * Every event the game can deal: the 184 cases of the base pool and the 50 omen-only cases,
 * plus the five omens themselves. Shared state only ever names events by id.
 */

import { EVENTS } from "./events/index";
import { OMENS, omenEvents } from "./events/omens";
import { defineEventPool } from "./events/schema";
import type { ChoiceSide, EventCategory, GameEvent, StatId, Stats } from "./types";
import { STATS } from "./types";

export type OmenId = (typeof OMENS)[number]["id"];
export const OMEN_IDS: readonly OmenId[] = OMENS.map((omen) => omen.id);

export const BASE_EVENTS: readonly GameEvent[] = EVENTS;

export const OMEN_EVENTS: readonly GameEvent[] = defineEventPool(
  omenEvents.map(({ omen: _omen, ...draft }) => draft),
).map((event, index) => Object.freeze({ ...event, omen: omenEvents[index].omen }));

export const EVENT_BY_ID: ReadonlyMap<string, GameEvent> = new Map(
  [...BASE_EVENTS, ...OMEN_EVENTS].map((event) => [event.id, event]),
);

export function eventById(id: string): GameEvent {
  const event = EVENT_BY_ID.get(id);
  if (!event) throw new Error(`Unknown event ${id}`);
  return event;
}

export interface OmenMeta {
  id: OmenId;
  name: string;
  flavor: string;
  art: string;
  categories: readonly EventCategory[];
  /** What the omen does after every decree, for players. */
  passiveText: string;
}

const PASSIVE_TEXT: Record<OmenId, string> = {
  drought: "Po każdym dekrecie Lud −1.",
  war: "Po każdym dekrecie Skarbiec −1.",
  plague: "Po każdym dekrecie Lud −1, a skutki dla Wiary są podwójne.",
  comet: "Po każdym dekrecie Stabilność skacze o 2 w górę albo w dół.",
  harvest: "Po każdym dekrecie Skarbiec +1. Bogactwo też potrafi przewrócić tron.",
};

export const OMEN_META: Record<OmenId, OmenMeta> = Object.fromEntries(
  OMENS.map((omen) => [
    omen.id,
    {
      id: omen.id,
      name: omen.name,
      flavor: omen.flavor,
      art: `assets/year/omen-${omen.id}.webp`,
      categories: omen.categories,
      passiveText: PASSIVE_TEXT[omen.id],
    },
  ]),
) as unknown as Record<OmenId, OmenMeta>;

export function artOf(event: GameEvent): string {
  return event.artKey.startsWith("omen-") ? `assets/year/${event.artKey}.webp` : `assets/events/${event.artKey}.webp`;
}

/** The effects a decree really has under an omen (plague doubles faith). */
export function effectiveEffects(event: GameEvent, side: ChoiceSide, omen: OmenId | null): Stats {
  const effects = { ...event[side].effects };
  if (omen === "plague") effects.faith *= 2;
  return effects;
}

export function clampStat(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export function applyDeltas(stats: Stats, ...deltas: Partial<Stats>[]): Stats {
  const next = { ...stats };
  for (const delta of deltas) {
    for (const stat of STATS) next[stat] = clampStat(next[stat] + (delta[stat] ?? 0));
  }
  return next;
}

/** The first pillar at 0 or 100, which ends the reign. */
export function collapsedStat(stats: Stats): StatId | null {
  return STATS.find((stat) => stats[stat] <= 0 || stats[stat] >= 100) ?? null;
}

/** How close the realm is to an edge; bigger is worse. */
export function dangerScore(stats: Stats): number {
  return STATS.reduce((total, stat) => {
    const value = stats[stat];
    const edge = Math.abs(value - 50);
    return total + edge + (value <= 15 || value >= 85 ? 35 : 0) + (value <= 0 || value >= 100 ? 1000 : 0);
  }, 0);
}

/** The decree that pushes the realm closer to an edge (the traitor's hint). */
export function destructiveSide(stats: Stats, event: GameEvent, omen: OmenId | null): ChoiceSide {
  const left = dangerScore(applyDeltas(stats, effectiveEffects(event, "left", omen)));
  const right = dangerScore(applyDeltas(stats, effectiveEffects(event, "right", omen)));
  return left >= right ? "left" : "right";
}
