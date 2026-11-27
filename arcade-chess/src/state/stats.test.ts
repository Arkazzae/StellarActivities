import { beforeEach, describe, expect, it, vi } from "vitest";

let saved: Record<string, unknown> = {};
const written = new Map<string, unknown>();

vi.mock("@/stellarr/storage", () => ({
  readSaved: (key: string) => saved[key] ?? null,
  writeSaved: (key: string, value: unknown) => written.set(key, value),
}));

beforeEach(() => {
  vi.resetModules();
  saved = {};
  written.clear();
});

describe("the player's record", () => {
  it("counts results per bot and online, and saves them", async () => {
    const { useStatsStore, hasBeaten } = await import("./stats");
    const stats = useStatsStore.getState;
    stats().record("glut", "w");
    stats().record("glut", "l");
    stats().record("online", "d");
    expect(stats().bots.glut).toEqual({ w: 1, d: 0, l: 1 });
    expect(stats().online).toEqual({ w: 0, d: 1, l: 0 });
    expect(hasBeaten(stats().bots, "glut")).toBe(true);
    expect(hasBeaten(stats().bots, "mordax")).toBe(false);
    expect(written.get("stats")).toMatchObject({ bots: { glut: { w: 1, d: 0, l: 1 } }, online: { w: 0, d: 1, l: 0 }, rating: { elo: 1200, games: 0 } });
  });

  it("ignores unknown bots and broken counts in a saved record", async () => {
    saved = { stats: { bots: { thinker: { w: 3 }, bogdan: { w: -1, d: 2.5, l: 4 } }, online: "x" } };
    const { useStatsStore } = await import("./stats");
    expect(useStatsStore.getState().bots).toEqual({ bogdan: { w: 0, d: 0, l: 4 } });
    expect(useStatsStore.getState().online).toEqual({ w: 0, d: 0, l: 0 });
  });
});

describe("the first ladder", () => {
  it("moves a record against the first ladder's people to the character on the same rung", async () => {
    saved = { stats: { bots: { kuba: { w: 2, d: 0, l: 1 }, wiktor: { w: 0, d: 1, l: 5 }, stockfish: { w: 0, d: 0, l: 3 } } } };
    const { useStatsStore, hasBeaten } = await import("./stats");
    expect(useStatsStore.getState().bots).toEqual({ glut: { w: 2, d: 0, l: 1 }, mordax: { w: 0, d: 1, l: 5 }, stockfish: { w: 0, d: 0, l: 3 } });
    expect(hasBeaten(useStatsStore.getState().bots, "glut")).toBe(true);
  });
});

describe("Stellarr Elo", () => {
  it("starts at 1200 and moves once per game", async () => {
    const { useStatsStore } = await import("./stats");
    const stats = useStatsStore.getState;
    expect(stats().rating).toMatchObject({ elo: 1200, peak: 1200, games: 0 });
    expect(stats().rate({ id: "m1", opponent: "Bob", outcome: "w", change: 16, at: 1 })).toBe(true);
    expect(stats().rate({ id: "m1", opponent: "Bob", outcome: "w", change: 16, at: 1 })).toBe(false);
    stats().rate({ id: "m2", opponent: "Cyd", outcome: "l", change: -20, at: 2 });
    expect(stats().rating).toMatchObject({ elo: 1196, peak: 1216, games: 2, w: 1, d: 0, l: 1 });
    expect(stats().rating.log.map((game) => game.opponent)).toEqual(["Cyd", "Bob"]);
    expect((written.get("stats") as { rating: { elo: number } }).rating.elo).toBe(1196);
  });

  it("reads a saved rating and drops what does not fit", async () => {
    saved = { stats: { rating: { elo: 1450, peak: 1500, games: 9, w: 5, d: 1, l: 3, log: [{ at: 1, opponent: "Ala", outcome: "w", change: 12, elo: 1450 }, { bad: true }], applied: ["a", 3] } } };
    const { useStatsStore } = await import("./stats");
    expect(useStatsStore.getState().rating).toMatchObject({ elo: 1450, peak: 1500, games: 9, w: 5, applied: ["a"] });
    expect(useStatsStore.getState().rating.log).toHaveLength(1);
  });

  it("starts over from a rating out of range", async () => {
    saved = { stats: { rating: { elo: 99_999 } } };
    const { useStatsStore } = await import("./stats");
    expect(useStatsStore.getState().rating.elo).toBe(1200);
  });
});
