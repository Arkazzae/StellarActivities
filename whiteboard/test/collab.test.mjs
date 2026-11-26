import assert from "node:assert/strict";
import { test } from "node:test";
import { Backup, boardPatch, packBoard, unpackBoard } from "../src/collab/backup.js";
import { Assembler, CHUNK_CHARS, splitFile } from "../src/collab/files.js";
import { createElement } from "../src/model/types.js";
import { SceneStore } from "../src/store/scene.js";
import { createRoom, sync } from "./fake-room.mjs";

const fakeImage = (size) => `data:image/png;base64,${"A".repeat(size)}`;

test("an image split into chunks reassembles in any order", () => {
  const data = fakeImage(CHUNK_CHARS * 3 + 17);
  const chunks = splitFile("img1", data);
  assert.equal(chunks.length, 4);
  const assembler = new Assembler();
  const shuffled = [chunks[2], chunks[0], chunks[3], chunks[0], chunks[1]];
  const results = shuffled.map((chunk) => assembler.add(chunk));
  assert.equal(results.filter((result) => result !== null).length, 1);
  assert.equal(results.at(-1), data);
});

test("chunks that do not form an image are discarded", () => {
  const assembler = new Assembler();
  assert.equal(assembler.add({ id: "x", i: 0, n: 1, d: "javascript:alert(1)" }), null);
  assert.equal(assembler.add({ id: "../x", i: 0, n: 1, d: fakeImage(4) }), null);
  assert.equal(assembler.add({ id: "x", i: 3, n: 2, d: "AAAA" }), null);
});

test("a board backup round-trips through compression", async () => {
  const state = { m: { n: "Plan", b: "#ffffff" }, eabc: { t: "r", x: 1, y: 2, w: 3, h: 4, z: "a0", s: 1 }, edel: null };
  const packed = await packBoard(state);
  assert.deepEqual(await unpackBoard(packed), state);
  assert.deepEqual(Object.keys(boardPatch({ ...state, x: 1, "e<script>": 5 })), ["m", "eabc"]);
});

/** Restoring decompresses first, so keep committing writes until it settles. */
const pumpUntil = async (room, promise) => {
  let done = false;
  promise.then(
    () => (done = true),
    () => (done = true),
  );
  for (let round = 0; round < 200 && !done; round += 1) {
    await room.pump();
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  return promise;
};

const fakeSession = (room) => {
  const client = room.client();
  let progress = { revision: 0, data: null };
  return {
    client,
    session: {
      state: client.state,
      progress: {
        load: async () => structuredClone(progress),
        save: async (data, expected) => {
          if (expected !== progress.revision) throw Object.assign(new Error("conflict"), { status: 409 });
          progress = { revision: progress.revision + 1, data: structuredClone(data) };
          return progress.revision;
        },
      },
    },
  };
};

test("the account copy restores into an empty room only", async () => {
  const room = createRoom();
  const { session } = fakeSession(room);
  const store = new SceneStore(session.state);
  const backup = new Backup(session, store);
  await backup.load();
  store.step(() => store.insert([createElement("ellipse", { z: "a0", width: 50, height: 40 })]));
  await sync(room);
  await backup.saveNow();
  const { board } = await backup.load();
  assert.equal(board.n, 1);

  // The room empties and resets; a new visit restores the board.
  room.reset();
  assert.equal(await pumpUntil(room, backup.restore(board)), true);
  assert.equal(store.size, 1);

  // With something already on the board, the copy is not written over it.
  assert.equal(await pumpUntil(room, backup.restore(board)), false);
});
