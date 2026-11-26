import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "../src/model/types.js";
import { SceneStore } from "../src/store/scene.js";
import { createRoom, settle, sync } from "./fake-room.mjs";

const rect = (patch = {}) => createElement("rectangle", { z: "a0", x: 10, y: 20, width: 100, height: 50, ...patch });

const pair = (options = {}) => {
  const room = createRoom(options.room);
  const errors = [];
  const make = () => {
    const client = room.client();
    const store = new SceneStore(client.state, { onError: (kind) => errors.push(kind), ...options.store });
    return { client, store };
  };
  const a = make();
  const b = make();
  return { room, a: a.store, b: b.store, clientA: a.client, clientB: b.client, errors };
};

const view = (store) => store.ordered().map((el) => [el.id, el.x, el.y, el.strokeColor, el.z]);

test("a local insert shows at once and reaches the other person", async () => {
  const { room, a, b } = pair();
  const el = rect();
  a.step(() => a.insert([el]));
  assert.equal(a.size, 1);
  assert.equal(b.size, 0);
  await sync(room);
  assert.equal(b.get(el.id)?.x, 10);
  assert.deepEqual(view(a), view(b));
});

test("concurrent edits of different elements both survive", async () => {
  const { room, a, b } = pair();
  const one = rect();
  const two = rect({ z: "a1", x: 300 });
  a.step(() => a.insert([one, two]));
  await sync(room);
  a.step(() => a.update(one.id, { x: 111 }));
  b.step(() => b.update(two.id, { strokeColor: "#d6402f" }));
  await sync(room);
  assert.equal(b.get(one.id)?.x, 111);
  assert.equal(a.get(two.id)?.strokeColor, "#d6402f");
  assert.deepEqual(view(a), view(b));
});

test("concurrent edits of one element converge on the later write", async () => {
  const { room, a, b } = pair();
  const el = rect();
  a.step(() => a.insert([el]));
  await sync(room);
  a.step(() => a.update(el.id, { x: 1 }));
  b.step(() => b.update(el.id, { x: 2 }));
  await sync(room);
  assert.equal(a.get(el.id)?.x, b.get(el.id)?.x);
  assert.equal(room.state[`e${el.id}`].x, a.get(el.id)?.x);
});

test("delete against an edit converges", async () => {
  const { room, a, b } = pair();
  const el = rect();
  a.step(() => a.insert([el]));
  await sync(room);
  a.step(() => a.remove([el.id]));
  b.step(() => b.update(el.id, { x: 999 }));
  await sync(room);
  assert.equal(a.has(el.id), b.has(el.id));
});

test("only one write is in flight; edits made meanwhile are batched", async () => {
  const { room, a, clientA } = pair();
  const el = rect();
  a.step(() => a.insert([el]));
  for (let step = 1; step <= 30; step += 1) a.step(() => a.update(el.id, { x: 10 + step }));
  assert.equal(clientA.writes, 1, "first write only");
  await sync(room);
  assert.ok(clientA.writes <= 3, `writes: ${clientA.writes}`);
  assert.equal(room.state[`e${el.id}`].x, 40);
});

test("undo reverts only my own steps and skips elements others changed since", async () => {
  const { room, a, b } = pair();
  const mine = rect();
  const shared = rect({ z: "a1" });
  a.step(() => a.insert([mine, shared]));
  await sync(room);
  a.step(() => a.update(mine.id, { x: 500 }));
  a.step(() => a.update(shared.id, { x: 600 }));
  await sync(room);
  b.step(() => b.update(shared.id, { x: 777 }));
  await sync(room);
  assert.ok(a.undoStep(), "undo shared move (blocked)");
  assert.ok(a.undoStep(), "undo my move");
  await sync(room);
  assert.equal(b.get(mine.id)?.x, 10, "my move reverted for everyone");
  assert.equal(b.get(shared.id)?.x, 777, "their later edit survives my undo");
  assert.ok(a.redoStep());
  await sync(room);
  assert.equal(b.get(mine.id)?.x, 500);
});

test("undo of a delete brings the element back for everyone", async () => {
  const { room, a, b } = pair();
  const el = rect({ strokeColor: "#2f6fdb" });
  a.step(() => a.insert([el]));
  await sync(room);
  a.step(() => a.remove([el.id]));
  await sync(room);
  assert.equal(b.has(el.id), false);
  a.undoStep();
  await sync(room);
  assert.equal(b.get(el.id)?.strokeColor, "#2f6fdb");
});

test("a write the room rejects is rolled back and reported", async () => {
  const { room, a, errors } = pair({ room: { stateBytes: 400 } });
  const el = rect({ text: "x".repeat(10) });
  a.step(() => a.insert([el]));
  await sync(room);
  assert.equal(a.has(el.id), true);
  a.step(() => a.update(el.id, { text: "y".repeat(500) }));
  await sync(room);
  assert.equal(a.get(el.id)?.text, "x".repeat(10));
  assert.deepEqual(errors, ["full"]);
});

test("inserting past the budget is refused locally", async () => {
  const { a, errors } = pair({ store: { stateBytes: 300 } });
  assert.equal(a.insert([rect({ text: "z".repeat(400) })]), false);
  assert.equal(a.size, 0);
  assert.deepEqual(errors, ["full"]);
});

test("an emptied room clears every client", async () => {
  const { room, a, b } = pair();
  a.step(() => a.insert([rect(), rect({ z: "a1" })]));
  await sync(room);
  assert.equal(b.size, 2);
  room.reset();
  await settle();
  assert.equal(a.size, 0);
  assert.equal(b.size, 0);
});

test("board name travels as meta", async () => {
  const { room, a, b } = pair();
  a.setMeta({ name: "Plan sprintu" });
  await sync(room);
  assert.equal(b.meta().name, "Plan sprintu");
});

test("a room that re-serialises with sorted keys: my writes stay mine and undo still works", async () => {
  const { room, a, b } = pair({ room: { sorted: true } });
  const external = [];
  a.subscribe((change) => {
    if (change.external) external.push([...change.ids]);
  });
  const el = rect({ text: "abc", groupIds: ["g1"], strokeColor: "#2f6fdb" });
  a.step(() => a.insert([el]));
  await sync(room);
  a.step(() => a.update(el.id, { x: 400 }));
  await sync(room);
  assert.deepEqual(external, [], "own writes must not echo back as external changes");
  assert.ok(Object.keys(room.state[`e${el.id}`]).every((key, index, keys) => index === 0 || keys[index - 1] < key));
  a.undoStep();
  await sync(room);
  assert.equal(b.get(el.id)?.x, 10);
  a.undoStep();
  await sync(room);
  assert.equal(b.has(el.id), false);
});

test("an element created and removed before syncing leaves no key in the room", async () => {
  const { room, a } = pair();
  const keep = rect();
  a.step(() => a.insert([keep]));
  await sync(room);
  const ghost = rect({ z: "a1" });
  a.insert([ghost]);
  a.remove([ghost.id]);
  a.beginStep();
  await sync(room);
  assert.deepEqual(Object.keys(room.state), [`e${keep.id}`]);
});
