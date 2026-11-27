/**
 * Puzzle drills on the board: Puzzle Rush (three minutes of mates in one, three mistakes and it is
 * over) and theme drills (bank puzzles of one theme, one after another, each moving the puzzle
 * rating). The drill loads each position as a game with no bots and no result (`drill` in the game
 * store), watches the player's moves, answers a mate in two with the defence, and judges.
 */

import { create } from "zustand";
import type { Move, PieceColor, Square } from "@/engine/types";
import { dailyBankPuzzle, rushQueue, themePuzzles, type BankPuzzle, type PuzzleTheme } from "@/engine/puzzle-bank";
import { playMoveSound } from "@/sounds";
import { t } from "@/i18n";
import { useGameStore } from "./game";
import { usePuzzleStore } from "./puzzles";
import { useUiStore } from "./ui";

export const RUSH_MS = 180_000;
export const RUSH_LIVES = 3;

/** Puzzle Rush, a theme, or the puzzle of the day (one bank puzzle). */
export type DrillKind = "rush" | "theme" | "daily";

interface DrillState {
  kind: DrillKind | null;
  theme: PuzzleTheme | null;
  queue: BankPuzzle[];
  index: number;
  /** Which move of the solution the player plays next (0, then 2 in a mate in two). */
  step: number;
  score: number;
  mistakes: number;
  /** When a Puzzle Rush run ends. */
  endsAt: number | null;
  over: boolean;
  /** How the last move was judged, until the next position loads. */
  feedback: "good" | "bad" | null;
  /** A theme puzzle missed: its solution is on the board until the player moves on. */
  revealed: boolean;
  start: (kind: DrillKind, theme?: PuzzleTheme) => void;
  next: () => void;
  /** The same position again (the puzzle of the day after a miss). */
  retry: () => void;
  /** Leave the drill (another screen, or the player gives up). */
  stop: () => void;
}

let timers: number[] = [];
/** Bank puzzles already missed this session: a second try does not move the rating again. */
const missed = new Set<string>();
const later = (fn: () => void, ms: number) => timers.push(setTimeout(fn, ms) as unknown as number);
const clearTimers = () => {
  timers.forEach((id) => clearTimeout(id));
  timers = [];
};

const sideOf = (fen: string): PieceColor => (fen.split(" ")[1] === "b" ? "b" : "w");
const squares = (uci: string) => ({ from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square });

/** Put a puzzle on the board: the player takes the side to move; nobody sits on the other side. */
function show(puzzle: BankPuzzle): void {
  const side = sideOf(puzzle.fen);
  const other: PieceColor = side === "w" ? "b" : "w";
  useGameStore.getState().newGame({
    timeControl: { initial: 0, increment: 0 },
    seats: { w: null, b: null },
    players: {
      [side]: { userId: "player", username: t("player.you"), avatarUrl: null },
      [other]: { userId: "puzzle", username: t("drill.defender"), avatarUrl: null },
    } as never,
    startFen: puzzle.fen,
    drill: side,
  });
}

export const useDrillStore = create<DrillState>((set, get) => ({
  kind: null,
  theme: null,
  queue: [],
  index: 0,
  step: 0,
  score: 0,
  mistakes: 0,
  endsAt: null,
  over: false,
  feedback: null,
  revealed: false,

  start: (kind, theme) => {
    clearTimers();
    const solved = new Set(usePuzzleStore.getState().bankSolved);
    const queue = kind === "rush"
      ? rushQueue()
      : kind === "daily" ? [dailyBankPuzzle()]
      // A theme starts with the puzzles not yet solved, easiest first.
      : [...themePuzzles(theme!)].sort((a, b) => Number(solved.has(a.id)) - Number(solved.has(b.id)) || a.rating - b.rating);
    if (!queue.length) return;
    set({ kind, theme: theme ?? null, queue, index: 0, step: 0, score: 0, mistakes: 0, over: false, feedback: null, revealed: false, endsAt: kind === "rush" ? Date.now() + RUSH_MS : null });
    if (kind === "rush") later(() => finish(), RUSH_MS);
    useUiStore.getState().setHint(null);
    useUiStore.getState().setView("play");
    show(queue[0]);
  },

  next: () => {
    const { queue, index, kind, over } = get();
    if (!kind || over) return;
    const nextIndex = index + 1;
    if (nextIndex >= queue.length) return finish();
    set({ index: nextIndex, step: 0, feedback: null, revealed: false });
    show(queue[nextIndex]);
  },

  retry: () => {
    const { queue, index, kind } = get();
    if (!kind || !queue[index]) return;
    clearTimers();
    set({ step: 0, feedback: null, revealed: false });
    show(queue[index]);
  },

  stop: () => {
    clearTimers();
    set({ kind: null, theme: null, queue: [], over: false, feedback: null, revealed: false, endsAt: null });
  },
}));

