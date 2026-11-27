/**
 * Interface state that is not part of the chess game: which page is open, the
 * choices on the bot screen (opponent, match pairing, engine settings), the hint
 * arrow and toasts. Persisted choices are saved with the player's Stellarr progress.
 */

import { create } from "zustand";
import { DEFAULT_ENGINE, DEFAULT_OPPONENT, getOpponent, normalizeEngine, type EngineConfig, type OpponentId } from "@/ai/bots";
import { readSaved, writeSaved } from "@/stellarr/storage";
import type { PieceColor, Square, TimeControl } from "@/engine/types";
import { PICKS, randomChess960, type PositionPick } from "@/engine/positions";

/** The statistics page (the start page), the board, the multiplayer room, puzzles, the ladder and the Chaos Chess menu. */
export type View = "home" | "play" | "online" | "puzzles" | "ladder" | "chaos";
export type PanelTab = "game" | "review";
export type SideChoice = "w" | "random" | "b";
/** Play against a bot, pair two bots and watch, play a bot from a chosen position, or Chaos Chess. */
export type PlayMode = "vsBot" | "match" | "positions" | "chaos";
/** Engine settings are kept per place: the opponent in a game against the player, and each side of a match. */
export type EngineSlot = "vs" | PieceColor;

export interface TimeOption {
  id: string;
  label: string;
  tc: TimeControl;
}

/** Time controls in seconds, as the clock counts them. */
export const TIME_OPTIONS: TimeOption[] = [
  { id: "none", label: "No limit", tc: { initial: 0, increment: 0 } },
  { id: "1+0", label: "1 min", tc: { initial: 60, increment: 0 } },
  { id: "3+2", label: "3 | 2", tc: { initial: 180, increment: 2 } },
  { id: "5+0", label: "5 min", tc: { initial: 300, increment: 0 } },
  { id: "10+0", label: "10 min", tc: { initial: 600, increment: 0 } },
  { id: "15+10", label: "15 | 10", tc: { initial: 900, increment: 10 } },
];

interface Saved {
  mode: PlayMode;
  /** The bot the player faces. */
  opponent: OpponentId;
  /** The bot the player faces in Chaos Chess (one of the Chaos characters). */
  chaosOpponent: OpponentId;
  /** The two bots of a match. */
  match: Record<PieceColor, OpponentId>;
  engine: Record<EngineSlot, EngineConfig>;
  side: SideChoice;
  timeId: string;
  /** Time control and colour of the next challenge in the voice channel. */
  onlineTimeId: string;
  onlineSide: SideChoice;
  showEval: boolean;
  /** The position picked in the Positions tab. */
  positionPick: PositionPick;
  /** The Chess960 start number (0–959). */
  chess960: number;
  /** The FEN as typed or pasted; checked whenever it is used. */
  customFen: string;
}

const KEY = "ui";

function opponentId(value: unknown): OpponentId {
  return getOpponent(typeof value === "string" ? value : null).id;
}

function timeId(value: unknown): string | undefined {
  return TIME_OPTIONS.some((option) => option.id === value) ? value as string : undefined;
}

function sideChoice(value: unknown): SideChoice | undefined {
  return value === "w" || value === "b" || value === "random" ? value : undefined;
}

/** The saved choices, each checked; anything unknown falls back to its default. */
function load(): Partial<Saved> {
  const saved = readSaved(KEY) as Partial<Record<keyof Saved, unknown>> | null;
  if (!saved || typeof saved !== "object") return {};
  const match = (saved.match ?? {}) as Partial<Record<PieceColor, unknown>>;
  const engine = (saved.engine ?? {}) as Partial<Record<EngineSlot, unknown>>;
  const chess960 = Number(saved.chess960);
  return {
    mode: saved.mode === "match" || saved.mode === "positions" || saved.mode === "chaos" ? saved.mode : "vsBot",
    opponent: opponentId(saved.opponent),
    chaosOpponent: getOpponent(typeof saved.chaosOpponent === "string" ? saved.chaosOpponent : null).kind === "chaos" ? saved.chaosOpponent as OpponentId : undefined,
    match: { w: opponentId(match.w), b: opponentId(match.b) },
    engine: { vs: normalizeEngine(engine.vs), w: normalizeEngine(engine.w), b: normalizeEngine(engine.b) },
    side: sideChoice(saved.side),
    timeId: timeId(saved.timeId),
    onlineTimeId: timeId(saved.onlineTimeId),
    onlineSide: sideChoice(saved.onlineSide),
    showEval: typeof saved.showEval === "boolean" ? saved.showEval : undefined,
    positionPick: PICKS.includes(saved.positionPick as PositionPick) ? saved.positionPick as PositionPick : undefined,
    chess960: Number.isInteger(chess960) && chess960 >= 0 && chess960 < 960 ? chess960 : undefined,
    customFen: typeof saved.customFen === "string" ? saved.customFen.slice(0, 200) : undefined,
  };
}

