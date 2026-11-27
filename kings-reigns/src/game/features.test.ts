import { describe, expect, it } from "vitest";
import { INITIAL_STATE, Refused, decide, type DecideContext, type SharedState } from "./rules";
import { EMBASSY_ENABLED } from "./features";

const ola = { id: "ola", name: "Ola", avatar: null, connected: true };
const ctx = (from = "ola"): DecideContext => ({ from, now: 1_000_000, host: "ola", roster: [ola], random: () => 0.3 });

describe.runIf(!EMBASSY_ENABLED)("while Poselstwa are closed", () => {
  it("refuses switching the lobby to them", () => {
    expect(() => decide("mode", { mode: "diplomacy" }, structuredClone(INITIAL_STATE), ctx())).toThrow(Refused);
  });

  it("starts an ordinary council from a lobby left in Poselstwa", () => {
    let state: SharedState = { ...structuredClone(INITIAL_STATE), mode: "diplomacy" };
    state = { ...state, ...decide("sit", { role: "king" }, state, ctx()).patch };
    state = { ...state, ...decide("start", {}, state, ctx()).patch };
    expect(state.mode).toBe("council");
    expect(state.deck.length).toBeGreaterThan(0);
    expect(state.dispatch).toBeNull();
  });
});
