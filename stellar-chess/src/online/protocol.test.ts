import { describe, expect, it } from "vitest";
import { decide, eloChange, INITIAL_STATE, MAX_TABLES, Refused, replay, START_ELO, timeLeft, type DecideContext, type Match, type SharedState } from "./protocol";

const ROSTER = [
  { id: "ala", name: "Ala", avatar: null, connected: true },
  { id: "bob", name: "Bob", avatar: "https://example.test/bob.png", connected: true },
  { id: "cyd", name: "Cyd", avatar: null, connected: true },
  { id: "dee", name: "Dee", avatar: null, connected: true },
];

function ctx(from: string, now = 1_000, random = () => 0.1, roster = ROSTER): DecideContext {
  return { from, now, roster, random };
}

/** Apply a command the way the referee does: merge the patch into the shared state. */
function run(state: SharedState, kind: string, data: unknown, context: DecideContext): SharedState {
  const decision = decide(kind, data, state, context);
  return { ...state, ...decision.patch };
}

const gone = (id: string) => ROSTER.map((entry) => (entry.id === id ? { ...entry, connected: false } : entry));
const table = (state: SharedState, i = 0) => state.tables[i];
const match = (state: SharedState, i = 0) => state.tables[i].match!;
const ids = (state: SharedState, i = 0) => ({ tableId: table(state, i).id, matchId: match(state, i).id });

/** Ala hosts as White with the given clock, Bob joins. */
function started(tc = { initial: 60, increment: 2 }): SharedState {
  let state = run(INITIAL_STATE, "host", { tc, color: "w" }, ctx("ala"));
  state = run(state, "join", { tableId: table(state).id }, ctx("bob"));
  return state;
}

function play(state: SharedState, moves: [string, string, number?][], i = 0): SharedState {
  for (const [from, uci, now] of moves) {
    state = run(state, "move", { ...ids(state, i), ply: match(state, i).moves.length, uci }, ctx(from, now ?? 2_000));
  }
  return state;
}

