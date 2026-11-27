import type { ModeId, RevealKind, RoundRule } from "./types.ts";

export type ModeGroup = "start" | "round" | "flow" | "anim";

export type Flow =
  | "chain"
  | "story"
  | "memory"
  | "sandwich"
  | "same"
  | "scribble"
  | "missing"
  | "masterpiece"
  | "flipbook"
  | "relay"
  | "background"
  | "corpse"
  | "mosaic"
  | "custom";

export interface ModeDef {
  id: ModeId;
  group: ModeGroup;
  flow: Flow;
  /** A fixed rule for the matching rounds, or "mix" to draw one per round. */
  rule: RoundRule | "mix" | null;
  reveal: RevealKind;
  /** Fewest seated players the mode needs. */
  min: number;
  /** One-round rules that Mieszanka can draw. */
  dice?: boolean;
}

/** Names, one-line rules and pictures live in i18n (`mode.<id>.name`, `.rule`, `.long`). */
export const MODES: ModeDef[] = [
  { id: "classic", group: "start", flow: "chain", rule: null, reveal: "chain", min: 1 },
  { id: "mix", group: "start", flow: "chain", rule: "mix", reveal: "chain", min: 1 },
  { id: "story", group: "start", flow: "story", rule: null, reveal: "chain", min: 2 },
  { id: "custom", group: "start", flow: "custom", rule: null, reveal: "chain", min: 1 },

  { id: "stars", group: "round", flow: "chain", rule: "stars", reveal: "chain", min: 1, dice: true },
  { id: "oneline", group: "round", flow: "chain", rule: "oneline", reveal: "chain", min: 1, dice: true },
  { id: "kaleido", group: "round", flow: "chain", rule: "kaleido", reveal: "chain", min: 1, dice: true },
  { id: "crayons", group: "round", flow: "chain", rule: "crayons", reveal: "chain", min: 1, dice: true },
  { id: "blind", group: "round", flow: "chain", rule: "blind", reveal: "chain", min: 1, dice: true },
  { id: "telegram", group: "round", flow: "chain", rule: "telegram", reveal: "chain", min: 1, dice: true },

  { id: "memory", group: "flow", flow: "memory", rule: null, reveal: "chain", min: 2 },
  { id: "sandwich", group: "flow", flow: "sandwich", rule: null, reveal: "chain", min: 3 },
  { id: "same", group: "flow", flow: "same", rule: null, reveal: "gallery", min: 2 },
  { id: "scribble", group: "flow", flow: "scribble", rule: null, reveal: "chain", min: 2 },
  { id: "score", group: "flow", flow: "chain", rule: null, reveal: "score", min: 3 },
  { id: "missing", group: "flow", flow: "missing", rule: null, reveal: "chain", min: 2 },
  { id: "masterpiece", group: "flow", flow: "masterpiece", rule: null, reveal: "exhibit", min: 1 },

  { id: "flipbook", group: "anim", flow: "flipbook", rule: null, reveal: "animation", min: 1 },
  { id: "relay", group: "anim", flow: "relay", rule: null, reveal: "animation", min: 2 },
  { id: "background", group: "anim", flow: "background", rule: null, reveal: "animation", min: 2 },
  { id: "corpse", group: "anim", flow: "corpse", rule: null, reveal: "corpse", min: 3 },
  { id: "mosaic", group: "anim", flow: "mosaic", rule: null, reveal: "mosaic", min: 2 },
];

export const MODE_GROUPS: ModeGroup[] = ["start", "round", "flow", "anim"];

export function modeDef(id: ModeId): ModeDef {
  return MODES.find((mode) => mode.id === id) ?? MODES[0];
}

export function isModeId(value: unknown): value is ModeId {
  return typeof value === "string" && MODES.some((mode) => mode.id === value);
}
