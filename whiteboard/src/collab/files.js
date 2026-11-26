/**
 * Images do not fit the 256 KiB room state, so they travel peer to peer over
 * `session.send` in chunks. Whoever inserts an image broadcasts it; anyone
 * who later sees an image they do not have asks the room, and someone who
 * has it answers. An image is gone once nobody in the room still holds it.
 */
export const CHUNK_CHARS = 45_000;
export const MAX_FILE_CHARS = 1_500_000;
const PUMP_MS = 160;
const CHUNKS_PER_PUMP = 2;
const REQUEST_EVERY_MS = 4_000;
const MAX_REQUESTS = 8;

export const splitFile = (id, data) => {
  const count = Math.max(1, Math.ceil(data.length / CHUNK_CHARS));
  const chunks = [];
  for (let index = 0; index < count; index += 1) {
    chunks.push({ id, i: index, n: count, d: data.slice(index * CHUNK_CHARS, (index + 1) * CHUNK_CHARS) });
  }
  return chunks;
};

/** Collects chunks; returns the whole data URL once complete, else null. */
export class Assembler {
  #parts = new Map();

  add(chunk) {
    if (!validChunk(chunk)) return null;
    const entry = this.#parts.get(chunk.id) ?? { n: chunk.n, parts: new Array(chunk.n).fill(null), got: 0 };
    if (entry.n !== chunk.n) return null;
    if (entry.parts[chunk.i] === null) {
      entry.parts[chunk.i] = chunk.d;
      entry.got += 1;
    }
    this.#parts.set(chunk.id, entry);
    if (entry.got < entry.n) return null;
    this.#parts.delete(chunk.id);
    const data = entry.parts.join("");
    return /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(data) && data.length <= MAX_FILE_CHARS ? data : null;
  }
}

const validChunk = (chunk) =>
  typeof chunk === "object" &&
  chunk !== null &&
  typeof chunk.id === "string" &&
  /^[\w-]{1,32}$/.test(chunk.id) &&
  Number.isInteger(chunk.n) &&
  chunk.n >= 1 &&
  chunk.n <= Math.ceil(MAX_FILE_CHARS / CHUNK_CHARS) &&
  Number.isInteger(chunk.i) &&
  chunk.i >= 0 &&
  chunk.i < chunk.n &&
  typeof chunk.d === "string" &&
  chunk.d.length <= CHUNK_CHARS;

export class FileSync {
  #session;
  #store;
  #assembler = new Assembler();
  #queue = [];
  #queued = new Set();
  #pumpTimer = null;
  #requests = new Map();
  #lastSeen = new Map();
  #wanted = new Set();
  #cleanups = [];

  constructor(session, store) {
    this.#session = session;
    this.#store = store;
    this.#cleanups.push(
      session.on("fq", (data, meta) => this.#onRequest(data, meta.from)),
      session.on("fc", (data) => this.#onChunk(data)),
      store.subscribe((change) => {
        if (change.files && change.origin === "local" && change.fileId !== undefined) this.#broadcast(change.fileId);
      }),
      // Someone who holds the image may join later: ask again.
      session.participants.subscribe(() => {
        for (const id of this.#wanted) this.#requests.delete(id);
      }),
    );
    // A request can be lost (not yet connected, a full queue); keep asking while it is missing.
    const retry = setInterval(() => {
      for (const id of this.#wanted) {
        if (this.#store.file(id) !== undefined) this.#wanted.delete(id);
        else this.want(id);
      }
    }, 2_000);
    this.#cleanups.push(() => clearInterval(retry));
  }

  destroy() {
    for (const cleanup of this.#cleanups) cleanup();
    if (this.#pumpTimer !== null) clearTimeout(this.#pumpTimer);
  }

  /** Asks the room for an image this client does not have yet. */
  want(id) {
    if (this.#store.file(id) !== undefined || !/^[\w-]{1,32}$/.test(id)) return;
    this.#wanted.add(id);
    const now = performance.now();
    const request = this.#requests.get(id) ?? { at: -Infinity, count: 0 };
    if (now - request.at < REQUEST_EVERY_MS || request.count >= MAX_REQUESTS) return;
    if (!this.#session.send("fq", { id })) return; // not connected yet: the retry loop tries again
    request.at = now;
    request.count += 1;
    this.#requests.set(id, request);
  }

  #onRequest(data, from) {
    const id = typeof data?.id === "string" ? data.id : "";
    if (from === this.#session.context.me.id || this.#store.file(id) === undefined) return;
    // Several people may hold the image: answer after a random pause unless someone already did.
    setTimeout(() => {
      if (performance.now() - (this.#lastSeen.get(id) ?? -Infinity) < 1_500) return;
      this.#broadcast(id);
    }, 60 + Math.random() * 340);
  }

  #onChunk(chunk) {
    if (!validChunk(chunk)) return;
    this.#lastSeen.set(chunk.id, performance.now());
    if (this.#store.file(chunk.id) !== undefined) return;
    const data = this.#assembler.add(chunk);
    if (data !== null) this.#store.addFile(chunk.id, data, "remote");
  }

  #broadcast(id) {
    const data = this.#store.file(id);
    if (data === undefined || this.#queued.has(id)) return;
    this.#queued.add(id);
    this.#lastSeen.set(id, performance.now());
    this.#queue.push(...splitFile(id, data));
    this.#pump();
  }

  #pump() {
    if (this.#pumpTimer !== null) return;
    this.#pumpTimer = setTimeout(() => {
      this.#pumpTimer = null;
      for (let sent = 0; sent < CHUNKS_PER_PUMP && this.#queue.length > 0; sent += 1) {
        const chunk = this.#queue[0];
        if (!this.#session.send("fc", chunk)) break; // outbox full: try again next round
        this.#queue.shift();
        if (chunk.i === chunk.n - 1) this.#queued.delete(chunk.id);
      }
      if (this.#queue.length > 0) this.#pump();
    }, PUMP_MS);
  }
}
