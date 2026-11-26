import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkpoint, effectiveVolume, emptyRoom, liveVotes, normalizeRoom, parseYouTube, playbackFor, positionAt, reduceRoom,
  skipRole, takeover, voteThreshold,
} from "../room.js";

const everyone = ["host", "guest", "third", "fourth"];
const reduce = (room, action, { host = "host", from = "guest", id = "command", now = 1000, connected = everyone, owners = [] } = {}) =>
  reduceRoom(room, action, { id, from }, host, now, { connected, owners });
const apply = (room, action, options) => ({ ...room, ...reduce(room, action, options).patch });
const add = (room, id, options = {}) => apply(room, { type: "add", source: "sample" }, { id, ...options });
const hostOnly = room => apply(room, { type: "settings", control: "host" }, { from: "host" });

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

test("the first video starts the room, and anyone can pause and seek by default", () => {
  let room = add(emptyRoom(), "one");
  assert.equal(room.playback.playing, true);
  assert.equal(room.founder, "host");
  room = apply(room, { type: "pause", currentId: "one" }, { now: 3000 });
  assert.equal(positionAt(room.playback, 7000), 2);
  room = apply(room, { type: "play", currentId: "one" }, { now: 7000 });
  assert.equal(positionAt(room.playback, 8750), 3.75);
  room = apply(room, { type: "seek", currentId: "one", position: 13.5 }, { now: 9000 });
  assert.equal(positionAt(room.playback, 10_000), 14.5);
  assert.equal(room.current.addedBy, "guest");
});

test("without autoplay the first video waits for someone to press play", () => {
  let room = apply(emptyRoom(), { type: "settings", autoplay: false }, { from: "host" });
  room = add(room, "one");
  assert.equal(room.playback.playing, false);
});

test("natural finish and simultaneous skips cannot advance a second item", () => {
  let room = add(add(add(emptyRoom(), "one"), "two"), "three");
  const ended = { type: "ended", currentId: "one", serial: room.playback.serial };
  assert.throws(() => reduce(room, ended), /errEnded/);
  room = apply(room, ended, { from: "host", now: 40_000 });
  assert.equal(room.current.id, "two");
  assert.equal(room.playback.playing, true);
  assert.equal(reduce(room, { type: "skip", currentId: "one" }).result, false);
  assert.equal(reduce(room, ended, { from: "host" }).result, false);
  assert.deepEqual(room.queue.map(item => item.id), ["three"]);
  assert.deepEqual(room.history.map(entry => [entry.video.id, entry.reason, entry.reached]), [["one", "ended", 39]]);
});

test("old completion after a seek in the same item is ignored", () => {
  let room = add(emptyRoom(), "one");
  const ended = { type: "ended", currentId: "one", serial: room.playback.serial };
  room = apply(room, { type: "seek", currentId: "one", position: 3 });
  assert.equal(reduce(room, ended, { from: "host" }).result, false);
});

test("autoplay off loads the next video paused and repeat restarts the same one", () => {
  let room = add(add(emptyRoom(), "one"), "two");
  room = apply(room, { type: "settings", autoplay: false }, { from: "host" });
  room = apply(room, { type: "ended", currentId: "one", serial: room.playback.serial }, { from: "host", now: 9000 });
  assert.equal(room.current.id, "two");
  assert.equal(room.playback.playing, false);
  room = apply(room, { type: "settings", repeat: true }, { from: "host" });
  room = apply(room, { type: "play", currentId: "two" }, { now: 10_000 });
  room = apply(room, { type: "ended", currentId: "two", serial: room.playback.serial }, { from: "host", now: 20_000 });
  assert.equal(room.current.id, "two");
  assert.equal(room.playback.playing, true);
  assert.equal(positionAt(room.playback, 20_000), 0);
  assert.equal(room.history.length, 2);
});

