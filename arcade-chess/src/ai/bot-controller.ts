/**
 * Bot controller: one per game, holding both seats and asking whoever is to move. The characters
 * and Stockfish search with the Stockfish player worker. If the engine cannot be loaded there is
 * no substitute: the caller surfaces the failure instead.
 */

import { getCharacter, getOpponent, type Seat } from "./bots";
import { choosePersonaMove, queenMoves, scoreOf, type Candidate } from "./persona";
import { stockfishPlayer } from "./stockfish-player";
import type { PieceColor } from "@/engine/types";

export interface BotMoveDecision {
  move: string;
  thinkTime: number;
  /** Evaluation before the bot move, from White's perspective. */
  positionEvaluation: number | null;
  /** Evaluation of the selected candidate, from White's perspective. */
  selectedEvaluation: number | null;
}

export interface MoveRequest {
  fen: string;
  /** The position the game started from. */
  startFen: string;
  /** The game's moves so far in UCI, from the starting position. */
  history: string[];
  /** Half-moves into the opening (see openingPly): infinite for a game set up from another position. */
  halfMoves: number;
  /** The bot's remaining clock time; null when the game is untimed. */
  remainingMs: number | null;
}

/** Stockfish's time for a move: its own limit, cut to a slice of the clock when one runs. */
export function getEngineMoveTime(limitMs: number, remainingMs: number | null): number {
  if (remainingMs === null) return limitMs;
  return Math.round(Math.max(100, Math.min(limitMs, remainingMs / 35)));
}

/** How long a bot may sit on a move it already found: its own pace, never more than a slice of the clock. */
export function getThinkBudget(thinkDelay: number, remainingMs: number | null): number {
  if (remainingMs === null) return thinkDelay;
  return Math.min(thinkDelay, Math.round(Math.max(350, Math.min(5000, remainingMs / 35))));
}

function sideToMove(fen: string): PieceColor {
  return fen.split(" ")[1] === "b" ? "b" : "w";
}

export class BotController {
  private readonly seats: Record<PieceColor, Seat | null>;

  constructor(seats: Record<PieceColor, Seat | null>) {
    this.seats = seats;
  }

  async init(): Promise<void> {
    stockfishPlayer.newGame();
  }

  async getMove(request: MoveRequest): Promise<BotMoveDecision> {
    const seat = this.seats[sideToMove(request.fen)];
    if (!seat) throw new Error("It is the player's move, not the bot's.");
    const opponent = getOpponent(seat.id);
    const startedAt = performance.now();
    const decision = opponent.kind === "engine" ? await this.engineMove(seat, request) : await this.characterMove(seat, request);
    const elapsed = performance.now() - startedAt;
    const delay = getThinkBudget(opponent.bot.thinkDelay, request.remainingMs);
    // The thinking itself is the pause; only top up when the answer came instantly (forced move, shallow search).
    return { ...decision, thinkTime: Math.max(60, Math.round(delay * 0.5 - elapsed)) };
  }
  private async engineMove(seat: Seat, { fen, startFen, history, remainingMs }: MoveRequest): Promise<Omit<BotMoveDecision, "thinkTime">> {
    const config = seat.engine!;
    const result = await stockfishPlayer.search({
      startFen, moves: history, skill: config.skill, depth: config.depth, lines: 1, moveTimeMs: getEngineMoveTime(config.moveTimeMs, remainingMs),
    });
    if (!result.best) throw new Error("Stockfish found no move.");
    const toWhite = sideToMove(fen) === "w" ? 1 : -1;
    const main = result.lines[0];
    const chosen = result.lines.find((line) => line.uci === result.best);
    return {
      move: result.best,
      positionEvaluation: main ? scoreOf(main) * toWhite : null,
      selectedEvaluation: chosen ? scoreOf(chosen) * toWhite : null,
    };
  }

  private async characterMove(seat: Seat, { fen, startFen, history, halfMoves, remainingMs }: MoveRequest): Promise<Omit<BotMoveDecision, "thinkTime">> {
    const { style } = getCharacter(seat.id)!;
    const search = { startFen, moves: history, skill: 20, depth: style.depth, moveTimeMs: getEngineMoveTime(style.moveTimeMs, remainingMs) };
    const result = await stockfishPlayer.search({ ...search, lines: style.lines });
    const candidates: Candidate[] = result.lines.map((line) => ({ uci: line.uci, score: scoreOf(line) }));
    // Stockfish rarely ranks an early queen sortie among its best lines; a queen lover looks at them anyway.
    if (style.queenBonus > 0 && halfMoves < style.queenUntilPly) {
      const queen = queenMoves(fen);
      if (queen.length && !candidates.some((candidate) => queen.includes(candidate.uci))) {
        const sortie = await stockfishPlayer.search({ ...search, lines: Math.min(3, queen.length), only: queen });
        candidates.push(...sortie.lines.map((line) => ({ uci: line.uci, score: scoreOf(line) })));
      }
    }
    const chosen = choosePersonaMove(fen, candidates, style, halfMoves);
    const toWhite = sideToMove(fen) === "w" ? 1 : -1;
    return {
      move: chosen.uci,
      positionEvaluation: candidates.length ? candidates[0].score! * toWhite : null,
      selectedEvaluation: chosen.score === null ? null : chosen.score * toWhite,
    };
  }

  destroy(): void {
    stockfishPlayer.cancel();
  }
}