/** The run is over: Puzzle Rush keeps its score; the board stays as it is. */
function finish(): void {
  const { kind, score, mistakes, over } = useDrillStore.getState();
  if (!kind || over) return;
  clearTimers();
  useDrillStore.setState({ over: true, endsAt: null });
  // The board stops taking moves (no result: no game-over card).
  useGameStore.setState({ phase: "ended", selectedSquare: null, legalMoves: [], premove: null });
  if (kind === "rush") usePuzzleStore.getState().recordRush(score, mistakes);
}

function judge(): void {
  const drill = useDrillStore.getState();
  const puzzle = drill.queue[drill.index];
  const game = useGameStore.getState();
  if (!drill.kind || drill.over || drill.feedback || !puzzle || !game.drill) return;
  const last = game.chess.history({ verbose: true }).at(-1);
  if (!last || last.color !== game.myColor) return;
  const uci = `${last.from}${last.to}${last.promotion ?? ""}`;
  const finalStep = drill.step >= puzzle.moves.length - 1;
  const mate = game.chess.isCheckmate();

  if (uci === puzzle.moves[drill.step] || (finalStep && mate)) {
    if (!finalStep && !mate) {
      // The key move of a mate in two: the defence answers.
      useDrillStore.setState({ step: drill.step + 2 });
      later(() => {
        const live = useGameStore.getState();
        const reply = puzzle.moves[drill.step + 1];
        const move = live.chess.move({ ...squares(reply), promotion: reply[4] });
        live.applyMove(move as unknown as Move);
        playMoveSound(move);
      }, 380);
      return;
    }
    useDrillStore.setState({ score: drill.score + 1, feedback: "good" });
    if (drill.kind !== "rush") {
      // A puzzle moves the rating the first time it is met, not when it is solved again.
      const firstTime = !usePuzzleStore.getState().bankSolved.includes(puzzle.id) && !missed.has(puzzle.id);
      if (firstTime) usePuzzleStore.getState().rate(puzzle.rating, true);
      usePuzzleStore.getState().markSolved(puzzle.id);
    }
    if (drill.kind === "daily") {
      usePuzzleStore.getState().markDaily();
      useGameStore.setState({ phase: "ended", selectedSquare: null, legalMoves: [] });
      return;
    }
    later(() => useDrillStore.getState().next(), drill.kind === "rush" ? 450 : 900);
    return;
  }

  // A wrong move is taken back and the right one drawn on the board (after the board's own
  // clean-up of annotations that follows every move).
  const mistakes = drill.mistakes + 1;
  useDrillStore.setState({ mistakes, feedback: "bad", revealed: drill.kind !== "rush" });
  const right = squares(puzzle.moves[drill.step]);
  later(() => {
    useGameStore.getState().takeback();
    useGameStore.getState().setArrows([{ ...right, color: "green" }]);
  }, 0);
  if (drill.kind !== "rush") {
    if (!usePuzzleStore.getState().bankSolved.includes(puzzle.id) && !missed.has(puzzle.id)) usePuzzleStore.getState().rate(puzzle.rating, false);
    missed.add(puzzle.id);
    return;
  }
  later(() => (mistakes >= RUSH_LIVES ? finish() : useDrillStore.getState().next()), 1100);
}

useGameStore.subscribe((state, previous) => {
  if (state.drill && state.moves.length > previous.moves.length) judge();
});
