import { decodeElement, encodeElement } from "../model/codec.js";

const PRESENCE_MS = 90;
const LIVE_MS = 110;
const ENDING_TTL = 2_500;
const STALE_TTL = 6_000;
const LIVE_LIMIT = 150;
const SELECTION_LIMIT = 100;

const clamp = (value) => Math.max(-10_000_000, Math.min(10_000_000, Math.round(value * 10) / 10));

/**
 * Everything ephemeral about other people in the room: who is here, where
 * their pointer is, what they have selected, their laser trail, and the
 * elements they are dragging or drawing right now (before the change is
 * committed to the room state). All of it rides on `session.send`.
 */
export class Room {
  #session;
  #peerListeners = new Set();
  #statusListeners = new Set();
  #overrideListeners = new Set();
  #participants = [];
  #presence = new Map();
  /** peer id → { els: Map<id, El>, endingAt: number | null, at: number } */
  #live = new Map();
  #cleanups = [];
  #pendingPresence = null;
  #trail = [];
  #presenceTimer = null;
  #lastPresence = 0;
  #pendingLive = null;
  #liveTimer = null;
  #lastLive = 0;
  #status = "connected";

  constructor(session, store) {
    this.#session = session;
    this.selfId = session.context.me.id;
    this.selfName = session.context.me.name || "";
    this.selfAvatar = session.context.me.avatar ?? null;
    this.mode = session.context.launchMode === "personal" ? "personal" : "voice";
    this.#cleanups.push(
      session.participants.subscribe((list) => {
        this.#participants = list;
        const me = list.find((person) => person.id === this.selfId);
        if (me !== undefined) {
          this.selfName = me.name || this.selfName;
          this.selfAvatar = me.avatar ?? null;
        }
        for (const id of [...this.#live.keys()]) {
          if (!list.some((person) => person.id === id && person.connected)) this.#live.delete(id);
        }
        this.#emitPeers();
        this.#emitOverrides();
      }),
      session.connection.subscribe((status) => {
        this.#status = status;
        for (const listener of this.#statusListeners) listener(status);
      }),
      session.on("p", (data, meta) => this.#onPresence(data, meta.from)),
      session.on("g", (data, meta) => this.#onLive(data, meta.from)),
      store.subscribe((change) => {
        if (!change.external || change.ids.size === 0) return;
        // A committed change replaces the sender's preview of those elements.
        let changed = false;
        for (const peer of this.#live.values()) {
          if (peer.endingAt === null) continue;
          for (const id of change.ids) if (peer.els.delete(id)) changed = true;
        }
        if (changed) this.#emitOverrides();
      }),
    );
    const sweep = setInterval(() => this.#sweep(), 500);
    this.#cleanups.push(() => clearInterval(sweep));
  }

  destroy() {
    for (const cleanup of this.#cleanups) cleanup();
    if (this.#presenceTimer !== null) clearTimeout(this.#presenceTimer);
    if (this.#liveTimer !== null) clearTimeout(this.#liveTimer);
  }

  get status() {
    return this.#status;
  }

  /** Connected people other than me. */
  get others() {
    return this.#participants.filter((person) => person.connected && person.id !== this.selfId);
  }

  onPeers(listener) {
    this.#peerListeners.add(listener);
    listener(this.#peers());
    return () => this.#peerListeners.delete(listener);
  }

  onStatus(listener) {
    this.#statusListeners.add(listener);
    listener(this.#status);
    return () => this.#statusListeners.delete(listener);
  }

  onOverrides(listener) {
    this.#overrideListeners.add(listener);
    return () => this.#overrideListeners.delete(listener);
  }

  /* --------------------------------------------------------- presence out */

  /** presence: { cursor: {x,y}|null, tool: "pointer"|"laser", button: "down"|"up", selectedIds } */
  publish(presence) {
    if (presence.tool === "laser" && presence.button === "down" && presence.cursor !== null) {
      this.#trail.push([clamp(presence.cursor.x), clamp(presence.cursor.y), performance.now()]);
      if (this.#trail.length > 40) this.#trail.shift();
    }
    this.#pendingPresence = presence;
    if (this.#presenceTimer !== null) return;
    const wait = Math.max(0, PRESENCE_MS - (performance.now() - this.#lastPresence));
    this.#presenceTimer = setTimeout(() => this.#sendPresence(), wait);
  }

  #sendPresence() {
    this.#presenceTimer = null;
    const presence = this.#pendingPresence;
    if (presence === null) return;
    this.#lastPresence = performance.now();
    const now = performance.now();
    const data = {
      s: presence.selectedIds.slice(0, SELECTION_LIMIT),
    };
    if (presence.cursor !== null) {
      data.x = clamp(presence.cursor.x);
      data.y = clamp(presence.cursor.y);
    }
    if (presence.tool === "laser") data.l = 1;
    if (presence.button === "down") data.d = 1;
    if (this.#trail.length > 0) {
      data.t = this.#trail.map(([x, y, at]) => [x, y, Math.round(now - at)]);
      this.#trail = [];
    }
    this.#session.send("p", data, { latest: true });
  }

  /* ------------------------------------------------------------- live out */

  /** Previews elements I am changing right now (sent ~9 times a second). */
  sendLive(elements) {
    this.#pendingLive = elements.slice(0, LIVE_LIMIT);
    if (this.#liveTimer !== null) return;
    const wait = Math.max(0, LIVE_MS - (performance.now() - this.#lastLive));
    this.#liveTimer = setTimeout(() => this.#flushLive(), wait);
  }

  #flushLive() {
    this.#liveTimer = null;
    const elements = this.#pendingLive;
    this.#pendingLive = null;
    if (elements === null) return;
    this.#lastLive = performance.now();
    this.#session.send("g", { e: elements.map((el) => [el.id, encodeElement(el)]) }, { latest: true });
  }

  /** The gesture is over; the result follows through the room state. */
  endLive() {
    if (this.#liveTimer !== null) {
      clearTimeout(this.#liveTimer);
      this.#liveTimer = null;
    }
    this.#pendingLive = null;
    this.#session.send("g", { e: [], end: 1 }, { latest: true });
  }

  /* ------------------------------------------------------------------ in */

  /** Elements other people are dragging or drawing, keyed by element id. */
  overrides() {
    const out = new Map();
    for (const peer of this.#live.values()) for (const [id, el] of peer.els) out.set(id, el);
    return out;
  }

  #onPresence(data, from) {
    if (typeof data !== "object" || data === null || from === this.selfId) return;
    const now = performance.now();
    const cursor =
      typeof data.x === "number" && typeof data.y === "number" && Number.isFinite(data.x) && Number.isFinite(data.y)
        ? { x: data.x, y: data.y }
        : null;
    const trail = Array.isArray(data.t)
      ? data.t
          .filter((point) => Array.isArray(point) && point.length === 3 && point.every(Number.isFinite))
          .slice(-40)
          .map(([x, y, age]) => ({ x, y, t: now - Math.max(0, Math.min(1_000, age)) }))
      : [];
    this.#presence.set(from, {
      cursor,
      tool: data.l === 1 ? "laser" : "pointer",
      button: data.d === 1 ? "down" : "up",
      selectedIds: Array.isArray(data.s) ? data.s.filter((id) => typeof id === "string").slice(0, SELECTION_LIMIT) : [],
      trail,
    });
    this.#emitPeers();
  }

  #onLive(data, from) {
    if (typeof data !== "object" || data === null || from === this.selfId) return;
    const now = performance.now();
    const peer = this.#live.get(from) ?? { els: new Map(), endingAt: null, at: now };
    if (data.end === 1) {
      peer.endingAt = now;
    } else if (Array.isArray(data.e)) {
      peer.els = new Map();
      for (const item of data.e.slice(0, LIVE_LIMIT)) {
        if (!Array.isArray(item) || typeof item[0] !== "string") continue;
        const el = decodeElement(item[0], item[1]);
        if (el !== null) peer.els.set(el.id, el);
      }
      peer.endingAt = null;
    }
    peer.at = now;
    this.#live.set(from, peer);
    this.#emitOverrides();
  }

  #sweep() {
    const now = performance.now();
    let changed = false;
    for (const [id, peer] of this.#live) {
      const expired = peer.endingAt !== null ? now - peer.endingAt > ENDING_TTL : now - peer.at > STALE_TTL;
      if (expired || peer.els.size === 0) {
        this.#live.delete(id);
        changed = true;
      }
    }
    if (changed) this.#emitOverrides();
  }

  #peers() {
    return this.others.map((person) => ({
      id: person.id,
      name: person.name || "",
      avatar: person.avatar ?? null,
      presence: this.#presence.get(person.id) ?? null,
    }));
  }

  #emitPeers() {
    const peers = this.#peers();
    for (const listener of this.#peerListeners) listener(peers);
  }

  #emitOverrides() {
    for (const listener of this.#overrideListeners) listener();
  }
}