interface UiState extends Saved {
  /** The side of the match the bot picker is changing. */
  matchSide: PieceColor;
  view: View;
  panelTab: PanelTab;
  hint: { from: Square; to: Square } | null;
  hintLoading: boolean;
  toast: { id: number; text: string } | null;
  settingsOpen: boolean;
  /** The PGN dialog (downloads are blocked inside Stellarr, so the game is copied instead). */
  pgnOpen: boolean;
  setView: (view: View) => void;
  setPanelTab: (tab: PanelTab) => void;
  setMode: (mode: PlayMode) => void;
  /** Seat a bot: the opponent, or the match side being changed. */
  choose: (id: OpponentId) => void;
  /** Pick the Chaos Chess opponent. */
  chooseChaos: (id: OpponentId) => void;
  setMatchSide: (side: PieceColor) => void;
  swapMatch: () => void;
  setEngine: (slot: EngineSlot, patch: Partial<EngineConfig>) => void;
  setSide: (side: SideChoice) => void;
  setTimeId: (id: string) => void;
  setOnlineTimeId: (id: string) => void;
  setOnlineSide: (side: SideChoice) => void;
  setShowEval: (show: boolean) => void;
  setPositionPick: (pick: PositionPick) => void;
  /** Deal a new Chess960 start. */
  shuffleChess960: () => void;
  setCustomFen: (fen: string) => void;
  setHint: (hint: { from: Square; to: Square } | null) => void;
  setHintLoading: (loading: boolean) => void;
  showToast: (text: string) => void;
  setSettingsOpen: (open: boolean) => void;
  setPgnOpen: (open: boolean) => void;
}

/** Read when the store is first used, after the saved progress has loaded. */
const initial = load();

export const useUiStore = create<UiState>((set, get) => {
  const persist = () => {
    const { mode, opponent, chaosOpponent, match, engine, side, timeId, onlineTimeId, onlineSide, showEval, positionPick, chess960, customFen } = get();
    writeSaved(KEY, { mode, opponent, chaosOpponent, match, engine, side, timeId, onlineTimeId, onlineSide, showEval, positionPick, chess960, customFen });
  };
  return {
    view: "home",
    panelTab: "game",
    mode: initial.mode ?? "vsBot",
    opponent: initial.opponent ?? DEFAULT_OPPONENT,
    chaosOpponent: initial.chaosOpponent ?? "iskra",
    match: initial.match ?? { w: "tomek", b: "diego" },
    engine: initial.engine ?? { vs: DEFAULT_ENGINE, w: DEFAULT_ENGINE, b: DEFAULT_ENGINE },
    matchSide: "w",
    side: initial.side ?? "w",
    timeId: initial.timeId ?? "none",
    onlineTimeId: initial.onlineTimeId ?? "5+0",
    onlineSide: initial.onlineSide ?? "random",
    showEval: initial.showEval ?? true,
    positionPick: initial.positionPick ?? PICKS[0],
    chess960: initial.chess960 ?? randomChess960(),
    customFen: initial.customFen ?? "",
    hint: null,
    hintLoading: false,
    toast: null,
    settingsOpen: false,
    pgnOpen: false,
    setView: (view) => set({ view }),
    setPanelTab: (panelTab) => set({ panelTab }),
    setMode: (mode) => { set({ mode }); persist(); },
    choose: (id) => {
      const { mode, match, matchSide } = get();
      set(mode === "match" ? { match: { ...match, [matchSide]: id } } : { opponent: id });
      persist();
    },
    chooseChaos: (chaosOpponent) => { set({ chaosOpponent }); persist(); },
    setMatchSide: (matchSide) => set({ matchSide }),
    swapMatch: () => {
      const { match, engine } = get();
      set({ match: { w: match.b, b: match.w }, engine: { ...engine, w: engine.b, b: engine.w } });
      persist();
    },
    setEngine: (slot, patch) => {
      set({ engine: { ...get().engine, [slot]: normalizeEngine({ ...get().engine[slot], ...patch }) } });
      persist();
    },
    setSide: (side) => { set({ side }); persist(); },
    setTimeId: (timeId) => { set({ timeId }); persist(); },
    setOnlineTimeId: (onlineTimeId) => { set({ onlineTimeId }); persist(); },
    setOnlineSide: (onlineSide) => { set({ onlineSide }); persist(); },
    setShowEval: (showEval) => { set({ showEval }); persist(); },
    setPositionPick: (positionPick) => { set({ positionPick }); persist(); },
    shuffleChess960: () => {
      let chess960 = randomChess960();
      while (chess960 === get().chess960) chess960 = randomChess960();
      set({ chess960 });
      persist();
    },
    setCustomFen: (customFen) => { set({ customFen: customFen.slice(0, 200) }); persist(); },
    setHint: (hint) => set({ hint }),
    setHintLoading: (hintLoading) => set({ hintLoading }),
    showToast: (text) => set({ toast: { id: Date.now(), text } }),
    setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
    setPgnOpen: (pgnOpen) => set({ pgnOpen }),
  };
});

export function timeOption(id: string): TimeOption {
  return TIME_OPTIONS.find((option) => option.id === id) ?? TIME_OPTIONS[0];
}
