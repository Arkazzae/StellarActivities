import assert from "node:assert/strict";
import test from "node:test";
import { createPlayer } from "../player.js";

test("YouTube uses the SDK embed for playback, speed, volume and teardown", t => {
  const oldLocation = globalThis.location;
  globalThis.location = { origin: "https://example.test" };
  t.after(() => { if (oldLocation) globalThis.location = oldLocation; else delete globalThis.location; });
  const messages = [];
  const statuses = [];
  let callbacks, url, destroyed = 0;
  const player = createPlayer({ source: "youtube", videoId: "abcdefghijk", startSeconds: 4 }, {}, {
    embed: { mount(input, slot, options) {
      url = new URL(input);
      callbacks = options;
      return { postMessage(raw) { messages.push(JSON.parse(raw)); }, destroy() { destroyed++; } };
    } },
    status: (...args) => statuses.push(args),
    ended: duration => assert.equal(duration, 62),
  });
  t.after(() => player.destroy());
  assert.equal(url.origin, "https://www.youtube-nocookie.com");
  assert.equal(url.searchParams.get("enablejsapi"), "1");
  callbacks.onLoad();
  const { id } = messages[0];
  assert.equal(messages[0].event, "listening");
  player.sync({ playing: true, serial: 1, position: 4, rate: 1.5 });
  player.setVolume(0.42);
  callbacks.onMessage(JSON.stringify({ id, event: "onReady" }));
  const commands = Object.fromEntries(messages.map(({ func, args }) => [func, args]));
  assert.deepEqual(commands.loadVideoById, ["abcdefghijk", 4]);
  assert.deepEqual(commands.setPlaybackRate, [1.5]);
  assert.deepEqual(commands.setVolume, [42]);
  callbacks.onMessage({ id, event: "infoDelivery", info: { duration: 62, currentTime: 61 } });
  assert.equal(player.getDuration(), 62);
  callbacks.onMessage({ id, event: "onStateChange", info: 0 });
  callbacks.onMessage({ id, event: "onError", info: 101 });
  assert.deepEqual(statuses.at(-1), ["error", "errEmbedDisabled"]);
  player.destroy();
  assert.equal(destroyed, 1);
});
