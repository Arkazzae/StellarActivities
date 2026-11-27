/**
 * The player's recent games, kept with their Stellarr progress so the statistics page and the
 * "review your last game" shortcut survive reloads, rooms and devices. Moves are stored as UCI from
 * the starting position, which keeps 40 games well inside the 64 KiB progress limit.
 */

import { create } from "zustand";
import { Chess } from "chess.js";
import type { GameResult, PieceColor, PieceType, Square } from "@/engine/types";
import { STANDARD_FEN } from "@/engine/positions";
import { isOpponentId, type OpponentId } from "@/ai/bots";
import { readSaved, writeSaved } from "@/stellarr/storage";
import { t } from "@/i18n";
import { useGameStore } from "./game";
import { useUiStore } from "./ui";

export type GameKind = "bot" | "online" | "chaos" | "position";
export type Outcome = "w" | "d" | "l";

export interface GameRecord {
  id: string;
  /** When the game ended (epoch ms). */
  at: number;
  kind: GameKind;
  /** The opponent's name as shown at the board, and the bot's id when it was a bot. */
  opponent: string;
  opponentId: OpponentId | null;
  color: PieceColor;
  outcome: Outcome;
  reason: GameResult["reason"];
  startFen: string;
  /** UCI moves from `startFen`, space-separated. */
  moves: string;
}

const KEY = "history";
export const HISTORY_LIMIT = 40;
const DAY = 24 * 60 * 60 * 1000;

function isRecord(value: unknown): value is GameRecord {
  const r = value as Partial<GameRecord> | null;
  return !!r && typeof r.id === "string" && typeof r.at === "number" && typeof r.moves === "string"
    && (r.color === "w" || r.color === "b") && (r.outcome === "w" || r.outcome === "d" || r.outcome === "l")
    && ["bot", "online", "chaos", "position"].includes(r.kind as string) && typeof r.opponent === "string";
}

function load(): GameRecord[] {
  const saved = readSaved(KEY);
  if (!Array.isArray(saved)) return [];
  return saved.filter(isRecord).map((r) => ({ ...r, opponentId: isOpponentId(r.opponentId) ? r.opponentId : null, startFen: typeof r.startFen === "string" ? r.startFen : STANDARD_FEN }))
    .sort((a, b) => b.at - a.at).slice(0, HISTORY_LIMIT);
}

interface HistoryState {
  /** Newest first. */
  games: GameRecord[];
  add: (record: Omit<GameRecord, "id" | "at"> & { at?: number }) => void;
  /** Show a recorded game on the board, finished, with the review open. */
  openReview: (id: string) => void;
}

/** Whether a game can be replayed for analysis: Chaos effects change the board between moves, so its moves alone do not replay. */
export function canReview(record: GameRecord): boolean {
  return record.kind !== "chaos" && record.moves.length > 0;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  games: load(),
  add: (record) => {
    const at = record.at ?? Date.now();
    const entry: GameRecord = { ...record, at, id: `${at.toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}` };
    const games = [entry, ...get().games].slice(0, HISTORY_LIMIT);
    set({ games });
    writeSaved(KEY, games);
  },
  openReview: (id) => {
    const record = get().games.find((game) => game.id === id);
    if (!record || !canReview(record)) return;
    const chess = new Chess(record.startFen);
    const capturedPieces: Record<PieceColor, PieceType[]> = { w: [], b: [] };
    let lastMove: { from: Square; to: Square } | null = null;
    for (const uci of record.moves.split(" ").filter(Boolean)) {
      let move;
      try {
        move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      } catch {
        break; // a damaged record: review what replays
      }
      if (move.captured) capturedPieces[move.color === "w" ? "b" : "w"].push(move.captured as PieceType);
      lastMove = { from: move.from as Square, to: move.to as Square };
    }
    const them: PieceColor = record.color === "w" ? "b" : "w";
    const you = { userId: "player", username: t("player.you"), avatarUrl: null };
    const opponent = { userId: record.opponentId ?? `person:${record.opponent}`, username: record.opponent, avatarUrl: null };
    const winner: PieceColor | null = record.outcome === "d" ? null : record.outcome === "w" ? record.color : them;
    useGameStore.getState().reset();
    useGameStore.setState({
      chess,
      phase: "ended",
      startFen: new Chess(record.startFen).fen(),
      fen: chess.fen(),
      moves: chess.history(),
      lastMove,
      capturedPieces,
      seats: record.opponentId ? { [record.color]: null, [them]: { id: record.opponentId } } as never : { w: null, b: null },
      players: { [record.color]: you, [them]: opponent } as never,
      myColor: record.color,
      result: { winner, reason: record.reason },
      flipped: record.color === "b",
      viewPly: 0,
    });
    useUiStore.getState().setPanelTab("review");
    // "New game" from this review leads to the bot screen for that kind of game, not to an earlier mode.
    useUiStore.getState().setMode(record.kind === "position" ? "positions" : "vsBot");
    useUiStore.getState().setView("play");
  },
}));

/** The outcome for the player from a result and their colour. */
export function outcomeOf(result: GameResult, color: PieceColor): Outcome {
  return result.winner === null ? "d" : result.winner === color ? "w" : "l";
}

/** Games that ended within the last `days` days (all of them for null). */
export function within(games: GameRecord[], days: number | null, now = Date.now()): GameRecord[] {
  return days === null ? games : games.filter((game) => now - game.at < days * DAY);
}

export interface DayTally { day: number; w: number; d: number; l: number }

/** Results per calendar day, oldest first, for the last `days` days ending today. */
export function tallyByDay(games: GameRecord[], days: number, now = Date.now()): DayTally[] {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const start = today.getTime() - (days - 1) * DAY;
  const tallies: DayTally[] = Array.from({ length: days }, (_, i) => ({ day: start + i * DAY, w: 0, d: 0, l: 0 }));
  for (const game of games) {
    const index = Math.floor((game.at - start) / DAY);
    if (index >= 0 && index < days) tallies[index][game.outcome]++;
  }
  return tallies;
}

/** The longest run of wins, in time order. */
export function longestStreak(games: GameRecord[]): number {
  let best = 0;
  let run = 0;
  for (const game of [...games].sort((a, b) => a.at - b.at)) {
    run = game.outcome === "w" ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}
