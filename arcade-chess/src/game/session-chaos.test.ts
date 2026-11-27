import { describe, expect, it } from "vitest";
import type { Move } from "@/engine/types";
import { useGameStore } from "@/state/game";
import { useHistoryStore } from "@/state/history";
import { useStatsStore } from "@/state/stats";
import { finishGame } from "./session";

describe("finishing a Chaos game", () => {
  it("keeps the board the cards changed, records the game and leaves the ladder alone", () => {
    useGameStore.getState().reset();
    useGameStore.getState().newGame({
      timeControl: { initial: 0, increment: 0 },
      seats: { w: null, b: { id: "glut" } },
      players: {
        w: { userId: "player", username: "Player", avatarUrl: null },
        b: { userId: "glut", username: "Glut", avatarUrl: null },
      },
      chaos: true,
    });
    const { chess } = useGameStore.getState();
    useGameStore.getState().applyMove(chess.move("e4") as unknown as Move);
    useGameStore.getState().applyMove(chess.move("e5") as unknown as Move);
    // A card moves the e4 pawn away, as Blink would: chess.js history no longer matches the board.
    chess.remove("e4");
    chess.put({ type: "p", color: "w" }, "d3");
    const fen = chess.fen();
    const before = useStatsStore.getState().bots.glut;

    expect(() => finishGame({ winner: "w", reason: "resignation" })).not.toThrow();
    expect(useGameStore.getState().chess.fen()).toBe(fen);
    expect(useHistoryStore.getState().games[0]).toMatchObject({ kind: "chaos", opponentId: "glut", outcome: "w", moves: "e2e4 e7e5" });
    expect(useStatsStore.getState().bots.glut).toEqual(before);
  });
});
