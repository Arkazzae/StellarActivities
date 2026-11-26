import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createProgress, forgetSpot, latestSpot, preference, rememberSpot, spotFor, spots, withPreference,
} from "../progress.js";

const spot = (videoId, position, at, duration = 600) => ({ videoId, title: videoId, author: "", position, duration, at });

test("resume spots skip the first seconds, drop finished videos and stay bounded", () => {
  let data = rememberSpot({}, spot("aaaaaaaaaaa", 5, 1));
  assert.deepEqual(spots(data), []);
  data = rememberSpot(data, spot("aaaaaaaaaaa", 120.7, 2));
  assert.equal(spotFor(data, "aaaaaaaaaaa").position, 120);
  data = rememberSpot(data, spot("bbbbbbbbbbb", 300, 3));
  assert.equal(latestSpot(data).videoId, "bbbbbbbbbbb");
  data = rememberSpot(data, spot("aaaaaaaaaaa", 590, 4));
  assert.equal(spotFor(data, "aaaaaaaaaaa"), null);
  data = forgetSpot(data, "bbbbbbbbbbb");
  assert.equal(latestSpot(data), null);
  for (let index = 0; index < 60; index += 1) data = rememberSpot(data, spot(`v${String(index).padStart(10, "0")}`, 60, index));
  assert.equal(spots(data).length, 40);
  assert.equal(latestSpot(data).at, 59);
});

test("preferences live beside the spots", () => {
  const data = withPreference(rememberSpot({}, spot("aaaaaaaaaaa", 60, 1)), "language", "pl");
  assert.equal(preference(data, "language"), "pl");
  assert.equal(spots(data).length, 1);
  assert.equal(preference({}, "language"), undefined);
});

test("progress is optional on hosts without the capability", async () => {
  const progress = createProgress({ capabilities: [], progress: { load: () => { throw new Error("unused"); } } });
  assert.equal(progress.supported, false);
  assert.deepEqual(await progress.load(), {});
  progress.update(data => withPreference(data, "language", "en"));
  await progress.flush();
  assert.equal(preference(progress.data, "language"), "en");
});

test("a conflicting save reapplies this device's change on the newer revision", async () => {
  let remote = { revision: 1, data: { preferences: { language: "pl" } } };
  const saves = [];
  const session = {
    capabilities: ["progress"],
    progress: {
      async load() { return structuredClone(remote); },
      async save(data, revision) {
        saves.push(revision);
        if (revision !== remote.revision) throw Object.assign(new Error("conflict"), { status: 409 });
        remote = { revision: revision + 1, data: structuredClone(data) };
        return remote.revision;
      },
    },
  };
  const progress = createProgress(session);
  await progress.load();
  // Another device saves a spot before this one writes.
  remote = { revision: 2, data: { ...remote.data, spots: [spot("ccccccccccc", 90, 5)] } };
  progress.update(data => withPreference(data, "language", "en"));
  await progress.flush();
  assert.deepEqual(saves, [1, 2]);
  assert.equal(remote.revision, 3);
  assert.equal(preference(remote.data, "language"), "en");
  assert.equal(spotFor(remote.data, "ccccccccccc").position, 90);
});
