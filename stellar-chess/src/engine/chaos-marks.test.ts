import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { followMove, markChanges, pieceArt, type PieceMarks } from "./chaos-marks";

const board = (fen: string) => new Chess(fen).board();

describe("Chaos piece marks", () => {
  it("marks a pawn forged into a knight and picks the forged art", () => {
    const before = board("4k3/8/8/8/8/8/7P/4K3 w - - 0 1");
    const after = board("4k3/8/8/8/8/8/7N/4K3 w - - 0 1");
    const marks = markChanges({}, before, after, [{ effectId: "knight_forge", owner: "w" }], 8);
    expect(marks.h2).toMatchObject({ variant: "forged", effectId: "knight_forge", owner: "w", ply: 8 });
    expect(pieceArt("w", "n", marks.h2)).toBe("pieces/chaos/w-knight-forged.webp");
  });

  it("tells a summoned pawn from an iron one and a restored officer", () => {
    const before = board("4k3/8/8/8/8/8/8/4K3 w - - 0 1");
    const summoned = markChanges({}, before, board("4k3/8/8/8/8/8/3P4/4K3 w - - 0 1"), [{ effectId: "pawn_bloom", owner: "w" }], 8);
    expect(summoned.d2?.variant).toBe("summoned");
    const iron = markChanges({}, before, board("4k3/4p3/8/8/8/8/8/4K3 w - - 0 1"), [{ effectId: "iron_pawns", owner: "b" }], 9);
    expect(iron.e7?.variant).toBe("iron");
    const reborn = markChanges({}, before, board("4k3/8/8/8/8/8/8/3QK3 w - - 0 1"), [{ effectId: "second_wind", owner: "w" }], 16);
    expect(reborn.d1?.variant).toBe("reborn");
    expect(pieceArt("w", "q", reborn.d1)).toBe("pieces/chaos/w-queen-reborn.webp");
  });

  it("curses the opponent's officer that became a pawn", () => {
    const before = board("4k3/8/8/3n4/8/8/8/4K3 w - - 0 1");
    const after = board("4k3/8/8/3p4/8/8/8/4K3 w - - 0 1");
    const marks = markChanges({}, before, after, [{ effectId: "cursed_square", owner: "w" }], 11);
    expect(marks.d5).toMatchObject({ variant: "cursed", owner: "w" });
  });

  it("keeps a mark on a piece an effect moves", () => {
    const marks: PieceMarks = { b1: { variant: "forged", effectId: "knight_forge", owner: "w", ply: 8 } };
    const after = markChanges(marks, board("4k3/8/8/8/8/8/8/1N2K3 w - - 0 1"), board("4k3/8/8/3N4/8/8/8/4K3 w - - 0 1"), [{ effectId: "blink", owner: "w" }], 16);
    expect(after.b1).toBeUndefined();
    expect(after.d5?.variant).toBe("forged");
  });

  it("follows a piece through ordinary moves, castling, captures and promotion", () => {
    const forged = { variant: "forged", effectId: "rook_forge", owner: "w", ply: 8 } as const;
    expect(followMove({ e2: forged }, { from: "e2", to: "e4", flags: "b", color: "w" })).toEqual({ e4: forged });
    expect(followMove({ h1: forged }, { from: "e1", to: "g1", flags: "k", color: "w" })).toEqual({ f1: forged });
    expect(followMove({ d5: forged }, { from: "c4", to: "d5", flags: "c", color: "b" })).toEqual({});
    expect(followMove({ b7: forged }, { from: "b7", to: "b8", flags: "np", color: "w" })).toEqual({});
  });

  it("falls back to the ordinary piece when a variant has no art", () => {
    expect(pieceArt("b", "q", { variant: "forged", effectId: "chain_reaction", owner: "b", ply: 3 })).toBe("pieces/bq.webp");
    expect(pieceArt("b", "q")).toBe("pieces/bq.webp");
  });
});
