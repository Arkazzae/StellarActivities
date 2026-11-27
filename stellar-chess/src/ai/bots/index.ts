/**
 * Everyone who can sit at the board: the character ladder, who play from Stockfish's candidate
 * lines in their own style, and Stockfish itself with the player's settings. A game seats two of
 * them, or one and the player.
 */

import { t } from "@/i18n";
import { CHAOS_CHARACTERS } from "./chaos-characters";
import {
  botAvatarUrl,
  characterBot,
  characterText,
  CHARACTERS,
  STOCKFISH_TINT,
  stockfishBot,
  type Character,
  type CharacterId,
  type CharacterText,
} from "./characters";
import type { BotDefinition } from "./types";

export type { BotDefinition } from "./types";
export type { CharacterId, CharacterText } from "./characters";
export { CHAOS_TASTE, type ChaosCharacterId, type ChaosTaste } from "./chaos-characters";

/** A ladder character, a Chaos Chess character, or Stockfish. */
export type OpponentKind = "character" | "chaos" | "engine";
export type OpponentId = CharacterId | "stockfish";

export interface Opponent {
  id: OpponentId;
  kind: OpponentKind;
  readonly name: string;
  /** A few words under the name on cards and player bars. */
  readonly short: string;
  readonly description: string;
  /** Everything else it says outside the game chat, in the current language. */
  readonly text: CharacterText;
  tint: string;
  avatarUrl: string;
  /** Voice in the chat bubble. */
  bot: BotDefinition;
  /** Nominal rating shown on the card (characters only). */
  rating?: number;
}

/** Stockfish's strength as the player sets it (this build has no Elo option; see stockfish-player). */
export interface EngineConfig {
  /** Skill Level, 0–20. */
  skill: number;
  /** Maximum search depth in plies, 1–20. */
  depth: number;
  moveTimeMs: number;
}

export const DEFAULT_ENGINE: EngineConfig = { skill: 10, depth: 10, moveTimeMs: 1000 };
export const ENGINE_MOVE_TIMES = [100, 250, 500, 1000, 2000, 5000];

/** The opponent offered first. */
export const DEFAULT_OPPONENT: OpponentId = "amara";

/** One side of the board taken by a bot; `engine` only when Stockfish sits there. */
export interface Seat {
  id: OpponentId;
  engine?: EngineConfig;
}

const characters: Opponent[] = [...CHARACTERS, ...CHAOS_CHARACTERS].map((character: Character) => ({
  id: character.id,
  kind: CHAOS_CHARACTERS.includes(character) ? "chaos" : "character",
  name: character.name,
  get text() { return characterText(character.id); },
  get short() { return characterText(character.id).short; },
  get description() { return characterText(character.id).description; },
  tint: character.tint,
  avatarUrl: botAvatarUrl(character.id),
  bot: characterBot(character),
  rating: character.rating,
}));

const engine: Opponent = {
  id: "stockfish",
  kind: "engine",
  name: stockfishBot.name,
  get text() { return characterText("stockfish"); },
  get short() { return characterText("stockfish").short; },
  get description() { return characterText("stockfish").description; },
  tint: STOCKFISH_TINT,
  avatarUrl: botAvatarUrl("stockfish"),
  bot: stockfishBot,
};

export const OPPONENTS: Opponent[] = [...characters, engine];

export function isOpponentId(id: unknown): id is OpponentId {
  return OPPONENTS.some((opponent) => opponent.id === id);
}

/** Unknown or legacy ids fall back to the default opponent. */
export function getOpponent(id: string | null | undefined): Opponent {
  return OPPONENTS.find((opponent) => opponent.id === id) ?? OPPONENTS.find((opponent) => opponent.id === DEFAULT_OPPONENT)!;
}

export function getCharacter(id: OpponentId): Character | undefined {
  return CHARACTERS.find((character) => character.id === id) ?? CHAOS_CHARACTERS.find((character) => character.id === id);
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(Math.max(min, Math.min(max, value))) : fallback;
}

/** A saved or edited engine setting, kept within the engine's limits. */
export function normalizeEngine(value: unknown): EngineConfig {
  const saved = (value && typeof value === "object" ? value : {}) as Partial<Record<keyof EngineConfig, unknown>>;
  return {
    skill: clampInt(saved.skill, 0, 20, DEFAULT_ENGINE.skill),
    depth: clampInt(saved.depth, 1, 20, DEFAULT_ENGINE.depth),
    moveTimeMs: ENGINE_MOVE_TIMES.includes(saved.moveTimeMs as number) ? saved.moveTimeMs as number : DEFAULT_ENGINE.moveTimeMs,
  };
}

export function seatFor(id: OpponentId, engineConfig: EngineConfig): Seat {
  return id === "stockfish" ? { id, engine: { ...engineConfig } } : { id };
}

/** The line under a bot's name on its player bar. */
export function seatSubtitle(seat: Seat): string {
  const opponent = getOpponent(seat.id);
  if (opponent.kind === "engine") {
    const config = seat.engine ?? DEFAULT_ENGINE;
    return t("engine.summary", { skill: config.skill, depth: config.depth });
  }
  return opponent.rating ? `(${opponent.rating})` : opponent.short;
}
