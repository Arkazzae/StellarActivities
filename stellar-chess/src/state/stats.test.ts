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
    stats().record("kuba", "w");
    stats().record("kuba", "l");
    stats().record("online", "d");
    expect(stats().bots.kuba).toEqual({ w: 1, d: 0, l: 1 });
    expect(stats().online).toEqual({ w: 0, d: 1, l: 0 });
    expect(hasBeaten(stats().bots, "kuba")).toBe(true);
    expect(hasBeaten(stats().bots, "wiktor")).toBe(false);
    expect(written.get("stats")).toEqual({ bots: { kuba: { w: 1, d: 0, l: 1 } }, online: { w: 0, d: 1, l: 0 } });
  });

  it("ignores unknown bots and broken counts in a saved record", async () => {
    saved = { stats: { bots: { thinker: { w: 3 }, hiro: { w: -1, d: 2.5, l: 4 } }, online: "x" } };
    const { useStatsStore } = await import("./stats");
    expect(useStatsStore.getState().bots).toEqual({ hiro: { w: 0, d: 0, l: 4 } });
    expect(useStatsStore.getState().online).toEqual({ w: 0, d: 0, l: 0 });
  });
});
