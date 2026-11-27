import { beforeEach, describe, expect, it, vi } from "vitest";

let saved: Record<string, unknown> = {};

vi.mock("@/stellarr/storage", () => ({
  readSaved: (key: string) => saved[key] ?? null,
  writeSaved: () => undefined,
}));

beforeEach(() => {
  vi.resetModules();
  saved = {};
});

const game = (id: string, opponentId: string | null, opponent: string, at: number) => ({
  id, at, kind: "bot", opponent, opponentId, color: "w", outcome: "l", reason: "checkmate", moves: "e2e4 e7e5", startFen: "",
});

describe("saved games", () => {
  it("shows a game against the first ladder as a game against the character on the same rung", async () => {
    saved = { history: [game("a", "wiktor", "Wiktor", 2), game("b", "glut", "Glut", 1), game("c", "someone", "Someone", 0)] };
    const { useHistoryStore } = await import("./history");
    const games = useHistoryStore.getState().games;
    expect(games.map((item) => [item.opponentId, item.opponent])).toEqual([["mordax", "Mordax"], ["glut", "Glut"], [null, "Someone"]]);
  });
});
