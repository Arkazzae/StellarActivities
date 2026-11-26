import {
  canonical,
  decodeElement,
  decodeMeta,
  DEFAULT_META,
  elementKey,
  encodeElement,
  encodeMeta,
  entryBytes,
  isElementKey,
  META_KEY,
  utf8Bytes,
} from "../model/codec.js";
import { compareOrder, keyBetween } from "../model/order.js";

export { DEFAULT_META };

/** Room state above this share of the limit refuses new elements. */
const FULL_RATIO = 0.97;
const RETRY_MS = 450;

const idOf = (key) => key.slice(1);

/**
 * The room may hand values back re-serialised (Stellarr's server sorts object
 * keys), so compare by the canonical encoding, never by the raw JSON.
 */
const canonicalJson = (key, value) => {
  if (value === null || value === undefined) return "null";
  if (key === META_KEY) return JSON.stringify(encodeMeta(decodeMeta(value)));
  const el = decodeElement(idOf(key), value);
  return el === null ? "null" : JSON.stringify(encodeElement(el));
};

/**
 * The shared board on top of a Stellarr session's `state`.
 *
 * Every element is one top-level key holding its compact encoding, so
 * concurrent edits of different elements never collide. Local edits apply at
 * once; `flush()` sends the dirty keys in a single `set()` and never has more
 * than one write in flight. A key is locally authoritative only while it is
 * dirty or in flight — otherwise the latest room snapshot wins.
 *
 * Undo is per person: a step remembers the encoded value of each key before
 * and after, and undoing restores "before" only where the element still holds
 * this person's "after" (somebody else's later edit is never reverted).
 */
export class SceneStore {
  #state;
  #limit;
  #onError;
  #unsubscribe;
  /** id → canonical element (local view). */
  #elements = new Map();
  /** key → JSON of the local value ("null" for deleted). */
  #local = new Map();
  /** key → JSON of the latest room value. */
  #server = new Map();
  #serverBytes = 2;
  #meta = DEFAULT_META;
  #dirty = new Set();
  #inflight = null;
  #retryTimer = null;
  #revs = new Map();
  #revCounter = 0;
  #sorted = null;
  #listeners = new Set();
  #files = new Map();
  #undo = [];
  #redo = [];
  #step = null;
  #tracking = true;
  #revision = -1;
  #failures = 0;

  /**
   * @param state    `session.state` ({ get, subscribe, set })
   * @param options  { stateBytes, onError(kind, error) }
   */
  constructor(state, options = {}) {
    this.#state = state;
    this.#limit = options.stateBytes ?? 256 * 1024;
    this.#onError = options.onError ?? (() => undefined);
    this.#unsubscribe = state.subscribe((snapshot, revision) => this.#onSnapshot(snapshot, revision));
  }

