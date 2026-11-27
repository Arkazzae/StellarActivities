/**
 * Chaos Chess pieces with a story: the pawn forged into a knight, the summoned pawn, the iron pawn
 * that came back, the officer cursed into a pawn, the queen restored. The engine only changes the
 * board; these marks remember which effect made a piece, follow it as it moves, and pick its art.
 */

import type { Chess } from "chess.js";
import type { ChaosEffectId } from "./chaos";
import type { PieceColor, PieceType, Square } from "./types";

export type PieceVariant = "forged" | "summoned" | "iron" | "cursed" | "reborn";

export interface PieceMark {
  variant: PieceVariant;
  effectId: ChaosEffectId;
  /** Who played the card. */
  owner: PieceColor;
  /** The ply after which it happened. */
  ply: number;
}

export type PieceMarks = Partial<Record<Square, PieceMark>>;

type Board = ReturnType<Chess["board"]>;
type Cell = Board[number][number];

/** Effects that move pieces around rather than create them: a mark travels with its piece. */
const MOVERS = new Set<ChaosEffectId>(["blink", "gravity_well", "tactical_reset", "chaos_swap", "piece_storm"]);
/** Effects that turn the opponent's pieces into pawns. */
const CURSES = new Set<ChaosEffectId>(["cursed_square", "thorn_mail"]);

const FILES = "abcdefgh";
const NAMES: Record<PieceType, string> = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };
/** The variant art that exists in public/pieces/chaos. */
const ART = new Set(["pawn-cursed", "pawn-iron", "pawn-summoned", "knight-forged", "bishop-forged", "rook-forged", "knight-reborn", "queen-reborn"]);

const squareAt = (row: number, col: number) => `${FILES[col]}${8 - row}` as Square;
const same = (a: Cell, b: Cell) => (!a && !b) || (!!a && !!b && a.color === b.color && a.type === b.type);

/** The image for a piece, its Chaos variant when there is art for it. */
export function pieceArt(color: PieceColor, type: PieceType, mark?: PieceMark): string {
  const name = mark ? `${NAMES[type]}-${mark.variant}` : "";
  return mark && ART.has(name) ? `pieces/chaos/${color}-${name}.webp` : `pieces/${color}${type}.webp`;
}

/** Marks follow their pieces through an ordinary move; a captured or promoted piece loses its mark. */
export function followMove(
  marks: PieceMarks,
  move: { from: string; to: string; flags: string; color: PieceColor },
): PieceMarks {
  const next = { ...marks };
  const mark = next[move.from as Square];
  delete next[move.from as Square];
  delete next[move.to as Square];
  if (move.flags.includes("e")) delete next[`${move.to[0]}${move.from[1]}` as Square];
  if (mark && !move.flags.includes("p")) next[move.to as Square] = mark;
  const rank = move.color === "w" ? "1" : "8";
  const rook = move.flags.includes("k") ? ["h", "f"] : move.flags.includes("q") ? ["a", "d"] : null;
  if (rook) {
    const rookMark = next[`${rook[0]}${rank}` as Square];
    delete next[`${rook[0]}${rank}` as Square];
    if (rookMark) next[`${rook[1]}${rank}` as Square] = rookMark;
  }
  return next;
}

/**
 * Mark the pieces an effect created or changed between two boards. `effects` are the cards that
 * took effect (the one just played, or the ones that triggered on a move), with their owners.
 */
export function markChanges(
  marks: PieceMarks,
  before: Board,
  after: Board,
  effects: readonly { effectId: ChaosEffectId; owner: PieceColor }[],
  ply: number,
): PieceMarks {
  if (!effects.length) return marks;
  const next = { ...marks };
  const gone: { square: Square; cell: Cell }[] = [];
  const came: { square: Square; cell: NonNullable<Cell>; was: Cell }[] = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const was = before[row][col];
      const now = after[row][col];
      if (same(was, now)) continue;
      const square = squareAt(row, col);
      if (was) gone.push({ square, cell: was });
      if (now) came.push({ square, cell: now, was });
    }
  }

  // A moved piece keeps its story: pair each arrival with a departure of the same piece.
  const moving = effects.some((effect) => MOVERS.has(effect.effectId));
  const carried = new Map<Square, PieceMark | undefined>();
  if (moving) {
    for (const arrival of came) {
      const index = gone.findIndex((departure) => same(departure.cell, arrival.cell));
      if (index < 0) continue;
      carried.set(arrival.square, marks[gone[index].square]);
      delete next[gone[index].square];
      gone.splice(index, 1);
    }
  }
  for (const departure of gone) delete next[departure.square];

  for (const arrival of came) {
    delete next[arrival.square];
    if (carried.has(arrival.square)) {
      const mark = carried.get(arrival.square);
      if (mark) next[arrival.square] = mark;
      continue;
    }
    const { cell, was } = arrival;
    const curse = cell.type === "p" && was && was.type !== "p"
      ? effects.find((effect) => CURSES.has(effect.effectId) && effect.owner !== cell.color)
      : undefined;
    const effect = curse ?? effects.find((item) => item.owner === cell.color) ?? effects[0];
    const variant: PieceVariant = curse ? "cursed"
      : effect.effectId === "iron_pawns" ? "iron"
      : !was ? (cell.type === "p" ? "summoned" : "reborn")
      : "forged";
    next[arrival.square] = { variant, effectId: effect.effectId, owner: effect.owner, ply };
  }
  return next;
}
