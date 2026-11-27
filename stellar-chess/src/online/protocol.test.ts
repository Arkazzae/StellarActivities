import { describe, expect, it } from "vitest";
import { decide, INITIAL_STATE, Refused, replay, timeLeft, type DecideContext, type Match, type SharedState } from "./protocol";

const ROSTER = [
  { id: "ala", name: "Ala", avatar: null, connected: true },
  { id: "bob", name: "Bob", avatar: "https://example.test/bob.png", connected: true },
  { id: "cyd", name: "Cyd", avatar: null, connected: true },
];

function ctx(from: string, now = 1_000, random = () => 0.1, roster = ROSTER): DecideContext {
  return { from, now, roster, random };
}

/** Apply a command the way the host does: merge the patch into the shared state. */
function run(state: SharedState, kind: string, data: unknown, context: DecideContext): SharedState {
  const decision = decide(kind, data, state, context);
  return { ...state, ...decision.patch };
}

/** Ala challenges as White with the given clock, Bob accepts. */
function started(tc = { initial: 60, increment: 2 }): SharedState {
  let state = run(INITIAL_STATE, "challenge", { tc, color: "w" }, ctx("ala"));
  state = run(state, "accept", { challengeId: state.challenge!.id }, ctx("bob"));
  return state;
}

function play(state: SharedState, moves: [string, string, number?][]): SharedState {
  for (const [from, uci, now] of moves) {
    state = run(state, "move", { matchId: state.match!.id, ply: state.match!.moves.length, uci }, ctx(from, now ?? 2_000));
  }
  return state;
}

describe("challenges", () => {
  it("seats the challenger at the colour asked for", () => {
    const state = started();
    expect(state.challenge).toBeNull();
    expect(state.match!.players).toEqual({ w: "ala", b: "bob" });
    expect(state.match!.names).toEqual({ w: "Ala", b: "Bob" });
    expect(state.match!.avatars.b).toBe("https://example.test/bob.png");
    expect(state.match!.clock).toMatchObject({ w: 60_000, b: 60_000, running: null });
  });

  it("draws colours for a random challenge", () => {
    let state = run(INITIAL_STATE, "challenge", { tc: { initial: 0, increment: 0 }, color: "random" }, ctx("ala"));
    state = run(state, "accept", { challengeId: state.challenge!.id }, ctx("bob", 1_000, () => 0.9));
    expect(state.match!.players).toEqual({ w: "bob", b: "ala" });
  });

  it("refuses accepting your own challenge, a stale one, or one whose author left", () => {
    const state = run(INITIAL_STATE, "challenge", { tc: { initial: 0, increment: 0 }, color: "w" }, ctx("ala"));
    expect(() => decide("accept", { challengeId: state.challenge!.id }, state, ctx("ala"))).toThrow(Refused);
    expect(() => decide("accept", { challengeId: "old" }, state, ctx("bob"))).toThrow(Refused);
    const gone = ROSTER.map((entry) => (entry.id === "ala" ? { ...entry, connected: false } : entry));
    expect(() => decide("accept", { challengeId: state.challenge!.id }, state, ctx("bob", 1_000, () => 0.1, gone))).toThrow(Refused);
  });

  it("refuses odd time controls and new challenges during a game", () => {
    expect(() => decide("challenge", { tc: { initial: -1, increment: 0 } }, INITIAL_STATE, ctx("ala"))).toThrow(Refused);
    expect(() => decide("challenge", { tc: { initial: 0, increment: 5 } }, INITIAL_STATE, ctx("ala"))).toThrow(Refused);
    expect(() => decide("challenge", { tc: { initial: 60, increment: 0 } }, started(), ctx("cyd"))).toThrow(Refused);
  });

  it("lets only the author withdraw a challenge", () => {
    const state = run(INITIAL_STATE, "challenge", { tc: { initial: 60, increment: 0 } }, ctx("ala"));
    expect(run(state, "cancel", {}, ctx("bob")).challenge).not.toBeNull();
    expect(run(state, "cancel", {}, ctx("ala")).challenge).toBeNull();
  });
});