test("host transfer recovers the last checkpoint paused", () => {
  let room = add(emptyRoom(), "one");
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

test("queue moves, selections and replays keep distinct IDs", () => {
  let room = add(add(add(emptyRoom(), "one"), "two"), "three");
  room = apply(room, { type: "move", id: "three", direction: -1 });
  assert.deepEqual(room.queue.map(item => item.id), ["three", "two"]);
  room = apply(room, { type: "select", id: "three", currentId: "one" });
  assert.equal(room.current.id, "three");
  assert.deepEqual(room.history.map(entry => [entry.video.id, entry.reason]), [["one", "skipped"]]);
  room = apply(room, { type: "remove", id: "two" });
  assert.deepEqual(room.queue, []);
  room = apply(room, { type: "replay", id: "one" }, { id: "again", from: "third" });
  assert.deepEqual(room.queue.map(item => [item.id, item.addedBy]), [["again", "third"]]);
  assert.throws(() => reduce(room, { type: "replay", id: "missing" }), /errHistoryGone/);
});

test("in a host-only room guests add videos and remove their own but cannot steer", () => {
  let room = hostOnly(add(add(emptyRoom(), "one", { from: "host" }), "two", { from: "host" }));
  room = add(room, "mine");
  assert.throws(() => reduce(room, { type: "pause", currentId: "one" }), /errHostPlayback/);
  assert.throws(() => reduce(room, { type: "move", id: "mine", direction: -1 }), /errHostQueue/);
  assert.throws(() => reduce(room, { type: "remove", id: "two" }), /errRemoveOwn/);
  assert.throws(() => reduce(room, { type: "skip", currentId: "one" }), /errSkip/);
  assert.throws(() => reduce(room, { type: "settings", autoplay: false }), /errSettingsHost/);
  room = apply(room, { type: "remove", id: "mine" });
  assert.deepEqual(room.queue.map(item => item.id), ["two"]);
  room = apply(room, { type: "pause", currentId: "one" }, { from: "host" });
  assert.equal(room.playback.playing, false);
});

test("the person who started the room and the instance owner skip without a vote", () => {
  let room = hostOnly(add(add(add(emptyRoom(), "one", { from: "host" }), "two"), "three"));
  room = { ...room, founder: "guest" };
  assert.equal(skipRole(room, "guest", "host"), "founder");
  room = apply(room, { type: "skip", currentId: "one" }, { now: 5000 });
  assert.equal(room.current.id, "two");
  assert.deepEqual(room.notice, { kind: "founder", by: "guest", at: 5000 });
  assert.throws(() => reduce(room, { type: "skip", currentId: "two" }, { from: "third" }), /errSkip/);
  room = apply(room, { type: "skip", currentId: "two" }, { from: "third", owners: ["third"], now: 6000 });
  assert.equal(room.current.id, "three");
  assert.equal(room.notice.kind, "owner");
  room = apply(room, { type: "skip", currentId: "three" }, { from: "host", now: 7000 });
  assert.equal(room.notice.kind, "owner");
});

test("more than half of the people online can vote a video out", () => {
  let room = add(add(emptyRoom(), "one"), "two");
  assert.equal(voteThreshold(4), 3);
  room = apply(room, { type: "vote", currentId: "one" }, { from: "guest" });
  room = apply(room, { type: "vote", currentId: "one" }, { from: "third" });
  room = apply(room, { type: "vote", currentId: "one" }, { from: "third" });
  assert.deepEqual(room.votes, ["guest"]);
  room = apply(room, { type: "vote", currentId: "one" }, { from: "third" });
  // A vote from someone who left stops counting toward the majority.
  assert.deepEqual(liveVotes(room, ["host", "third", "fourth"]), ["third"]);
  assert.throws(() => reduce(room, { type: "vote", currentId: "one" }, { from: "stranger" }), /errVoteJoin/);
  const decision = reduce(room, { type: "vote", currentId: "one" }, { from: "fourth", now: 8000 });
  assert.equal(decision.result, "skipped");
  room = { ...room, ...decision.patch };
  assert.equal(room.current.id, "two");
  assert.deepEqual(room.votes, []);
  assert.equal(room.notice.kind, "vote");
  assert.equal(reduce(room, { type: "vote", currentId: "one" }, { from: "host" }).result, false);
});

test("shared speed scales the room clock and accepts only listed rates", () => {
  let room = add(emptyRoom(), "one", { now: 0 });
  room = apply(room, { type: "rate", currentId: "one", rate: 2 }, { now: 1000 });
  assert.equal(positionAt(room.playback, 3000), 5);
  assert.throws(() => reduce(room, { type: "rate", currentId: "one", rate: 3 }), /errRate/);
  room = { ...room, ...takeover(room, "guest", 4000) };
  assert.equal(room.playback.rate, 2);
});

test("only the host clears history and rooms saved by 0.1 gain the new fields", () => {
  const old = { current: null, queue: [], playback: { host: null, playing: false, position: 0, at: 0, serial: 0 } };
  const room = normalizeRoom(old);
  assert.deepEqual(room.history, []);
  assert.deepEqual(room.settings, { control: "everyone", autoplay: true, repeat: false });
  assert.equal(room.playback.rate, 1);
  let played = add(add(old, "one"), "two");
  played = apply(played, { type: "skip", currentId: "one" });
  assert.throws(() => reduce(played, { type: "clearHistory" }), /errClearHost/);
  assert.deepEqual(apply(played, { type: "clearHistory" }, { from: "host" }).history, []);
});

test("player and Stellarr volume multiply independently of mute", () => {
  assert.equal(effectiveVolume(.4, .5, false), .2);
  assert.equal(effectiveVolume(.4, .5, true), 0);
  assert.equal(effectiveVolume(1, 0, false), 0);
});
