import {
  EVENT_CATEGORIES,
  ROLE_META,
  type AdvisorRole,
  type GameEvent,
} from "../types";

export type EventDraft = Omit<GameEvent, "petitioner" | "portraitRole" | "artKey"> & {
  petitionerRole: AdvisorRole;
  artKey?: string;
};

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function validateEvent(event: GameEvent) {
  if (!ID_PATTERN.test(event.id)) throw new Error(`Nieprawidłowe ID eventu: ${event.id}`);
  if (!EVENT_CATEGORIES.includes(event.category)) throw new Error(`Nieprawidłowa kategoria: ${event.id}`);
  if (event.tags.length < 1 || event.tags.length > 3) throw new Error(`Event ${event.id} musi mieć 1–3 tagi.`);
  if (event.left.label === event.right.label) throw new Error(`Event ${event.id} ma dwie identyczne decyzje.`);

  for (const side of ["left", "right"] as const) {
    for (const delta of Object.values(event[side].effects)) {
      if (!Number.isInteger(delta) || delta < -25 || delta > 25) {
        throw new Error(`Efekt ${event.id}/${side} wykracza poza zakres -25..25.`);
      }
    }
  }
}

export function defineEventPool(drafts: readonly EventDraft[]): readonly GameEvent[] {
  const ids = new Set<string>();
  const events = drafts.map((draft) => {
    if (ids.has(draft.id)) throw new Error(`Powtórzone ID eventu: ${draft.id}`);
    ids.add(draft.id);

    const { petitionerRole, artKey, ...content } = draft;
    const event: GameEvent = {
      ...content,
      artKey: artKey ?? draft.id,
      petitioner: ROLE_META[petitionerRole].title,
      portraitRole: petitionerRole,
    };
    validateEvent(event);
    return Object.freeze(event);
  });

  return Object.freeze(events);
}