describe("tables", () => {
  it("seats the host at the colour asked for when someone joins", () => {
    const state = started();
    expect(table(state)).toMatchObject({ host: "ala", hostName: "Ala", tc: { initial: 60, increment: 2 } });
    expect(match(state).players).toEqual({ w: "ala", b: "bob" });
    expect(match(state).names).toEqual({ w: "Ala", b: "Bob" });
    expect(match(state).avatars.b).toBe("https://example.test/bob.png");
    expect(match(state).clock).toMatchObject({ w: 60_000, b: 60_000, running: null });
  });

  it("draws colours at a random table", () => {
    let state = run(INITIAL_STATE, "host", { tc: { initial: 0, increment: 0 }, color: "random" }, ctx("ala"));
    state = run(state, "join", { tableId: table(state).id }, ctx("bob", 1_000, () => 0.9));
    expect(match(state).players).toEqual({ w: "bob", b: "ala" });
  });

  it("runs several games at once, one per table", () => {
    let state = started();
    state = run(state, "host", { tc: { initial: 300, increment: 0 }, color: "b" }, ctx("cyd", 3_000));
    state = run(state, "join", { tableId: table(state, 1).id }, ctx("dee", 4_000));
    expect(state.tables).toHaveLength(2);
    expect(match(state, 1).players).toEqual({ w: "dee", b: "cyd" });
    state = play(state, [["ala", "e2e4"]], 0);
    state = play(state, [["dee", "d2d4"]], 1);
    expect(match(state, 0).moves).toEqual(["e2e4"]);
    expect(match(state, 1).moves).toEqual(["d2d4"]);
  });

  it("refuses joining your own table, a closed one, a taken one, or one whose host left", () => {
    const state = run(INITIAL_STATE, "host", { tc: { initial: 0, increment: 0 }, color: "w" }, ctx("ala"));
    const tableId = table(state).id;
    expect(() => decide("join", { tableId }, state, ctx("ala"))).toThrow(Refused);
    expect(() => decide("join", { tableId: "old" }, state, ctx("bob"))).toThrow(Refused);
    expect(() => decide("join", { tableId }, state, ctx("bob", 1_000, () => 0.1, gone("ala")))).toThrow(Refused);
    const taken = run(state, "join", { tableId }, ctx("bob"));
    expect(() => decide("join", { tableId }, taken, ctx("cyd"))).toThrow(Refused);
  });

  it("keeps a player to one game: no hosting or joining while playing", () => {
    let state = started();
    expect(() => decide("host", { tc: { initial: 60, increment: 0 } }, state, ctx("bob"))).toThrow(Refused);
    state = run(state, "host", { tc: { initial: 60, increment: 0 } }, ctx("cyd"));
    expect(() => decide("join", { tableId: table(state, 1).id }, state, ctx("ala"))).toThrow(Refused);
  });

  it("closes the empty tables of someone who joins another, and lets only the host close a table", () => {
    let state = run(INITIAL_STATE, "host", { tc: { initial: 60, increment: 0 } }, ctx("ala"));
    state = run(state, "host", { tc: { initial: 180, increment: 0 } }, ctx("bob", 2_000, () => 0.7));
    expect(state.tables).toHaveLength(2);
    expect(run(state, "close", { tableId: table(state, 0).id }, ctx("bob")).tables).toHaveLength(2);
    // Bob sits down at Ala's table: his own empty table goes.
    const joined = run(state, "join", { tableId: table(state, 0).id }, ctx("bob"));
    expect(joined.tables.map((item) => item.host)).toEqual(["ala"]);
    expect(run(state, "close", { tableId: table(state, 0).id }, ctx("ala")).tables.map((item) => item.host)).toEqual(["bob"]);
    expect(() => decide("close", { tableId: table(joined).id }, joined, ctx("ala"))).toThrow(Refused);
  });

  it("clears empty tables whose host left, and refuses odd time controls", () => {
    let state = run(INITIAL_STATE, "host", { tc: { initial: 60, increment: 0 } }, ctx("ala"));
    state = run(state, "host", { tc: { initial: 60, increment: 0 } }, ctx("bob", 2_000, () => 0.1, gone("ala")));
    expect(state.tables.map((item) => item.host)).toEqual(["bob"]);
    expect(() => decide("host", { tc: { initial: -1, increment: 0 } }, INITIAL_STATE, ctx("ala"))).toThrow(Refused);
    expect(() => decide("host", { tc: { initial: 0, increment: 5 } }, INITIAL_STATE, ctx("ala"))).toThrow(Refused);
  });

  it("caps the number of tables", () => {
    const many = Array.from({ length: MAX_TABLES + 1 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, avatar: null, connected: true }));
    let state = INITIAL_STATE;
    for (let i = 0; i < MAX_TABLES; i++) state = run(state, "host", { tc: { initial: 60, increment: 0 } }, ctx(`p${i}`, 1_000 + i, () => i / 100, many));
    expect(() => decide("host", { tc: { initial: 60, increment: 0 } }, state, ctx(`p${MAX_TABLES}`, 9_000, () => 0.5, many))).toThrow(Refused);
  });

  it("closes the table when a player gets up after the game, and only then", () => {
    let state = run(started(), "resign", ids(started()), ctx("bob"));
    expect(run(state, "leave", { tableId: table(state).id }, ctx("cyd")).tables).toHaveLength(1);
    expect(run(state, "leave", { tableId: table(state).id }, ctx("bob")).tables).toHaveLength(0);
    expect(run(state, "leave", { tableId: table(state).id }, ctx("ala")).tables).toHaveLength(0);
    // Leaving a game still being played does nothing: that is what resigning is for.
    state = started();
    expect(run(state, "leave", { tableId: table(state).id }, ctx("bob")).tables[0].match!.result).toBeNull();
  });

  it("reads a room left from the one-board version as having no tables", () => {
    const old = { v: 1, challenge: null, match: null } as unknown as SharedState;
    expect(run(old, "host", { tc: { initial: 60, increment: 0 } }, ctx("ala")).tables).toHaveLength(1);
  });
});

