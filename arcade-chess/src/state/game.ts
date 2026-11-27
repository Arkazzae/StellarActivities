/**
 * Core game state store (Zustand).
 * Single source of truth for the chess game.
 */

import { create } from "zustand";
import { Chess } from "chess.js";
import type {
  Square,
  PieceColor,
  PieceType,
  Move,
  Arrow,
  CircleHighlight,
  GamePhase,
  GameResult,
  TimeControl,
  PlayerInfo,
} from "@/engine/types";
import {
  createClock,
  isUnlimited,
  startClock,
  stopClock,
  switchClock,
  type ClockState,
} from "@/engine/clock";
import * as ChessEngine from "@/engine/chess";
import {
  CHAOS_DRAFT_INTERVAL,
  CHAOS_EFFECT_BY_ID,
  applyImmediateChaosEffect,
  chooseChaosTargetsForBot,
  createActiveChaosEffect,
  createChaosDraft,
  createEmptyChaosSnapshot,
  createPendingChaosChoice,
  getAvailableChaosEffects,
  getChaosTargetCount,
  getChaosTargetSquares,
  historyEntry,
  normalizeChaosSan,
  resolveChaosMove,
  type ChaosEffectId,
  type ChaosSnapshot,
} from "@/engine/chaos";
import { followMove, markChanges, type PieceMarks } from "@/engine/chaos-marks";
import { STANDARD_FEN, type Verdict } from "@/engine/positions";
import type { Seat } from "@/ai/bots";

export interface GameState {
  // ── Core ──
  chess: Chess;
  phase: GamePhase;
  /** The position the game started from: the usual one, or one set up on the bot screen. */
  startFen: string;
  fen: string;
  moves: string[]; // SAN history
  lastMove: { from: Square; to: Square } | null;
  capturedPieces: Record<PieceColor, PieceType[]>;

  // ── Players ──
  players: { w: PlayerInfo | null; b: PlayerInfo | null };
  /** The bot on each side; null where the player sits. */
  seats: { w: Seat | null; b: Seat | null };
  myColor: PieceColor | null; // null = watching: bots play both sides, or someone else's online game
  /** A game between people in the voice channel, mirrored from the room's shared state. */
  online: { matchId: string } | null;

  // ── Clock ──
  clock: ClockState;
  timeControl: TimeControl;

  // ── Game end ──
  result: GameResult | null;
  /** A test from the Positions tab: the colour solving it (the player), and whether they did. */
  solver: PieceColor | null;
  verdict: Verdict | null;
  drawOffer: string | null; // userId who offered

  // ── Board interaction ──
  selectedSquare: Square | null;
  legalMoves: Square[];
  premove: { from: Square; to: Square; promotion?: string } | null;
  arrows: Arrow[];
  circles: CircleHighlight[];
  flipped: boolean;

  // ── UI ──
  promotionPending: { from: Square; to: Square } | null;
  /** Chaos Chess: drafts every four moves, active effects and their history (disabled otherwise). */
  chaos: ChaosSnapshot;
  /** A puzzle drill (Puzzle Rush, a theme): the drill checks the moves; no result, history or game-over card. */
  drill: boolean;
  /** Chaos Chess: the pieces an effect made or changed, by square. */
  chaosMarks: PieceMarks;
  /**
   * Chaos Chess: the board after every ply (index 0 is the start). Effects change the board between
   * moves, so the move history alone cannot replay a Chaos game.
   */
  chaosTimeline: ChaosPly[];
  /** The bot's own evaluation after its last move, in centipawns from White. */
  evaluation: number | null;
  /** Half-move shown on the board while browsing the move list; null = the live position. */
  viewPly: number | null;
  /** Watching two bots: no new moves (and no clock) until resumed. */
  paused: boolean;

