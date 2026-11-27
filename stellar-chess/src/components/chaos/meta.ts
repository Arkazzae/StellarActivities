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

/**
 * Category accents from Multiversal Chess's Chaos palette (orchid, ember, gold, mint): a thin edge
 * glow, a sigil and the type line, never a filled frame.
 */
export const CATEGORY: Record<ChaosCategory, { color: string; deep: string }> = {
  arcane: { color: "#9b6cff", deep: "#3b2a66" },
  battle: { color: "#f28c38", deep: "#5a2c14" },
  time: { color: "#d9b45b", deep: "#4d3d17" },
  fate: { color: "#77e2a8", deep: "#1d4a37" },
};

/** Rarity as the metal of the card's edge: iron, silver, gold. */
export const RARITY: Record<ChaosRarity, { edge: string; label: string }> = {
  common: { edge: "rgba(241, 233, 210, 0.16)", label: "#aaa0b8" },
  rare: { edge: "#9fb3d1", label: "#c3d2ea" },
  legendary: { edge: "#d9b45b", label: "#ecd28a" },
};

export const effect = (id: ChaosEffectId) => CHAOS_EFFECT_BY_ID[id];
export const effectName = (id: ChaosEffectId) => getChaosCopy(effect(id).name, getLocale());
export const effectText = (id: ChaosEffectId) => getChaosCopy(effect(id).description, getLocale());
/** A small picture of an effect: its own card illustration, cropped by the stylesheet. */
export const effectIcon = (id: ChaosEffectId) => effect(id).art;
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