describe("moves", () => {
  it("accepts legal moves from the side to move only", () => {
    const state = started();
    const id = state.match!.id;
    expect(() => decide("move", { matchId: id, ply: 0, uci: "e7e5" }, state, ctx("bob"))).toThrow(Refused);
    expect(() => decide("move", { matchId: id, ply: 0, uci: "e2e4" }, state, ctx("cyd"))).toThrow(Refused);
    expect(() => decide("move", { matchId: id, ply: 0, uci: "e2e5" }, state, ctx("ala"))).toThrow(Refused);
    expect(() => decide("move", { matchId: "other", ply: 0, uci: "e2e4" }, state, ctx("ala"))).toThrow(Refused);
    const next = play(state, [["ala", "e2e4"]]);
    expect(next.match!.moves).toEqual(["e2e4"]);
    // The same move sent again (a retry after a lost reply) is out of date, not played twice.
    expect(() => decide("move", { matchId: id, ply: 0, uci: "e2e4" }, next, ctx("ala"))).toThrow(Refused);
  });

  it("starts the clock on White's first move and adds the increment", () => {
    let state = started({ initial: 60, increment: 2 });
    state = play(state, [["ala", "e2e4", 5_000]]);
    expect(state.match!.clock).toMatchObject({ w: 60_000, b: 60_000, running: "b", since: 5_000 });
    state = play(state, [["bob", "e7e5", 8_000]]);
    // Black spent 3 s and got 2 s back.
    expect(state.match!.clock).toMatchObject({ b: 59_000, running: "w", since: 8_000 });
    expect(timeLeft(state.match!.clock, "w", 18_000)).toBe(50_000);
  });

  it("ends the game on checkmate", () => {
    const state = play(started({ initial: 0, increment: 0 }), [["ala", "f2f3"], ["bob", "e7e5"], ["ala", "g2g4"], ["bob", "d8h4"]]);
    expect(state.match!.result).toEqual({ winner: "b", reason: "checkmate" });
    expect(() => decide("move", { matchId: state.match!.id, ply: 4, uci: "a2a3" }, state, ctx("ala"))).toThrow(Refused);
  });

  it("turns a move sent after the flag fell into a loss on time", () => {
    let state = play(started({ initial: 60, increment: 0 }), [["ala", "e2e4", 1_000]]);
    const decision = decide("move", { matchId: state.match!.id, ply: 1, uci: "e7e5" }, state, ctx("bob", 70_000));
    state = { ...state, ...decision.patch };
    expect(state.match!.result).toEqual({ winner: "w", reason: "timeout" });
    expect(state.match!.moves).toEqual(["e2e4"]);
  });

  it("replays from the shared moves alone, so a new host can carry on", () => {
    const state = play(started({ initial: 0, increment: 0 }), [["ala", "e2e4"], ["bob", "c7c5"], ["ala", "g1f3"]]);
    const fresh = JSON.parse(JSON.stringify(state)) as SharedState;
    expect(replay(fresh.match as Match).fen()).toBe(replay(state.match as Match).fen());
    expect(play(fresh, [["bob", "d7d6"]]).match!.moves).toHaveLength(4);
  });
});

describe("game end", () => {
  it("flags a side whose time ran out, as checked by the host", () => {
    const state = play(started({ initial: 60, increment: 0 }), [["ala", "e2e4", 1_000]]);
    const id = state.match!.id;
    expect(run(state, "flag", { matchId: id }, ctx("cyd", 30_000)).match!.result).toBeNull();
    expect(run(state, "flag", { matchId: id }, ctx("cyd", 62_000)).match!.result).toEqual({ winner: "w", reason: "timeout" });
  });

  it("offers, declines by moving, and agrees draws", () => {
    let state = started({ initial: 0, increment: 0 });
    const id = state.match!.id;
    state = run(state, "draw", { matchId: id }, ctx("ala"));
    expect(state.match!.drawOffer).toBe("w");
    state = play(state, [["ala", "e2e4"]]);
    expect(state.match!.drawOffer).toBe("w");
    // Black moves instead of answering: the offer lapses.
    state = play(state, [["bob", "e7e5"]]);
    expect(state.match!.drawOffer).toBeNull();
    state = run(state, "draw", { matchId: id }, ctx("bob"));
    state = run(state, "draw", { matchId: id }, ctx("ala"));
    expect(state.match!.result).toEqual({ winner: null, reason: "draw_agreement" });
  });

  it("lets a player resign and a spectator do nothing", () => {
    const state = started();
    const id = state.match!.id;
    expect(run(state, "resign", { matchId: id }, ctx("cyd")).match!.result).toBeNull();
    expect(run(state, "resign", { matchId: id }, ctx("bob")).match!.result).toEqual({ winner: "w", reason: "resignation" });
  });

  it("awards the game when the opponent has left, not before", () => {
    const state = started();
    const id = state.match!.id;
    expect(() => decide("abandon", { matchId: id }, state, ctx("ala"))).toThrow(Refused);
    const gone = ROSTER.map((entry) => (entry.id === "bob" ? { ...entry, connected: false } : entry));
    expect(run(state, "abandon", { matchId: id }, ctx("ala", 1_000, () => 0.1, gone)).match!.result).toEqual({ winner: "w", reason: "abandoned" });
  });

  it("starts a rematch with colours swapped once both ask", () => {
    let state = started({ initial: 180, increment: 0 });
    const id = state.match!.id;
    state = run(state, "resign", { matchId: id }, ctx("ala"));
    state = run(state, "rematch", { matchId: id }, ctx("ala"));
    expect(state.match!.id).toBe(id);
    state = run(state, "rematch", { matchId: id }, ctx("bob", 9_000));
    expect(state.match!.id).not.toBe(id);
    expect(state.match!.players).toEqual({ w: "bob", b: "ala" });
    expect(state.match!.tc).toEqual({ initial: 180, increment: 0 });
    expect(state.match!.result).toBeNull();
  });
});