  // ── Actions ──
  /** The player takes the side without a bot; with bots on both sides the player watches. */
  newGame: (opts: {
    timeControl: TimeControl;
    seats: { w: Seat | null; b: Seat | null };
    players: { w: PlayerInfo | null; b: PlayerInfo | null };
    /** A valid, normalised FEN (see parsePosition); the usual starting position when left out. */
    startFen?: string;
    /** The colour that solves the position, for a test from the Positions tab. */
    solver?: PieceColor | null;
    /** Play Chaos Chess. */
    chaos?: boolean;
    /** A puzzle drill: the player takes this side and the drill answers for the other. */
    drill?: PieceColor;
  }) => void;
  /** Chaos Chess: pick one of the draft's cards for its chooser (a bot picks its targets too). */
  chooseChaosEffect: (effectId: ChaosEffectId) => boolean;
  /** Chaos Chess: the player points at a square for the card being played. */
  chooseChaosTarget: (square: Square) => boolean;
  /** Chaos Chess: back from targeting to the same three cards. */
  cancelChaosTarget: () => void;
  /** Show an online game as the room has it: the whole position, clock and result at once. */
  loadOnline: (game: {
    matchId: string;
    myColor: PieceColor | null;
    players: { w: PlayerInfo; b: PlayerInfo };
    timeControl: TimeControl;
    startFen: string;
    /** UCI moves from the start position. */
    moves: string[];
    clock: ClockState;
    result: GameResult | null;
  }) => void;
  /** Record a test's outcome; a test decided before the game ends (a mate in 2 missed) stops it. */
  setVerdict: (verdict: Verdict) => void;
  /** Before a game: show the position it will start from. */
  previewStart: (fen: string) => void;
  loadPosition: (
    fen: string,
    moves: string[],
    capturedPieces?: Record<PieceColor, PieceType[]>,
  ) => void;
  selectSquare: (square: Square | null) => void;
  tryMove: (from: Square, to: Square) => Move | "promotion" | null;
  confirmPromotion: (piece: string) => Move | null;
  cancelPromotion: () => void;
  applyMove: (move: Move) => void;
  setPremove: (premove: { from: Square; to: Square; promotion?: string } | null) => void;
  setEvaluation: (evaluation: number | null) => void;
  setResult: (result: GameResult) => void;
  setDrawOffer: (userId: string | null) => void;
  tickClock: () => void;
  flipBoard: () => void;
  setArrows: (arrows: Arrow[]) => void;
  setCircles: (circles: CircleHighlight[]) => void;
  clearAnnotations: () => void;
  setPhase: (phase: GamePhase) => void;
  /** Take back moves until it is the player's turn again (one full move against the bot). */
  takeback: () => number;
  setViewPly: (ply: number | null) => void;
  setPaused: (paused: boolean) => void;
  reset: () => void;

}

const DEFAULT_TC: TimeControl = { initial: 0, increment: 0 };

const NO_SEATS = { w: null, b: null };

/** A game between two bots: the player only watches. */
export function isSpectating(state: Pick<GameState, "seats">): boolean {
  return state.seats.w !== null && state.seats.b !== null;
}

/** The player cannot touch the pieces: two bots play, or someone else's online game is on. */
export function isWatching(state: Pick<GameState, "seats" | "online" | "myColor">): boolean {
  return isSpectating(state) || (state.online !== null && state.myColor === null);
}

/** Whether a bot makes the moves for this colour. */
export function botMovesFor(state: Pick<GameState, "seats">, color: PieceColor): boolean {
  return state.seats[color] !== null;
}

/** Whether any bot is at the board. */
export function hasBot(state: Pick<GameState, "seats">): boolean {
  return state.seats.w !== null || state.seats.b !== null;
}

export interface ChaosPly {
  fen: string;
  lastMove: { from: Square; to: Square } | null;
}

/** The position an engine is given: the start and the moves, or in Chaos (effects change the board between moves) the board as it stands. */
export function enginePosition(state: Pick<GameState, "chess" | "startFen" | "chaos">): { startFen: string; moves: string[] } {
  if (state.chaos.enabled) return { startFen: state.chess.fen(), moves: [] };
  return {
    startFen: state.startFen,
    moves: state.chess.history({ verbose: true }).map((move) => `${move.from}${move.to}${move.promotion ?? ""}`),
  };
}