describe("moves", () => {
  it("accepts legal moves from the side to move only", () => {
    const state = started();
    const at = ids(state);
    expect(() => decide("move", { ...at, ply: 0, uci: "e7e5" }, state, ctx("bob"))).toThrow(Refused);
    expect(() => decide("move", { ...at, ply: 0, uci: "e2e4" }, state, ctx("cyd"))).toThrow(Refused);
    expect(() => decide("move", { ...at, ply: 0, uci: "e2e5" }, state, ctx("ala"))).toThrow(Refused);
    expect(() => decide("move", { ...at, matchId: "other", ply: 0, uci: "e2e4" }, state, ctx("ala"))).toThrow(Refused);
    const next = play(state, [["ala", "e2e4"]]);
    expect(match(next).moves).toEqual(["e2e4"]);
    // The same move sent again (a retry after a lost reply) is out of date, not played twice.
    expect(() => decide("move", { ...at, ply: 0, uci: "e2e4" }, next, ctx("ala"))).toThrow(Refused);
  });

  it("starts the clock on White's first move and adds the increment", () => {
    let state = started({ initial: 60, increment: 2 });
    state = play(state, [["ala", "e2e4", 5_000]]);
    expect(match(state).clock).toMatchObject({ w: 60_000, b: 60_000, running: "b", since: 5_000 });
    state = play(state, [["bob", "e7e5", 8_000]]);
    // Black spent 3 s and got 2 s back.
    expect(match(state).clock).toMatchObject({ b: 59_000, running: "w", since: 8_000 });
    expect(timeLeft(match(state).clock, "w", 18_000)).toBe(50_000);
  });

  it("ends the game on checkmate", () => {
    const state = play(started({ initial: 0, increment: 0 }), [["ala", "f2f3"], ["bob", "e7e5"], ["ala", "g2g4"], ["bob", "d8h4"]]);
    expect(match(state).result).toEqual({ winner: "b", reason: "checkmate" });
    expect(() => decide("move", { ...ids(state), ply: 4, uci: "a2a3" }, state, ctx("ala"))).toThrow(Refused);
  });

  it("turns a move sent after the flag fell into a loss on time", () => {
    let state = play(started({ initial: 60, increment: 0 }), [["ala", "e2e4", 1_000]]);
    const decision = decide("move", { ...ids(state), ply: 1, uci: "e7e5" }, state, ctx("bob", 70_000));
    state = { ...state, ...decision.patch };
    expect(match(state).result).toEqual({ winner: "w", reason: "timeout" });
    expect(match(state).moves).toEqual(["e2e4"]);
  });

  it("replays from the shared moves alone, so a new referee can carry on", () => {
    const state = play(started({ initial: 0, increment: 0 }), [["ala", "e2e4"], ["bob", "c7c5"], ["ala", "g1f3"]]);
    const fresh = JSON.parse(JSON.stringify(state)) as SharedState;
    expect(replay(match(fresh) as Match).fen()).toBe(replay(match(state) as Match).fen());
    expect(match(play(fresh, [["bob", "d7d6"]])).moves).toHaveLength(4);
  });
});

describe("game end", () => {
  it("flags a side whose time ran out, as checked by the referee", () => {
    const state = play(started({ initial: 60, increment: 0 }), [["ala", "e2e4", 1_000]]);
    expect(match(run(state, "flag", ids(state), ctx("cyd", 30_000))).result).toBeNull();
    expect(match(run(state, "flag", ids(state), ctx("cyd", 62_000))).result).toEqual({ winner: "w", reason: "timeout" });
  });

  it("offers, declines by moving, and agrees draws", () => {
    let state = started({ initial: 0, increment: 0 });
    const at = ids(state);
    state = run(state, "draw", at, ctx("ala"));
    expect(match(state).drawOffer).toBe("w");
    state = play(state, [["ala", "e2e4"]]);
    expect(match(state).drawOffer).toBe("w");
    // Black moves instead of answering: the offer lapses.
    state = play(state, [["bob", "e7e5"]]);
    expect(match(state).drawOffer).toBeNull();
    state = run(state, "draw", at, ctx("bob"));
    state = run(state, "draw", at, ctx("ala"));
    expect(match(state).result).toEqual({ winner: null, reason: "draw_agreement" });
  });

  it("lets a player resign and a spectator do nothing", () => {
    const state = started();
    expect(match(run(state, "resign", ids(state), ctx("cyd"))).result).toBeNull();
    expect(match(run(state, "resign", ids(state), ctx("bob"))).result).toEqual({ winner: "w", reason: "resignation" });
  });

  it("awards the game when the opponent has left, not before", () => {
    const state = started();
    expect(() => decide("abandon", ids(state), state, ctx("ala"))).toThrow(Refused);
    expect(match(run(state, "abandon", ids(state), ctx("ala", 1_000, () => 0.1, gone("bob")))).result).toEqual({ winner: "w", reason: "abandoned" });
  });

  it("starts a rematch at the same table with colours swapped once both ask", () => {
    let state = started({ initial: 180, increment: 0 });
    const at = ids(state);
    state = run(state, "resign", at, ctx("ala"));
    state = run(state, "rematch", at, ctx("ala"));
    expect(match(state).id).toBe(at.matchId);
    state = run(state, "rematch", at, ctx("bob", 9_000));
    expect(table(state).id).toBe(at.tableId);
    expect(match(state).id).not.toBe(at.matchId);
    expect(match(state).players).toEqual({ w: "bob", b: "ala" });
    expect(match(state).tc).toEqual({ initial: 180, increment: 0 });
    expect(match(state).result).toBeNull();
  });
});