  destroy() {
    this.#unsubscribe?.();
    if (this.#retryTimer !== null) clearTimeout(this.#retryTimer);
    this.#listeners.clear();
  }

  subscribe(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /* ------------------------------------------------------------- reading */

  get(id) {
    return this.#elements.get(id);
  }

  has(id) {
    return this.#elements.has(id);
  }

  rev(id) {
    return this.#revs.get(id) ?? 0;
  }

  ordered() {
    if (this.#sorted === null) this.#sorted = [...this.#elements.values()].sort(compareOrder);
    return this.#sorted;
  }

  get size() {
    return this.#elements.size;
  }

  topKey() {
    const ordered = this.ordered();
    return ordered.length === 0 ? null : ordered[ordered.length - 1].z;
  }

  nextKey() {
    return keyBetween(this.topKey(), null);
  }

  meta() {
    return this.#meta;
  }

  /** Share of the room's state budget in use (0..1), by the latest room snapshot. */
  get usage() {
    return Math.min(1, this.#projectedBytes() / this.#limit);
  }

  get limitBytes() {
    return this.#limit;
  }

  /** Plain snapshot of every live key, used for backups. */
  snapshot() {
    const out = {};
    for (const [key, json] of this.#local) if (json !== "null") out[key] = JSON.parse(json);
    return out;
  }

  /* -------------------------------------------------------------- files */

  file(id) {
    return this.#files.get(id);
  }

  files() {
    return new Map(this.#files);
  }

  /** Images travel peer to peer (see FileSync), not through room state. */
  addFile(id, dataUrl, origin = "local") {
    if (this.#files.has(id)) return;
    this.#files.set(id, dataUrl);
    this.#emit({ ids: new Set(), external: origin !== "local", meta: false, files: true, fileId: id, origin });
  }

  /* ------------------------------------------------------------ writing */

  /** Would these elements fit the room (optionally replacing everything on the board)? */
  fits(elements, replace = false) {
    let bytes = this.#projectedBytes();
    if (replace) {
      for (const id of this.#elements.keys()) {
        const key = elementKey(id);
        bytes += entryBytes(key, "null") - entryBytes(key, this.#local.get(key) ?? "null");
      }
    }
    for (const el of elements) bytes += entryBytes(elementKey(el.id), JSON.stringify(encodeElement(el)));
    return bytes <= this.#limit * FULL_RATIO;
  }

  /** Inserts elements; returns false (and reports "full") when the room has no space left. */
  insert(elements) {
    let extra = 0;
    for (const el of elements) extra += entryBytes(elementKey(el.id), JSON.stringify(encodeElement(el)));
    if (this.#projectedBytes() + extra > this.#limit * FULL_RATIO) {
      this.#onError("full", null);
      return false;
    }
    const ids = new Set();
    for (const el of elements) {
      this.#setLocalElement(canonical(el), true);
      ids.add(el.id);
    }
    this.#sorted = null;
    this.#emit({ ids, external: false, meta: false, files: false });
    return true;
  }

  update(id, patch) {
    const current = this.#elements.get(id);
    if (current === undefined) return undefined;
    const next = canonical({ ...current, ...patch, id });
    const changed = this.#setLocalElement(next, true);
    if (patch.z !== undefined) this.#sorted = null;
    else if (this.#sorted !== null) {
      const index = this.#sorted.indexOf(current);
      if (index >= 0) this.#sorted[index] = next;
      else this.#sorted = null;
    }
    if (changed) this.#emit({ ids: new Set([id]), external: false, meta: false, files: false });
    return next;
  }

  updateMany(patches) {
    for (const [id, patch] of patches) this.update(id, patch);
  }

  remove(ids) {
    const removed = new Set();
    for (const id of ids) {
      if (!this.#elements.has(id)) continue;
      this.#writeLocal(elementKey(id), "null", true);
      this.#elements.delete(id);
      this.#revs.delete(id);
      removed.add(id);
    }
    if (removed.size === 0) return;
    this.#sorted = null;
    this.#emit({ ids: removed, external: false, meta: false, files: false });
  }

  setMeta(patch) {
    const next = { ...this.#meta, ...patch };
    this.beginStep();
    this.#writeLocal(META_KEY, JSON.stringify(encodeMeta(next)), true);
    this.#meta = decodeMeta(encodeMeta(next));
    this.beginStep();
    this.#emit({ ids: new Set(), external: false, meta: true, files: false });
  }

  /** Runs `edit` without recording undo history (housekeeping such as re-measured text). */
  untracked(edit) {
    const previous = this.#tracking;
    this.#tracking = false;
    try {
      edit();
    } finally {
      this.#tracking = previous;
    }
  }

  get hasPending() {
    return this.#dirty.size > 0 || this.#inflight !== null;
  }

  /** Sends dirty keys to the room; at most one write is in flight. */
  flush() {
    if (this.#inflight !== null || this.#dirty.size === 0 || this.#retryTimer !== null) return;
    if (this.#failures > 20) this.#failures = 0; // a new edit retries a stalled sync
    const sent = new Map();
    const patch = {};
    for (const key of this.#dirty) {
      const json = this.#local.get(key) ?? "null";
      // Created and removed before it was ever sent (a click with a shape tool):
      // writing null would leave a permanent key in the room.
      if (json === "null" && (this.#server.get(key) ?? "null") === "null") continue;
      sent.set(key, json);
      patch[key] = JSON.parse(json);
    }
    this.#dirty.clear();
    if (sent.size === 0) return;
    this.#inflight = sent;
    this.#state.set(patch).then(
      () => this.#settle(sent, null),
      (error) => this.#settle(sent, error),
    );
  }

  /* --------------------------------------------------------------- undo */

  beginStep() {
    this.#sealStep();
    this.flush();
  }

  step(edit) {
    this.beginStep();
    edit();
    this.beginStep();
  }

  undoStep() {
    this.#sealStep();
    const step = this.#undo.pop();
    if (step === undefined) return false;
    const applied = this.#replay(step, "before", "after");
    if (applied.size > 0) this.#redo.push(applied);
    this.flush();
    return true;
  }

  redoStep() {
    this.#sealStep();
    const step = this.#redo.pop();
    if (step === undefined) return false;
    const applied = this.#replay(step, "after", "before");
    if (applied.size > 0) this.#undo.push(applied);
    this.flush();
    return true;
  }

  get canUndo() {
    return this.#undo.length > 0 || (this.#step !== null && this.#step.size > 0);
  }

  get canRedo() {
    return this.#redo.length > 0;
  }

  /* ------------------------------------------------------------ internal */

  #projectedBytes() {
    let bytes = this.#serverBytes;
    for (const key of this.#dirty) {
      const local = this.#local.get(key) ?? "null";
      const server = this.#server.get(key);
      bytes += entryBytes(key, local) - (server === undefined ? 0 : entryBytes(key, server));
    }
    return bytes;
  }

  /** Records undo, stores the encoded value and marks it dirty. Returns true when it changed. */
  #setLocalElement(el, track) {
    const key = elementKey(el.id);
    const json = JSON.stringify(encodeElement(el));
    const changed = this.#writeLocal(key, json, track);
    this.#elements.set(el.id, el);
    if (changed) this.#bump(el.id);
    return changed;
  }

  #writeLocal(key, json, track) {
    const before = this.#local.get(key) ?? "null";
    if (before === json) return false;
    if (track && this.#tracking) {
      this.#step ??= new Map();
      if (!this.#step.has(key)) this.#step.set(key, { before, after: json });
    }
    this.#local.set(key, json);
    this.#dirty.add(key);
    return true;
  }

  #sealStep() {
    const step = this.#step;
    this.#step = null;
    if (step === null) return;
    for (const [key, entry] of step) {
      entry.after = this.#local.get(key) ?? "null";
      if (entry.after === entry.before) step.delete(key);
    }
    if (step.size === 0) return;
    this.#undo.push(step);
    if (this.#undo.length > 200) this.#undo.shift();
    this.#redo = [];
  }

  /**
   * Writes `entry[from]` wherever the key still holds `entry[to]` and returns
   * the entries it applied (so the opposite direction can replay them).
   */
  #replay(step, from, to) {
    const applied = new Map();
    const ids = new Set();
    let meta = false;
    for (const [key, entry] of step) {
      const current = this.#local.get(key) ?? "null";
      if (current !== entry[to]) continue; // changed by someone since: leave it
      this.#applyLocal(key, entry[from], true);
      applied.set(key, entry);
      if (key === META_KEY) meta = true;
      else ids.add(idOf(key));
    }
    if (applied.size > 0) {
      this.#sorted = null;
      this.#emit({ ids, external: true, meta, files: false });
    }
    return applied;
  }

  /** Sets the local view of a key from JSON (element or meta). */
  #applyLocal(key, json, dirty) {
    this.#local.set(key, json);
    if (dirty) this.#dirty.add(key);
    if (key === META_KEY) {
      this.#meta = decodeMeta(json === "null" ? null : JSON.parse(json));
      return;
    }
    const id = idOf(key);
    const value = json === "null" ? null : decodeElement(id, JSON.parse(json));
    if (value === null) {
      this.#elements.delete(id);
      this.#revs.delete(id);
    } else {
      this.#elements.set(id, value);
      this.#bump(id);
    }
  }

  #settle(sent, error) {
    this.#inflight = null;
    if (error !== null) {
      const status = error?.status;
      if (status === 429 || status === undefined || status >= 500) {
        // Rate limited or transient: keep the keys and try again shortly.
        for (const key of sent.keys()) this.#dirty.add(key);
        this.#failures += 1;
        if (this.#failures > 20) {
          this.#onError("sync", error);
          return;
        }
        this.#retryTimer = setTimeout(() => {
          this.#retryTimer = null;
          this.flush();
        }, RETRY_MS * Math.min(4, this.#failures));
        return;
      }
      this.#failures = 0;
      // Rejected (e.g. 413 too large): roll the keys back to the room's values.
      const ids = new Set();
      let meta = false;
      for (const key of sent.keys()) {
        if (this.#dirty.has(key)) continue;
        this.#applyLocal(key, this.#server.get(key) ?? "null", false);
        if (key === META_KEY) meta = true;
        else ids.add(idOf(key));
      }
      this.#sorted = null;
      this.#emit({ ids, external: true, meta, files: false });
      this.#onError(status === 413 ? "full" : "rejected", error);
    } else {
      this.#failures = 0;
      // Anything the room changed after our write but that we skipped while in flight.
      const ids = new Set();
      let meta = false;
      for (const key of sent.keys()) {
        if (this.#dirty.has(key)) continue;
        const server = this.#server.get(key);
        if (server === undefined || server === (this.#local.get(key) ?? "null")) continue;
        // Our write is older than what the room holds now only if the room moved on.
        if (server !== sent.get(key)) {
          this.#applyLocal(key, server, false);
          if (key === META_KEY) meta = true;
          else ids.add(idOf(key));
        }
      }
      if (ids.size > 0 || meta) {
        this.#sorted = null;
        this.#emit({ ids, external: true, meta, files: false });
      }
    }
    this.flush();
  }

  #onSnapshot(snapshot, revision) {
    const reset = revision < this.#revision;
    this.#revision = revision;
    const state = snapshot ?? {};
    const keys = new Set([...Object.keys(state), ...this.#server.keys()]);
    const ids = new Set();
    let meta = false;
    let bytes = 2;
    for (const key of keys) {
      if (key !== META_KEY && !isElementKey(key)) continue;
      const value = Object.hasOwn(state, key) ? state[key] : null;
      if (Object.hasOwn(state, key)) bytes += entryBytes(key, JSON.stringify(value));
      const json = canonicalJson(key, value);
      const previous = this.#server.get(key);
      this.#server.set(key, json);
      if (previous === json && !reset) continue;
      if (this.#dirty.has(key) || this.#inflight?.has(key)) continue;
      if ((this.#local.get(key) ?? "null") === json) continue;
      this.#applyLocal(key, json, false);
      if (key === META_KEY) meta = true;
      else ids.add(idOf(key));
    }
    // Keys from other activities' layouts are ignored but still cost bytes.
    for (const key of Object.keys(state)) {
      if (key !== META_KEY && !isElementKey(key)) bytes += entryBytes(key, JSON.stringify(state[key]));
    }
    this.#serverBytes = bytes;
    if (ids.size === 0 && !meta) return;
    this.#sorted = null;
    this.#emit({ ids, external: true, meta, files: false });
  }

  #bump(id) {
    this.#revCounter += 1;
    this.#revs.set(id, this.#revCounter);
  }

  #emit(change) {
    for (const listener of this.#listeners) listener(change);
  }
}

/** True when a room state object holds at least one live element. */
export const hasElements = (state) =>
  Object.entries(state ?? {}).some(([key, value]) => isElementKey(key) && value !== null);

export const stateBytes = (state) => utf8Bytes(JSON.stringify(state ?? {}));