/** Play a drafted card: its immediate effect, its lasting effect, the next chooser or the clock again. */
function completeChaosEffectChoice(
  state: GameState,
  effectId: ChaosEffectId,
  selectedSquares: readonly Square[] = [],
): Pick<GameState, "fen" | "clock" | "chaos" | "chaosMarks" | "chaosTimeline" | "selectedSquare" | "legalMoves" | "premove" | "capturedPieces"> | null {
  const draft = state.chaos.draft;
  if (!state.chaos.enabled || !draft || !draft.options.includes(effectId)) return null;
  const timed = !isUnlimited(state.timeControl);
  const definition = CHAOS_EFFECT_BY_ID[effectId];
  const seed = `${state.fen}:${draft.round}:${draft.chooser}:${effectId}`;
  const boardBefore = state.chess.board();
  const immediate = applyImmediateChaosEffect(state.chess, state.clock, effectId, draft.chooser, seed, timed, selectedSquares);
  const activeEffects = { w: [...state.chaos.activeEffects.w], b: [...state.chaos.activeEffects.b] };
  if (definition.duration !== "instant") {
    activeEffects[draft.chooser].push(createActiveChaosEffect(definition, draft.chooser, state.moves.length, seed));
  }
  const pickedEffectIds = { w: [...state.chaos.pickedEffectIds.w], b: [...state.chaos.pickedEffectIds.b] };
  if (!pickedEffectIds[draft.chooser].includes(effectId)) pickedEffectIds[draft.chooser].push(effectId);
  const history = [...state.chaos.history, historyEntry(state.moves.length, draft.chooser, effectId, "picked")].slice(-120);

  const [nextChooser, ...remainingChoosers] = draft.remainingChoosers;
  const nextDraft = nextChooser
    ? createChaosDraft(
        draft.round,
        nextChooser,
        pickedEffectIds[nextChooser],
        state.chess.fen(),
        remainingChoosers,
        timed,
        getAvailableChaosEffects(state.chess, nextChooser, timed, activeEffects[nextChooser].map((effect) => effect.effectId)),
      )
    : null;
  let clock = immediate.clock;
  if (!nextDraft && state.phase === "playing" && timed && state.moves.length > 0) {
    clock = startClock(clock, state.chess.turn() as PieceColor);
  }
  return {
    fen: state.chess.fen(),
    clock,
    capturedPieces: capturedFrom(state.chess, state.startFen),
    chaos: { ...state.chaos, draft: nextDraft, pendingChoice: null, activeEffects, pickedEffectIds, history },
    chaosMarks: markChanges(state.chaosMarks, boardBefore, state.chess.board(), [{ effectId, owner: draft.chooser }], state.moves.length),
    // The cards change the board before the next move: the ply's position is the one after them.
    chaosTimeline: state.chaosTimeline.map((ply, index) => index === state.chaosTimeline.length - 1 ? { ...ply, fen: state.chess.fen() } : ply),
    selectedSquare: null,
    legalMoves: [],
    premove: null,
  };
}

/** Pieces missing from each side compared with the start (Chaos can add and remove pieces). */
function capturedFrom(chess: Chess, startFen: string): Record<PieceColor, PieceType[]> {
  const count = (board: ReturnType<Chess["board"]>) => {
    const tally: Record<string, number> = {};
    for (const piece of board.flat()) if (piece) tally[piece.color + piece.type] = (tally[piece.color + piece.type] ?? 0) + 1;
    return tally;
  };
  const before = count(new Chess(startFen).board());
  const now = count(chess.board());
  const captured: Record<PieceColor, PieceType[]> = { w: [], b: [] };
  for (const color of ["w", "b"] as const) {
    for (const type of ["q", "r", "b", "n", "p"] as const) {
      const missing = (before[color + type] ?? 0) - (now[color + type] ?? 0);
      for (let i = 0; i < missing; i++) captured[color].push(type);
    }
  }
  return captured;
}

