/**
 * How Chaos cards look and read: category colours and icons, rarity gems, names and texts in the
 * current language, the card's art (or its icon when the card has no illustration of its own), and
 * how long an active effect still lasts.
 */

import {
  CHAOS_EFFECTS,
  CHAOS_EFFECT_BY_ID,
  getChaosCopy,
  type ActiveChaosEffect,
  type ChaosEffectDefinition,
  type ChaosEffectId,
} from "@/engine/chaos";
import { getLocale, t, tn } from "@/i18n";

export type ChaosCategory = ChaosEffectDefinition["category"];
export type ChaosRarity = ChaosEffectDefinition["rarity"];

export const CATEGORY: Record<ChaosCategory, { color: string; deep: string; band: string }> = {
  arcane: { color: "#b393f5", deep: "#5b3fa8", band: "rgba(143, 106, 224, 0.45)" },
  time: { color: "#5fb4f0", deep: "#1f5f96", band: "rgba(61, 155, 224, 0.42)" },
  battle: { color: "#f07a55", deep: "#8a2f1a", band: "rgba(224, 97, 63, 0.42)" },
  fate: { color: "#ffd65a", deep: "#9a7417", band: "rgba(255, 214, 90, 0.35)" },
};

export const RARITY: Record<ChaosRarity, { gems: number; color: string; inner: string }> = {
  common: { gems: 1, color: "#c3c2c1", inner: "rgba(255, 255, 255, 0.08)" },
  rare: { gems: 2, color: "#7fc4ff", inner: "rgba(127, 196, 255, 0.35)" },
  legendary: { gems: 3, color: "#ffd65a", inner: "rgba(255, 214, 90, 0.55)" },
};

export const effect = (id: ChaosEffectId) => CHAOS_EFFECT_BY_ID[id];
export const effectName = (id: ChaosEffectId) => getChaosCopy(effect(id).name, getLocale());
export const effectText = (id: ChaosEffectId) => getChaosCopy(effect(id).description, getLocale());
export const effectIcon = (id: ChaosEffectId) => `icons/effects/${id}.webp`;
export const categoryIcon = (category: ChaosCategory) => `icons/categories/${category}.webp`;
export const categoryColor = (id: ChaosEffectId) => CATEGORY[effect(id).category].color;

/** The card's own illustration, or null when it borrows another card's (its icon stands in). */
export function effectArt(id: ChaosEffectId): string | null {
  const art = effect(id).art;
  return art === `chaos/${id}.webp` ? art : null;
}

/** "Arcane · legendary". */
export function effectTag(id: ChaosEffectId): string {
  const { category, rarity } = effect(id);
  return `${t(`chaos.cat.${category}`)} · ${t(`chaos.rarity.${rarity}`)}`;
}

/** The card's number in the deck, "11/50". */
export function cardNumber(id: ChaosEffectId): string {
  return `${CHAOS_EFFECTS.findIndex((item) => item.id === id) + 1}/${CHAOS_EFFECTS.length}`;
}

/** How long a card lasts, as printed on it. */
export function durationText(id: ChaosEffectId): string {
  const { duration, turns } = effect(id);
  if (duration === "instant") return t("chaos.duration.instant");
  if (duration === "timed") return tn("chaos.duration.turns", turns ?? 1);
  return t("chaos.duration.permanent");
}

/** What is left of an active effect: turns, a single use, or the rest of the game. */
export function effectLeft(active: ActiveChaosEffect): string {
  const total = effect(active.effectId).turns;
  if (active.remainingTurns !== null) return tn("chaos.left.turns", active.remainingTurns, { total: total ?? active.remainingTurns });
  if (active.charges !== null) return t("chaos.left.charge");
  return t("chaos.left.permanent");
}

/** Pips for an active effect's turns: filled for the ones left. */
export function turnPips(active: ActiveChaosEffect): boolean[] {
  const total = effect(active.effectId).turns;
  if (active.remainingTurns === null || !total) return [];
  return Array.from({ length: total }, (_, i) => i < active.remainingTurns!);
}
