import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkpoint, effectiveVolume, emptyRoom, parseYouTube, playbackFor, positionAt, reduceRoom, takeover,
} from "../room.js";

const reduce = (room, action, { host = "host", from = "guest", id = "command", now = 1000 } = {}) =>
  reduceRoom(room, action, { id, from }, host, now);
const apply = (room, action, options) => ({ ...room, ...reduce(room, action, options).patch });
const add = (room, id) => apply(room, { type: "add", source: "sample" }, { id });

test("accepts YouTube links and offsets without accepting lookalike origins", () => {
  for (const link of [
    "youtube.com/watch?v=M7lc1UVf-VE&t=1m10s",
    "https://youtu.be/M7lc1UVf-VE?start=70",
    "https://m.youtube.com/shorts/M7lc1UVf-VE#t=70",
    "https://music.youtube.com/watch?v=M7lc1UVf-VE&t=70",
    "https://www.youtube-nocookie.com/embed/M7lc1UVf-VE?t=70s",
    "https://youtube.com/live/M7lc1UVf-VE?t=70s",
  ]) assert.deepEqual(parseYouTube(link), { videoId: "M7lc1UVf-VE", startSeconds: 70 });
  assert.deepEqual(parseYouTube("  M7lc1UVf-VE  "), { videoId: "M7lc1UVf-VE", startSeconds: 0 });
  for (const link of [
    "https://youtube.com.example/watch?v=M7lc1UVf-VE",
    "https://youtube.com@evil.invalid/watch?v=M7lc1UVf-VE",
    "https://evil.invalid@youtube.com/watch?v=M7lc1UVf-VE",
    "ftp://youtube.com/watch?v=M7lc1UVf-VE",
    "https://www.youtube.com/playlist?list=xyz",
    "https://youtu.be/M7lc1UVf-VEextra",
  ]) assert.equal(parseYouTube(link), null);
});

test("a guest plays, pauses and seeks using the session clock", () => {
  let room = add(emptyRoom(), "one");
  assert.equal(room.playback.playing, false);
  room = apply(room, { type: "play", currentId: "one" }, { now: 3000 });
  assert.equal(positionAt(room.playback, 4750), 1.75);
  room = apply(room, { type: "pause", currentId: "one" }, { now: 5000 });
  assert.equal(positionAt(room.playback, 7000), 2);
  room = apply(room, { type: "seek", currentId: "one", position: 13.5 }, { now: 7500 });
  assert.equal(positionAt(room.playback, 8500), 13.5);
  assert.equal(room.current.addedBy, "guest");
});

test("natural finish and simultaneous skips cannot advance a second item", () => {
  let room = add(add(add(emptyRoom(), "one"), "two"), "three");
  room = apply(room, { type: "play", currentId: "one" });
  const ended = { type: "ended", currentId: "one", serial: room.playback.serial };
  assert.throws(() => reduce(room, ended), /host/);
  room = apply(room, ended, { from: "host", now: 40_000 });
  assert.equal(room.current.id, "two");
  assert.equal(room.playback.playing, true);
  assert.equal(reduce(room, { type: "skip", currentId: "one" }).result, false);
  assert.equal(reduce(room, ended, { from: "host" }).result, false);
  assert.deepEqual(room.queue.map(item => item.id), ["three"]);
});

test("old completion after a seek in the same item is ignored", () => {
  let room = add(emptyRoom(), "one");
  room = apply(room, { type: "play", currentId: "one" });
  const ended = { type: "ended", currentId: "one", serial: room.playback.serial };
  room = apply(room, { type: "seek", currentId: "one", position: 3 });
  assert.equal(reduce(room, ended, { from: "host" }).result, false);
});

test("host transfer recovers the last checkpoint paused", () => {
  let room = add(emptyRoom(), "one");
  room = apply(room, { type: "play", currentId: "one" });
  assert.equal(checkpoint(room, "host", 4900), undefined);
  room = { ...room, ...checkpoint(room, "host", 6000) };
  assert.equal(room.playback.position, 5);
  assert.equal(playbackFor(room, "host", false).playing, false);
  assert.equal(playbackFor(room, "guest", true).playing, false);
  room = { ...room, ...takeover(room, "guest", 30_000) };
  assert.equal(positionAt(room.playback, 40_000), 5);
  assert.equal(room.playback.host, "guest");
  assert.equal(room.playback.playing, false);
  assert.equal(takeover(room, "guest", 50_000), undefined);
});

test("queue moves and selections keep distinct IDs for two adds of the same video", () => {
  let room = add(add(add(emptyRoom(), "one"), "two"), "three");
  room = apply(room, { type: "move", id: "three", direction: -1 });
  assert.deepEqual(room.queue.map(item => item.id), ["three", "two"]);
  room = apply(room, { type: "select", id: "three", currentId: "one" });
  assert.equal(room.current.id, "three");
  assert.deepEqual(room.queue.map(item => item.id), ["two"]);
  room = apply(room, { type: "remove", id: "two" });
  assert.deepEqual(room.queue, []);
});

test("player and Stellarr volume multiply independently of mute", () => {
  assert.equal(effectiveVolume(.4, .5, false), .2);
  assert.equal(effectiveVolume(.4, .5, true), 0);
  assert.equal(effectiveVolume(1, 0, false), 0);
});
