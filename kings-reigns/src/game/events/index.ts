import { armyEvents } from "./army";
import { arcaneEvents } from "./arcane";
import { courtEvents } from "./court";
import { diplomacyEvents } from "./diplomacy";
import { faithEvents } from "./faith";
import { natureEvents } from "./nature";
import { peopleEvents } from "./people";
import { defineEventPool } from "./schema";
import { treasuryEvents } from "./treasury";
import { EVENT_CATEGORIES } from "../types";

export const EVENTS = defineEventPool([
  ...faithEvents,
  ...peopleEvents,
  ...armyEvents,
  ...treasuryEvents,
  ...courtEvents,
  ...diplomacyEvents,
  ...natureEvents,
  ...arcaneEvents,
]);

export const EVENT_BY_ID = new Map(EVENTS.map((event) => [event.id, event]));

if (EVENTS.length < 184) {
  throw new Error(`Katalog eventów musi zawierać co najmniej 184 wpisy, znaleziono ${EVENTS.length}.`);
}

for (const event of EVENTS) {
  for (const side of ["left", "right"] as const) {
    const targetId = event[side].triggers;
    if (!targetId) continue;
    if (targetId === event.id) {
      throw new Error(`Event ${event.id}/${side} nie może wyzwalać samego siebie.`);
    }
    if (!EVENT_BY_ID.has(targetId)) {
      throw new Error(`Event ${event.id}/${side} wyzwala nieistniejący event: ${targetId}.`);
    }
  }
}

export const EVENTS_PER_CATEGORY = EVENTS.filter(
  (event) => event.category === EVENT_CATEGORIES[0],
).length;

for (const category of EVENT_CATEGORIES) {
  const count = EVENTS.filter((event) => event.category === category).length;
  if (count !== EVENTS_PER_CATEGORY) {
    throw new Error(`Kategoria ${category} ma ${count} eventów zamiast ${EVENTS_PER_CATEGORY}.`);
  }
}

function shuffle<T>(items: readonly T[], random: () => number) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

export function createEventDeck(random: () => number = Math.random) {
  const buckets = new Map(
    EVENT_CATEGORIES.map((category) => [
      category,
      shuffle(EVENTS.filter((event) => event.category === category), random),
    ]),
  );
  const deck: string[] = [];
  let previousCategory = "";

  for (let round = 0; round < EVENTS_PER_CATEGORY; round += 1) {
    const categories = shuffle(EVENT_CATEGORIES, random);
    if (categories[0] === previousCategory) {
      const swapIndex = categories.findIndex((category) => category !== previousCategory);
      [categories[0], categories[swapIndex]] = [categories[swapIndex], categories[0]];
    }
    for (const category of categories) {
      const event = buckets.get(category)?.[round];
      if (event) deck.push(event.id);
      previousCategory = category;
    }
  }

  return deck;
}

export { defineEventPool } from "./schema";
export type { EventDraft } from "./schema";
