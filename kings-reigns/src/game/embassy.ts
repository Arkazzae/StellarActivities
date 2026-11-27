/**
 * Poselstwa: dispatches from three factions, each with three replies. Every reply has public
 * effects and a hidden complication only the case's liaison sees until the Crown seals it.
 * Pure helpers used by the rules and by each player's own view.
 */

import { DIPLOMATIC_CHANNELS, diplomaticChannel } from "./communications";
import { DIPLOMATIC_EVENTS, DIPLOMATIC_EVENT_BY_ID, type DiplomaticEventChoiceDefinition, type DiplomaticEventDefinition } from "./diplomatic-events";
import { applyDeltas, dangerScore, type OmenId } from "./catalog";
import { CHANNELS, type DiplomaticChannelId, type Stats } from "./types";

export type { DiplomaticEventChoiceDefinition, DiplomaticEventDefinition };

export const START_RELATIONS: Record<DiplomaticChannelId, number> = { pirates: 34, free_ports: 56, amber_guilds: 48 };

export function dispatchById(id: string): DiplomaticEventDefinition {
  const dispatch = DIPLOMATIC_EVENT_BY_ID.get(id);
  if (!dispatch) throw new Error(`Unknown dispatch ${id}`);
  return dispatch;
}

export function choiceOf(dispatch: DiplomaticEventDefinition, choiceId: string): DiplomaticEventChoiceDefinition {
  const choice = dispatch.choices.find((entry) => entry.id === choiceId);
  if (!choice) throw new Error(`Unknown reply ${choiceId} to ${dispatch.id}`);
  return choice;
}

export function channelMeta(id: DiplomaticChannelId) {
  return diplomaticChannel(id)!;
}

export { DIPLOMATIC_CHANNELS };

export function dispatchArt(dispatch: DiplomaticEventDefinition): string {
  return `assets/diplomatic-events/${dispatch.artKey}.webp`;
}

/** The channel a decree of the year turns to: pirates, ports, guilds, pirates… */
export function focusOf(decree: number): DiplomaticChannelId {
  return CHANNELS[(Math.max(1, decree) - 1) % CHANNELS.length];
}

/**
 * The dispatches were written for the old 10-turn game; over 36 they barely move the realm, and a
 * traitor could not bring it down. Every pillar effect of a reply counts this many times.
 */
export const STAKES = 2;

function weighted(effects: Partial<Stats>, omen: OmenId | null): Partial<Stats> {
  const out: Partial<Stats> = {};
  for (const [stat, value] of Object.entries(effects) as [keyof Stats, number][]) {
    if (!value) continue;
    out[stat] = Math.round(value * STAKES) * (omen === "plague" && stat === "faith" ? 2 : 1);
  }
  return out;
}

/** A reply's effects under the year's omen: what is public, what is hidden, and both together. */
export function replyEffects(choice: DiplomaticEventChoiceDefinition, omen: OmenId | null) {
  const visible = weighted(choice.effects, omen);
  const hidden = weighted(choice.hiddenEffects, omen);
  return { visible, hidden, relation: choice.relationDelta, hiddenRelation: choice.hiddenRelationDelta };
}

function clampRelation(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export function nextRelation(relation: number, choice: DiplomaticEventChoiceDefinition, includeHidden = true): number {
  return clampRelation(relation + choice.relationDelta + (includeHidden ? choice.hiddenRelationDelta : 0));
}

/** How dangerous a reply is: the pillars' distance from the edges plus a faction pushed toward war. */
export function replyRisk(stats: Stats, relation: number, choice: DiplomaticEventChoiceDefinition, omen: OmenId | null, includeHidden: boolean): number {
  const { visible, hidden } = replyEffects(choice, omen);
  const after = includeHidden ? applyDeltas(stats, visible, hidden) : applyDeltas(stats, visible);
  const rel = nextRelation(relation, choice, includeHidden);
  return dangerScore(after) + Math.abs(rel - 50) * 0.25 + (rel <= 10 ? 25 : 0);
}

export function rankReplies(stats: Stats, relation: number, dispatch: DiplomaticEventDefinition, omen: OmenId | null, includeHidden: boolean): DiplomaticEventChoiceDefinition[] {
  return [...dispatch.choices].sort((a, b) => replyRisk(stats, relation, a, omen, includeHidden) - replyRisk(stats, relation, b, omen, includeHidden));
}

/** The reply that truly hurts the realm most: the traitor's hint and the trial's yardstick. */
export function worstReply(stats: Stats, relation: number, dispatch: DiplomaticEventDefinition, omen: OmenId | null): string {
  return rankReplies(stats, relation, dispatch, omen, true).at(-1)!.id;
}

export function dispatchesOf(channel: DiplomaticChannelId): string[] {
  return DIPLOMATIC_EVENTS.filter((dispatch) => dispatch.channelId === channel).map((dispatch) => dispatch.id);
}