describe("Stellarr Elo", () => {
  it("moves ratings by the expected score, zero-sum", () => {
    expect(eloChange({ w: 1200, b: 1200 }, { winner: "w", reason: "checkmate" })).toEqual({ w: 16, b: -16 });
    expect(eloChange({ w: 1200, b: 1200 }, { winner: null, reason: "stalemate" })).toEqual({ w: 0, b: 0 });
    // Beating a much stronger player earns more than beating an equal one, losing to them costs little.
    expect(eloChange({ w: 1000, b: 1400 }, { winner: "w", reason: "resignation" }).w).toBe(29);
    expect(eloChange({ w: 1000, b: 1400 }, { winner: "b", reason: "resignation" }).w).toBe(-3);
    // A draw against a stronger player gains.
    expect(eloChange({ w: 1000, b: 1400 }, { winner: null, reason: "draw_agreement" }).w).toBeGreaterThan(0);
  });

  it("publishes a player's card from their progress, with the name from the roster", () => {
    const state = run(INITIAL_STATE, "profile", { elo: 1340, peak: 1400, games: 12, w: 7, d: 1, l: 4 }, ctx("bob", 5_000));
    expect(state.profiles.bob).toEqual({ name: "Bob", avatar: "https://example.test/bob.png", elo: 1340, peak: 1400, games: 12, w: 7, d: 1, l: 4, at: 5_000 });
    expect(() => decide("profile", { elo: 99_999 }, state, ctx("bob"))).toThrow(Refused);
    expect(() => decide("profile", { elo: "high" }, state, ctx("bob"))).toThrow(Refused);
    expect(() => decide("profile", { elo: 1300, w: -1 }, state, ctx("bob"))).toThrow(Refused);
  });

  it("rates a game from both players' cards and records it in the results", () => {
    let state = run(INITIAL_STATE, "profile", { elo: 1000 }, ctx("ala"));
    state = run(state, "profile", { elo: 1400, peak: 1450, games: 30, w: 20, d: 2, l: 8 }, ctx("bob"));
    state = run(state, "host", { tc: { initial: 0, increment: 0 }, color: "w" }, ctx("ala"));
    state = run(state, "join", { tableId: table(state).id }, ctx("bob"));
    expect(match(state).ratings).toEqual({ w: 1000, b: 1400 });
    expect(match(state).ratingChange).toBeNull();
    state = run(state, "resign", ids(state), ctx("bob", 9_000));
    expect(match(state).ratingChange).toEqual({ w: 29, b: -29 });
    expect(state.profiles.ala).toMatchObject({ elo: 1029, peak: 1029, games: 1, w: 1, d: 0, l: 0 });
    expect(state.profiles.bob).toMatchObject({ elo: 1371, peak: 1450, games: 31, w: 20, d: 2, l: 9 });
    expect(state.results).toHaveLength(1);
    expect(state.results[0]).toMatchObject({ names: { w: "Ala", b: "Bob" }, result: { winner: "w", reason: "resignation" }, change: { w: 29, b: -29 }, at: 9_000 });
  });

  it("rates players with no card from the start rating, on every way a game ends", () => {
    const mate = play(started({ initial: 0, increment: 0 }), [["ala", "f2f3"], ["bob", "e7e5"], ["ala", "g2g4"], ["bob", "d8h4"]]);
    expect(match(mate).ratings).toEqual({ w: START_ELO, b: START_ELO });
    expect(match(mate).ratingChange).toEqual({ w: -16, b: 16 });
    expect(mate.profiles.bob).toMatchObject({ elo: START_ELO + 16, w: 1, games: 1 });
    expect(mate.results[0].result.reason).toBe("checkmate");

    const ticking = play(started({ initial: 60, increment: 0 }), [["ala", "e2e4", 1_000]]);
    const flagged = run(ticking, "flag", ids(ticking), ctx("ala", 70_000));
    expect(flagged.results[0]).toMatchObject({ result: { winner: "w", reason: "timeout" }, change: { w: 16, b: -16 } });

    const left = started();
    expect(run(left, "abandon", ids(left), ctx("ala", 1_000, () => 0.1, gone("bob"))).results[0].change).toEqual({ w: 16, b: -16 });
  });

  it("keeps a rematch rated from the cards after the first game", () => {
    let state = started({ initial: 180, increment: 0 });
    const at = ids(state);
    state = run(state, "resign", at, ctx("bob"));
    state = run(state, "rematch", at, ctx("ala"));
    state = run(state, "rematch", at, ctx("bob", 9_000));
    expect(match(state).ratings).toEqual({ w: START_ELO - 16, b: START_ELO + 16 });
  });

  it("reads a room without cards or results", () => {
    const old = { v: 2, tables: [] } as unknown as SharedState;
    expect(run(old, "profile", { elo: 1200 }, ctx("ala")).profiles.ala.elo).toBe(1200);
    const hosted = run(old, "host", { tc: { initial: 0, increment: 0 }, color: "w" }, ctx("ala"));
    const joined = run(hosted, "join", { tableId: table(hosted).id }, ctx("bob"));
    expect(run(joined, "resign", ids(joined), ctx("bob")).results).toHaveLength(1);
  });
});