export const useGameStore = create<GameState>((set, get) => ({
  // ── Initial state ──
  chess: new Chess(),
  phase: "lobby",
  startFen: STANDARD_FEN,
  fen: STANDARD_FEN,
  moves: [],
  lastMove: null,
  capturedPieces: { w: [], b: [] },
  players: { w: null, b: null },
  seats: NO_SEATS,
  myColor: null,
  online: null,
  clock: createClock(DEFAULT_TC),
  timeControl: DEFAULT_TC,
  result: null,
  solver: null,
  verdict: null,
  drawOffer: null,
  selectedSquare: null,
  legalMoves: [],
  premove: null,
  arrows: [],
  circles: [],
  flipped: false,
  promotionPending: null,
  chaos: createEmptyChaosSnapshot(),
  drill: false,
  chaosMarks: {},
  chaosTimeline: [],
  evaluation: null,
  viewPly: null,
  paused: false,

  // ── Actions ──

  newGame: ({ timeControl, seats, players, startFen = STANDARD_FEN, solver = null, chaos = false, drill }) => {
    const chess = new Chess(startFen);
    // With one bot the player has the other side; with none it is a local game for two, with two the player watches.
    const myColor: PieceColor | null = drill ?? ((seats.w === null) === (seats.b === null) ? null : seats.w === null ? "w" : "b");
    set({
      chess,
      phase: "playing",
      startFen: chess.fen(),
      fen: chess.fen(),
      moves: [],
      lastMove: null,
      capturedPieces: { w: [], b: [] },
      players,
      seats,
      myColor,
      online: null,
      clock: createClock(timeControl),
      timeControl,
      result: null,
      solver,
      verdict: null,
      drawOffer: null,
      selectedSquare: null,
      legalMoves: [],
      premove: null,
      arrows: [],
      circles: [],
      // A test is watched from the solver's side.
      flipped: (solver ?? myColor) === "b",
      promotionPending: null,
      chaos: createEmptyChaosSnapshot(chaos),
      drill: !!drill,
      chaosMarks: {},
      chaosTimeline: chaos ? [{ fen: startFen, lastMove: null }] : [],
      evaluation: null,
      viewPly: null,
      paused: false,
    });
  },

  loadOnline: ({ matchId, myColor, players, timeControl, startFen, moves, clock, result }) => {
    const chess = new Chess(startFen);
    const capturedPieces: Record<PieceColor, PieceType[]> = { w: [], b: [] };
    let lastMove: GameState["lastMove"] = null;
    for (const uci of moves) {
      const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      if (move.captured) capturedPieces[move.color === "w" ? "b" : "w"].push(move.captured as PieceType);
      lastMove = { from: move.from as Square, to: move.to as Square };
    }
    const same = get().online?.matchId === matchId && get().myColor === myColor;
    set({
      chess,
      phase: result ? "ended" : "playing",
      startFen: new Chess(startFen).fen(),
      fen: chess.fen(),
      moves: chess.history(),
      lastMove,
      capturedPieces,
      players,
      seats: NO_SEATS,
      myColor,
      online: { matchId },
      clock,
      timeControl,
      result,
      solver: null,
      verdict: null,
      drawOffer: null,
      selectedSquare: null,
      legalMoves: [],
      premove: null,
      promotionPending: null,
      chaos: createEmptyChaosSnapshot(),
      drill: false,
      chaosMarks: {},
      chaosTimeline: [],
      arrows: [],
      circles: [],
      evaluation: null,
      paused: false,
      // A fresh game faces the player's colour; a reload of the same one keeps how it was turned and browsed.
      ...(same ? {} : { flipped: myColor === "b", viewPly: null }),
    });
  },

  previewStart: (fen) => {
    if (get().phase !== "lobby" || get().fen === fen) return;
    const chess = new Chess(fen);
    set({ chess, startFen: chess.fen(), fen: chess.fen(), lastMove: null, arrows: [], circles: [] });
  },

  loadPosition: (_fen, moves, _savedCapturedPieces) => {
    const chess = new Chess();
    const validMoves: string[] = [];
    const capturedPieces: Record<PieceColor, PieceType[]> = { w: [], b: [] };

    for (const san of moves) {
      try {
        const result = chess.move(san);
        if (!result) break;
        validMoves.push(san);
        if (result.captured) {
          const loser: PieceColor = result.color === "w" ? "b" : "w";
          capturedPieces[loser].push(result.captured as PieceType);
        }
      } catch {
        console.error(`loadPosition: invalid move "${san}" at position ${chess.fen()}`);
        break;
      }
    }

    set({
      chess,
      fen: chess.fen(),
      moves: validMoves,
      capturedPieces,
    });
  },

  selectSquare: (square) => {
    const {
      chess,
      myColor,
      phase,
      selectedSquare: prevSelected,
    } = get();
    if (phase !== "playing" || isWatching(get())) return;
    const { chaos } = get();
    // Chaos: a card waiting for its target takes the click; during a draft the board is still.
    if (chaos.pendingChoice) {
      if (square) get().chooseChaosTarget(square);
      return;
    }
    if (chaos.draft) return;

    if (!square) {
      set({ selectedSquare: null, legalMoves: [] });
      return;
    }

    const turn = ChessEngine.getTurn(chess);

    // Off-turn: premove territory
    if (myColor && turn !== myColor) {
      const piece = ChessEngine.getPiece(chess, square);
      if (piece?.color === myColor) {
        // Clicking another own piece changes the premove origin. Clicking the
        // selected origin again cancels the selection.
        set({
          selectedSquare: prevSelected === square ? null : square,
          legalMoves: [],
        });
      } else if (prevSelected) {
        const originPiece = ChessEngine.getPiece(chess, prevSelected);
        const promotion =
          originPiece?.type === "p" && (square[1] === "1" || square[1] === "8")
            ? "q"
            : undefined;
        set({
          premove: { from: prevSelected, to: square, promotion },
          selectedSquare: null,
          legalMoves: [],
        });
      } else {
        set({ selectedSquare: null, legalMoves: [], premove: null });
      }
      return;
    }

    const piece = ChessEngine.getPiece(chess, square);
    if (piece && piece.color === turn) {
      const legal = ChessEngine.getLegalMoves(chess, square);
      set({
        selectedSquare: square,
        legalMoves: legal.map((m) => m.to),
      });
    } else {
      set({ selectedSquare: null, legalMoves: [] });
    }
  },

  tryMove: (from, to) => {
    const { chess, myColor } = get();
    const turn = ChessEngine.getTurn(chess);
    if (isWatching(get()) || (myColor && turn !== myColor) || get().chaos.draft) return null;

    // Check if promotion
    const piece = ChessEngine.getPiece(chess, from);
    if (
      piece?.type === "p" &&
      ((piece.color === "w" && to[1] === "8") ||
        (piece.color === "b" && to[1] === "1"))
    ) {
      set({ promotionPending: { from, to } });
      return "promotion";
    }

    const move = ChessEngine.makeMove(chess, from, to);
    if (!move) return null;

    get().applyMove(move);

    return move;
  },

  confirmPromotion: (piece) => {
    const { chess, promotionPending } = get();
    if (!promotionPending || get().chaos.draft) return null;

    const move = ChessEngine.makeMove(
      chess,
      promotionPending.from,
      promotionPending.to,
      piece
    );
    if (!move) {
      set({ promotionPending: null });
      return null;
    }

    get().applyMove(move);

    return move;
  },

  cancelPromotion: () => set({ promotionPending: null }),

  applyMove: (move) => {
    const state = get();
    const { chess } = state;
    const nextMoves = [...state.moves, move.san];
    const capturedPieces = {
      w: [...state.capturedPieces.w],
      b: [...state.capturedPieces.b],
    };
    if (move.captured) {
      const loser: PieceColor = move.color === "w" ? "b" : "w";
      capturedPieces[loser].push(move.captured);
    }
    let nextClock = state.clock;

    if (!isUnlimited(state.timeControl)) {
      nextClock = nextClock.running
        ? switchClock(nextClock, state.timeControl.increment)
        : startClock(nextClock, chess.turn() as PieceColor);
    }

    let nextChaos = state.chaos;
    let chaosMarks = state.chaosMarks;
    let chaosTimeline = state.chaosTimeline;
    if (nextChaos.enabled) {
      const timed = !isUnlimited(state.timeControl);
      const boardAfterMove = chess.board();
      const seen = new Set(nextChaos.history.map((entry) => entry.id));
      const resolution = resolveChaosMove(chess, nextClock, nextChaos.activeEffects, nextChaos.history, move, nextMoves.length);
      const triggered = resolution.history.filter((entry) => entry.kind === "triggered" && !seen.has(entry.id));
      chaosMarks = markChanges(followMove(chaosMarks, move), boardAfterMove, chess.board(), triggered, nextMoves.length);
      chaosTimeline = [...chaosTimeline, { fen: chess.fen(), lastMove: { from: move.from as Square, to: move.to as Square } }];
      nextClock = resolution.clock;
      nextChaos = { ...nextChaos, activeEffects: resolution.activeEffects, history: resolution.history };
      nextMoves[nextMoves.length - 1] = normalizeChaosSan(chess, move.san);
      const canContinue = !ChessEngine.isCheckmate(chess) && !ChessEngine.isStalemate(chess) && (!timed || (nextClock.w > 0 && nextClock.b > 0));
      if (nextMoves.length % CHAOS_DRAFT_INTERVAL === 0 && canContinue) {
        const round = nextChaos.round + 1;
        const first: PieceColor = round % 2 === 1 ? "w" : "b";
        const second: PieceColor = first === "w" ? "b" : "w";
        nextClock = stopClock(nextClock);
        nextChaos = {
          ...nextChaos,
          round,
          pendingChoice: null,
          draft: createChaosDraft(
            round,
            first,
            nextChaos.pickedEffectIds[first],
            chess.fen(),
            [second],
            timed,
            getAvailableChaosEffects(chess, first, timed, nextChaos.activeEffects[first].map((effect) => effect.effectId)),
          ),
        };
      }
    }

    set({
      fen: chess.fen(),
      moves: nextMoves,
      chaos: nextChaos,
      chaosMarks,
      chaosTimeline,
      lastMove: { from: move.from as Square, to: move.to as Square },
      // Chaos summons, forges and removes pieces, so the tally comes from the board itself.
      capturedPieces: nextChaos.enabled ? capturedFrom(chess, state.startFen) : capturedPieces,
      clock: nextClock,
      selectedSquare: null,
      legalMoves: [],
      premove:
        state.premove && state.myColor && move.color !== state.myColor && !nextChaos.draft
          ? state.premove
          : null,
      promotionPending: null,
      arrows: [],
      circles: [],
      viewPly: null,
    });
  },

  setPremove: (premove) => set({ premove }),

  setEvaluation: (evaluation) => set({ evaluation }),

  setResult: (result) => {
    const state = get();
    set({
      result,
      phase: "ended",
      clock: stopClock(state.clock),
      chaos: { ...state.chaos, draft: null, pendingChoice: null },
    });
  },

  setVerdict: (verdict) => {
    const { phase, clock, verdict: decided } = get();
    if (decided) return;
    set(phase === "playing" ? { verdict, phase: "ended", clock: stopClock(clock), paused: false } : { verdict });
  },

  setDrawOffer: (userId) => set({ drawOffer: userId }),

  tickClock: () => {
    const { clock } = get();
    if (!clock.running) return;
    // Just trigger re-render; actual time is computed in getTimeRemaining
    set({ clock: { ...clock } });
  },

  flipBoard: () => set({ flipped: !get().flipped }),

  setArrows: (arrows) => set({ arrows }),
  setCircles: (circles) => set({ circles }),
  clearAnnotations: () => set({ arrows: [], circles: [] }),

  chooseChaosEffect: (effectId) => {
    const state = get();
    const draft = state.chaos.draft;
    if (!state.chaos.enabled || !draft || state.chaos.pendingChoice || !draft.options.includes(effectId)) return false;
    const botChooses = state.seats[draft.chooser] !== null;
    // A person points at the board for a targeted card; a bot picks its own targets.
    const pendingChoice = botChooses ? null : createPendingChaosChoice(state.chess, effectId, draft.chooser);
    if (pendingChoice) {
      set({ chaos: { ...state.chaos, pendingChoice }, selectedSquare: null, legalMoves: [], premove: null });
      return true;
    }
    const targets = botChooses ? chooseChaosTargetsForBot(state.chess, effectId, draft.chooser, `${state.fen}:${draft.round}:${draft.chooser}:${effectId}:bot`) : [];
    const update = completeChaosEffectChoice(state, effectId, targets);
    if (!update) return false;
    set(update);
    return true;
  },

  chooseChaosTarget: (square) => {
    const state = get();
    const pending = state.chaos.pendingChoice;
    if (!pending || !getChaosTargetSquares(state.chess, pending).includes(square)) return false;
    const selectedSquares = [...pending.selectedSquares, square];
    if (selectedSquares.length < getChaosTargetCount(pending.effectId)) {
      set({ chaos: { ...state.chaos, pendingChoice: { ...pending, selectedSquares } } });
      return true;
    }
    const update = completeChaosEffectChoice(state, pending.effectId, selectedSquares);
    if (!update) return false;
    set(update);
    return true;
  },

  cancelChaosTarget: () => {
    const state = get();
    if (!state.chaos.pendingChoice) return;
    set({ chaos: { ...state.chaos, pendingChoice: null }, selectedSquare: null, legalMoves: [] });
  },

  setPhase: (phase) => set({ phase }),

  takeback: () => {
    const { chess, myColor, phase, online, chaos } = get();
    // Chaos effects cannot be undone, so neither can moves.
    if (phase !== "playing" || !myColor || online || chaos.enabled) return 0;
    let undone = 0;
    while (chess.history().length > 0 && (undone === 0 || chess.turn() !== myColor)) {
      chess.undo();
      undone++;
    }
    if (!undone) return 0;
    const history = chess.history({ verbose: true });
    const capturedPieces: Record<PieceColor, PieceType[]> = { w: [], b: [] };
    for (const move of history) if (move.captured) capturedPieces[move.color === "w" ? "b" : "w"].push(move.captured as PieceType);
    const last = history.at(-1);
    set({
      fen: chess.fen(),
      moves: history.map((move) => move.san),
      lastMove: last ? { from: last.from as Square, to: last.to as Square } : null,
      capturedPieces,
      selectedSquare: null,
      legalMoves: [],
      premove: null,
      promotionPending: null,
      arrows: [],
      circles: [],
      viewPly: null,
    });
    return undone;
  },

  setViewPly: (ply) => {
    const total = get().moves.length;
    set({ viewPly: ply === null || ply >= total ? null : Math.max(0, ply), selectedSquare: null, legalMoves: [] });
  },

  setPaused: (paused) => {
    const { phase, clock, online } = get();
    if (phase !== "playing" || !isSpectating(get()) || online) return;
    // The next bot move starts the clock again.
    set({ paused, clock: paused ? stopClock(clock) : clock });
  },

  reset: () => {
    set({
      chess: new Chess(),
      phase: "lobby",
      startFen: STANDARD_FEN,
      fen: STANDARD_FEN,
      moves: [],
      lastMove: null,
      capturedPieces: { w: [], b: [] },
      players: { w: null, b: null },
      seats: NO_SEATS,
      myColor: null,
      online: null,
      clock: createClock(DEFAULT_TC),
      timeControl: DEFAULT_TC,
      result: null,
      solver: null,
      verdict: null,
      drawOffer: null,
      selectedSquare: null,
      legalMoves: [],
      premove: null,
      arrows: [],
      circles: [],
      promotionPending: null,
      chaos: createEmptyChaosSnapshot(),
      drill: false,
      chaosMarks: {},
      chaosTimeline: [],
      evaluation: null,
      viewPly: null,
      paused: false,
    });
  },
}));
