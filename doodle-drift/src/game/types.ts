/**
 * Shared game vocabulary. Everything here is plain data so it can travel through
 * Stellarr state, private assignments and messages, and run under `node --test`.
 */

export type ModeId =
  | "classic"
  | "mix"
  | "story"
  | "stars"
  | "oneline"
  | "kaleido"
  | "crayons"
  | "blind"
  | "telegram"
  | "memory"
  | "sandwich"
  | "same"
  | "scribble"
  | "score"
  | "missing"
  | "masterpiece"
  | "flipbook"
  | "relay"
  | "background"
  | "corpse"
  | "mosaic"
  | "custom";

export type Tempo = "fast" | "normal" | "slow";
export type Length = "short" | "full";

/** A rule that changes one drawing round. */
export type DrawRule = "stars" | "oneline" | "kaleido" | "crayons" | "blind";
/** A rule that changes one writing round. */
export type TextRule = "telegram" | "blind";
export type RoundRule = DrawRule | TextRule;

export type TaskKind =
  | "write" // first sentence, theme, question or title
  | "continue" // next sentence of a story
  | "draw" // draw a sentence
  | "describe" // describe a drawing
  | "guess" // guess the opening sentence from the last drawing
  | "copy" // redraw the previous drawing from memory
  | "scribble" // a few quick random lines
  | "add" // add onto a drawing that can't be erased
  | "hole" // fill the piece cut out of a drawing
  | "frame" // one animation frame
  | "background" // the still background of an animation
  | "part" // one band of a creature
  | "tile" // one tile of a shared picture
  | "masterpiece"; // one long drawing in a gold frame

export type RevealKind = "chain" | "score" | "gallery" | "animation" | "corpse" | "mosaic" | "exhibit";

export interface PageRef {
  album: number;
  page: number;
}

/** A rectangle on the 960 × 720 logical canvas. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Output = "text" | "flat" | "layer";

export interface TaskSpec {
  kind: TaskKind;
  album: number;
  page: number;
  /** Text page shown as the prompt (sentence, theme, question, title). */
  prompt?: PageRef;
  /** Image shown to describe, guess or copy. */
  source?: PageRef;
  /** Locked image layers under the canvas, bottom first. */
  base?: PageRef[];
  /** Previous animation frame shown faintly under the canvas. */
  onion?: PageRef;
  /** Only this region of the canvas takes ink. */
  clip?: Rect;
  /** The only part of `base` the player may see. */
  peek?: Rect;
  /** The piece cut out of the source that the player redraws. */
  hole?: Rect;
  part?: { index: number; count: number };
  tile?: { index: number; cols: number; rows: number };
  frame?: { index: number; count: number };
  /** Seconds the source stays visible before the canvas opens (memory rounds). */
  peekSeconds?: number;
  output: Output;
}

export interface RoundPlan {
  kind: TaskKind;
  seconds: number;
  /** One task per player, indexed like the match roster. */
  tasks: TaskSpec[];
  rule: RoundRule | null;
}

export type AlbumKind = "chain" | "gallery" | "animation" | "corpse" | "mosaic" | "exhibit";

export interface AlbumPlan {
  /** Player index that started the album. */
  owner: number;
  kind: AlbumKind;
  /** Author player index of each page. */
  authors: number[];
  /** Task kind of each page. */
  kinds: TaskKind[];
  /** Whether the reveal shows this album (unused questions and prompts are skipped). */
  shown: boolean;
}

export interface MatchPlan {
  mode: ModeId;
  players: number;
  seed: string;
  albums: AlbumPlan[];
  rounds: RoundPlan[];
  reveal: RevealKind;
}

/** Własne zasady: the host picks the order of tasks, the number of rounds, the times and one rule. */
export type CustomOrder = "write" | "draw" | "drawings" | "texts";
export type CustomRule = DrawRule | "telegram" | "mix" | "none";

export interface CustomRules {
  order: CustomOrder;
  /** Rounds; 0 means a full circle (one round per player). */
  rounds: number;
  /** Seconds for a sentence or a caption. */
  write: number;
  /** Seconds for a drawing. */
  draw: number;
  rule: CustomRule;
}

export const DEFAULT_CUSTOM: CustomRules = { order: "write", rounds: 0, write: 40, draw: 80, rule: "none" };

export interface MatchSettings {
  mode: ModeId;
  tempo: Tempo;
  length: Length;
  custom?: CustomRules;
}

export const DEFAULT_SETTINGS: MatchSettings = { mode: "classic", tempo: "normal", length: "full" };

export const CANVAS_W = 960;
export const CANVAS_H = 720;
export const MAX_PLAYERS = 14;
export const TEXT_LIMIT = 120;
