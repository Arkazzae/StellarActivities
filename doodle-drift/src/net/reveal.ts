import type { MatchPlan } from "../game/types.ts";
import { pageKey } from "./protocol.ts";

export interface RevealStep {
  album: number;
  /** Step within the album, from 0. */
  step: number;
  steps: number;
  /** Pages that become visible at this step. */
  keys: string[];
}

/** The order the host walks through on the reveal, album by album. */
export function revealOrder(plan: MatchPlan): RevealStep[] {
  const order: RevealStep[] = [];
  plan.albums.forEach((album, a) => {
    if (!album.shown) return;
    const keys = album.kinds.map((_, p) => pageKey({ album: a, page: p }));
    const perPage = album.kind === "chain" || album.kind === "corpse";
    if (perPage) {
      keys.forEach((key, step) => order.push({ album: a, step, steps: keys.length, keys: [key] }));
    } else {
      order.push({ album: a, step: 0, steps: 1, keys });
    }
  });
  return order;
}

/** Every page key visible once the reveal pointer reaches `index`. */
export function revealedKeys(plan: MatchPlan, index: number): string[] {
  return revealOrder(plan).slice(0, index + 1).flatMap((step) => step.keys);
}
