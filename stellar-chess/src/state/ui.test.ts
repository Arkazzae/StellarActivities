import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_ENGINE, DEFAULT_OPPONENT } from "@/ai/bots";

/** The saved progress the stores read; writes land in `written`. */
let saved: Record<string, unknown> = {};
const written = new Map<string, unknown>();

vi.mock("@/stellarr/storage", () => ({
  readSaved: (key: string) => saved[key] ?? null,
  writeSaved: (key: string, value: unknown) => written.set(key, value),
}));

async function uiWith(ui: unknown) {
  saved = { ui };
  return (await import("./ui")).useUiStore;
}

beforeEach(() => {
  vi.resetModules();
  saved = {};
  written.clear();
});

describe("saved choices", () => {
  it("starts on the menu with the default opponent when nothing is saved", async () => {
    const store = await uiWith(null);
    expect(store.getState()).toMatchObject({ view: "home", mode: "vsBot", opponent: DEFAULT_OPPONENT, timeId: "none", onlineTimeId: "5+0", onlineSide: "random" });
  });

  it("restores the opponent, match and time controls, and saves new choices", async () => {
    const store = await uiWith({ opponent: "mordax", match: { w: "glut", b: "stockfish" }, timeId: "3+2", onlineTimeId: "10+0", onlineSide: "b" });
    expect(store.getState()).toMatchObject({ opponent: "mordax", match: { w: "glut", b: "stockfish" }, timeId: "3+2", onlineTimeId: "10+0", onlineSide: "b" });

    store.getState().choose("zenek");
    store.getState().setMode("match");
    store.getState().swapMatch();
    expect(written.get("ui")).toMatchObject({ opponent: "zenek", mode: "match", match: { w: "stockfish", b: "glut" } });
  });

  it("moves a choice from the first ladder to the character on the same rung", async () => {
    const store = await uiWith({ opponent: "wiktor", match: { w: "kuba", b: "hiro" } });
    expect(store.getState()).toMatchObject({ opponent: "mordax", match: { w: "glut", b: "bogdan" } });
  });

  it("replaces unknown bots and time controls with the defaults", async () => {
    const store = await uiWith({ opponent: "thinker", match: { w: "sage", b: 3 }, timeId: "1+90", side: "purple" });
    expect(store.getState()).toMatchObject({ opponent: DEFAULT_OPPONENT, match: { w: DEFAULT_OPPONENT, b: DEFAULT_OPPONENT }, timeId: "none", side: "w" });
  });

  it("keeps engine settings within the engine's limits", async () => {
    const store = await uiWith({ engine: { vs: { skill: 99, depth: 0, moveTimeMs: 1234 } } });
    expect(store.getState().engine.vs).toEqual({ skill: 20, depth: 1, moveTimeMs: DEFAULT_ENGINE.moveTimeMs });
    store.getState().setEngine("vs", { skill: -5 });
    expect(store.getState().engine.vs.skill).toBe(0);
  });
});

describe("saved positions tab", () => {
  it("remembers the tab, the picked position, a pasted FEN and a Chess960 start", async () => {
    const store = await uiWith({ mode: "positions", positionPick: "custom", chess960: 42, customFen: "8/8/8/4k3/8/8/8/R3K3 w - - 0 1" });
    const ui = store.getState;
    expect(ui()).toMatchObject({ mode: "positions", positionPick: "custom", chess960: 42, customFen: "8/8/8/4k3/8/8/8/R3K3 w - - 0 1" });
    ui().setPositionPick("chess960");
    ui().shuffleChess960();
    expect(ui().chess960).not.toBe(42);
    expect(written.get("ui")).toMatchObject({ positionPick: "chess960", chess960: ui().chess960 });
  });

  it.each([{ positionPick: "mateIn9" }, { chess960: 960 }, { chess960: "x" }, { customFen: 7 }, "broken"])
    ("falls back to the first test position for bad saved values: %j", async (value) => {
      const state = (await uiWith(value)).getState();
      expect(state.positionPick).toBe("backRank");
      expect(Number.isInteger(state.chess960) && state.chess960 >= 0 && state.chess960 < 960).toBe(true);
      expect(typeof state.customFen).toBe("string");
    });
});

describe("time controls", () => {
  it("are in seconds, as the clock counts them", async () => {
    const { TIME_OPTIONS } = await import("./ui");
    expect(TIME_OPTIONS.find((option) => option.id === "1+0")!.tc).toEqual({ initial: 60, increment: 0 });
    expect(TIME_OPTIONS.find((option) => option.id === "15+10")!.tc).toEqual({ initial: 900, increment: 10 });
  });
});
