/**
 * The shapes of a Pętla match. Everything in `GameState` is public to the room; a player's
 * own GIF and vote live in their private `Assignment` until the host reveals them.
 */

export type Mode = "klasyk" | "zakaz" | "rezyser" | "napisy";

export interface ModeInfo {
  id: Mode;
  name: string;
  desc: string;
  /** Modes that are not built yet are shown in the lobby as "wkrótce" and cannot be picked. */
  ready: boolean;
}

export const MODES: ModeInfo[] = [
  { id: "klasyk", name: "Klasyk", desc: "Wszyscy szukają", ready: true },
  { id: "zakaz", name: "Zakaz słów", desc: "Bez słów z tematu", ready: true },
  { id: "rezyser", name: "Reżyser", desc: "Jedna osoba wybiera", ready: true },
  { id: "napisy", name: "Napisy", desc: "Ten sam GIF, wasz tekst", ready: true },
];

export type PackId = "mix" | "codziennosc" | "praca" | "internet" | "imprezy";

export const PACKS: { id: PackId; name: string }[] = [
  { id: "mix", name: "Mieszanka" },
  { id: "codziennosc", name: "Codzienność" },
  { id: "praca", name: "Praca i szkoła" },
  { id: "internet", name: "Internet" },
  { id: "imprezy", name: "Imprezy i wyjścia" },
];

export const ROUND_OPTIONS = [5, 8, 12] as const;
export const SEARCH_OPTIONS = [30, 45, 60, 90] as const;
export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 8;

export interface Settings {
  mode: Mode;
  rounds: number;
  searchSeconds: number;
  pack: PackId;
  /** Whether topics may name someone from the channel. */
  names: boolean;
}

export const DEFAULT_SETTINGS: Settings = { mode: "klasyk", rounds: 8, searchSeconds: 45, pack: "mix", names: true };

export interface Player {
  id: string;
  name: string;
  avatar: string | null;
}

export interface Topic {
  id: string;
  text: string;
  /** The player's name inside `text`, when the topic names someone. */
  name?: string;
}

/** A GIF as the room knows it: the id `media.gifs` gave, its size and description. */
export interface GifRef {
  id: string;
  w: number;
  h: number;
  alt?: string;
}

export interface Meme {
  key: string;
  gif: GifRef;
  /** Napisy: the player's caption for the round's GIF. */
  caption?: string;
}

/** Napisy: the longest caption. */
export const CAPTION_MAX = 90;

export type Phase = "lobby" | "topic" | "search" | "reveal" | "vote" | "results" | "final";

export interface RoundResult {
  /** Meme key -> author id. */
  authors: Record<string, string>;
  /** Meme key -> ids of the players who voted for it. */
  votes: Record<string, string[]>;
  /** Player id -> points this round. */
  points: Record<string, number>;
  /** Players whose meme got the most votes (none when nobody got a vote). */
  winners: string[];
  /** Players who sent nothing this round. */
  missing: string[];
}

export interface Highlight {
  round: number;
  topic: Topic | null;
  gif: GifRef;
  caption?: string;
  author: string;
  votes: number;
}

export interface Stats {
  /** Total milliseconds from the start of the search to sending, and the number of sends. */
  sendMs: Record<string, number>;
  sends: Record<string, number>;
  wins: Record<string, number>;
  streak: Record<string, number>;
  bestStreak: Record<string, number>;
  /** Rounds in which the player's meme got no vote. */
  silent: Record<string, number>;
  /** The most votes one meme got in one round. */
  best: { player: string; votes: number; round: number } | null;
}

export const emptyStats = (): Stats => ({ sendMs: {}, sends: {}, wins: {}, streak: {}, bestStreak: {}, silent: {}, best: null });

export interface Match {
  id: string;
  players: Player[];
  startedAt: number;
}

export interface GameState {
  [key: string]: unknown;
  v: 1;
  phase: Phase;
  settings: Settings;
  match: Match | null;
  /** Index of the current round. */
  round: number;
  /** Start and deadline of the current phase, in room time (`session.now()`). */
  startsAt: number;
  endsAt: number;
  /** The two topics to vote on in the topic phase. */
  choices: Topic[];
  /** Player id -> index into `choices`. */
  topicVotes: Record<string, number>;
  topic: Topic | null;
  /** Reżyser: who picks the topic and the winner this round (and doesn't search). */
  director: string | null;
  /** Napisy: the GIFs to vote on instead of topics, offered by the host. */
  gifChoices: GifRef[];
  /** Napisy: the round's GIF everyone writes a caption for. */
  roundGif: GifRef | null;
  /** Players who sent a GIF (search) or voted (vote) this round. */
  done: string[];
  /** The round's memes in reveal order, without authors. */
  memes: Meme[];
  result: RoundResult | null;
  scores: Record<string, number>;
  highlights: Highlight[];
  stats: Stats;
  /** Topic ids already drawn in this match. */
  used: string[];
  /** Rounds played to the end, shown on the final screen (fewer when the host ends early). */
  played: number;
}

export const initialState = (): GameState => ({
  v: 1,
  phase: "lobby",
  settings: { ...DEFAULT_SETTINGS },
  match: null,
  round: 0,
  startsAt: 0,
  endsAt: 0,
  choices: [],
  topicVotes: {},
  topic: null,
  director: null,
  gifChoices: [],
  roundGif: null,
  done: [],
  memes: [],
  result: null,
  scores: {},
  highlights: [],
  stats: emptyStats(),
  used: [],
  played: 0,
});

/** A player's private part of the round: their GIF and vote, tagged with match and round. */
export interface Assignment {
  match: string;
  round: number;
  gif: GifRef | null;
  /** Napisy: the caption this player wrote. */
  caption?: string | null;
  /** Milliseconds from the start of the search to sending. */
  sentMs: number | null;
  vote: string | null;
}
