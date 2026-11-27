import { test } from "node:test";
import assert from "node:assert/strict";
import { MODES } from "../game/modes.ts";
import { buildPlan } from "../game/plan.ts";
import { hashBytes, pack, unpack } from "./codec.ts";
import { cleanText } from "./game.ts";
import { initialState, rosterFor, startPatch, taskImageRefs } from "./protocol.ts";
import { revealOrder, revealedKeys } from "./reveal.ts";

test("binary packets round-trip header and payload", () => {
  const payload = new Uint8Array([0, 1, 2, 250, 255]);
  const packet = unpack<{ key: string }>(pack({ key: "3:1" }, payload));
  assert.ok(packet);
  assert.equal(packet.header.key, "3:1");
  assert.deepEqual([...packet.payload], [...payload]);
  assert.equal(unpack(new Uint8Array([0, 0, 0, 99, 1])), null, "a truncated packet is refused");
});

test("picture hashes tell different bytes apart", () => {
  assert.equal(hashBytes(new Uint8Array([1, 2, 3])), hashBytes(new Uint8Array([1, 2, 3])));
  assert.notEqual(hashBytes(new Uint8Array([1, 2, 3])), hashBytes(new Uint8Array([1, 2, 4])));
});

test("sentences are trimmed, capped and cut to four words for Telegram", () => {
  assert.equal(cleanText("  kot   na\nrowerze  ", null), "kot na rowerze");
  assert.equal(cleanText("x".repeat(300), null).length, 120);
  assert.equal(cleanText("jeden dwa trzy cztery pięć", "telegram"), "jeden dwa trzy cztery");
});

test("the roster takes connected people in join order, at most 14", () => {
  const people = Array.from({ length: 16 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, avatar: null, connected: i !== 2 }));
  const roster = rosterFor(people);
  assert.equal(roster.length, 14);
  assert.ok(!roster.some((p) => p.id === "p2"));
});

test("the shared state of a 14-player match stays far below the room limit", () => {
  for (const mode of MODES) {
    const players = Array.from({ length: 14 }, (_, i) => ({ id: `player-${i}-${"x".repeat(24)}`, name: `Gracz numer ${i}`, avatar: `https://example.org/avatars/${i}.png` }));
    const state = { ...initialState(), ...startPatch({ mode: mode.id, tempo: "normal", length: "full" }, players, "match-id", 0) };
    // At the end every sentence is revealed in state: assume the longest ones.
    const order = revealOrder(state.match!.plan);
    for (const key of order.flatMap((step) => step.keys)) state.texts[key] = "ż".repeat(120);
    const bytes = new TextEncoder().encode(JSON.stringify(state)).length;
    assert.ok(bytes < 200 * 1024, `${mode.id}: ${bytes} bytes`);
  }
});

test("the reveal walks every shown page once", () => {
  for (const mode of MODES) {
    const plan = buildPlan({ mode: mode.id, tempo: "normal", length: "full" }, 6, "s");
    const order = revealOrder(plan);
    const keys = order.flatMap((step) => step.keys);
    assert.equal(new Set(keys).size, keys.length, `${mode.id}: no page twice`);
    const shownPages = plan.albums.reduce((sum, album) => sum + (album.shown ? album.kinds.length : 0), 0);
    assert.equal(keys.length, shownPages, `${mode.id}: every shown page`);
    assert.deepEqual(revealedKeys(plan, order.length - 1), keys);
  }
});

test("tasks only ask for pictures that exist", () => {
  const plan = buildPlan({ mode: "background", tempo: "normal", length: "full" }, 6, "s");
  const refs = taskImageRefs(plan, 3, 0);
  assert.ok(refs.length >= 2, "a frame over a backdrop needs the backdrop and the previous frame");
  assert.deepEqual(taskImageRefs(plan, 99, 0), []);
});
