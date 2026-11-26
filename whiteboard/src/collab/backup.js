import { isElementKey, META_KEY } from "../model/codec.js";
import { hasElements } from "../store/scene.js";

/** Room state resets 120 s after the last person leaves; `progress` (64 KiB per account) outlives it. */
const BOARD_CHARS = 56 * 1024;
const BOARD_DELAY_MS = 20_000;
const PREFS_DELAY_MS = 1_500;

const toBase64 = (bytes) => {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
};

const fromBase64 = (text) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0));

const pipe = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());

export const packBoard = async (state) => {
  const json = new TextEncoder().encode(JSON.stringify(state));
  if (typeof CompressionStream !== "function") return { raw: toBase64(json) };
  return { gz: toBase64(await pipe(json, new CompressionStream("gzip"))) };
};

export const unpackBoard = async (packed) => {
  if (typeof packed?.gz === "string" && typeof DecompressionStream === "function") {
    const bytes = await pipe(fromBase64(packed.gz), new DecompressionStream("gzip"));
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  if (typeof packed?.raw === "string") return JSON.parse(new TextDecoder().decode(fromBase64(packed.raw)));
  throw new Error("Unknown backup format.");
};

/** Only element and meta keys from a backup may be written back into a room. */
export const boardPatch = (state) => {
  const patch = {};
  if (typeof state !== "object" || state === null) return patch;
  for (const [key, value] of Object.entries(state)) {
    if ((key === META_KEY || isElementKey(key)) && value !== null && typeof value === "object") patch[key] = value;
  }
  return patch;
};

/**
 * Per-account storage: editor preferences plus a compressed copy of the last
 * board this person worked on, offered back when they open an empty room.
 */
export class Backup {
  #session;
  #store;
  #revision = 0;
  #data = {};
  #loaded = false;
  #prefsTimer = null;
  #boardTimer = null;
  #saving = Promise.resolve();
  tooBig = false;

  constructor(session, store) {
    this.#session = session;
    this.#store = store;
  }

  async load() {
    try {
      const { revision, data } = await this.#session.progress.load();
      this.#revision = revision;
      this.#data = typeof data === "object" && data !== null ? data : {};
    } catch {
      this.#data = {};
    }
    this.#loaded = true;
    const board = this.#data.board;
    return {
      prefs: typeof this.#data.prefs === "object" && this.#data.prefs !== null ? this.#data.prefs : null,
      board: typeof board === "object" && board !== null && (board.gz || board.raw) ? board : null,
    };
  }

  setPrefs(prefs) {
    this.#data.prefs = prefs;
    clearTimeout(this.#prefsTimer);
    this.#prefsTimer = setTimeout(() => this.#queueSave(), PREFS_DELAY_MS);
  }

  /** Call after board edits; the copy is refreshed at most every 20 s. */
  boardChanged() {
    if (this.#boardTimer !== null) return;
    this.#boardTimer = setTimeout(() => {
      this.#boardTimer = null;
      void this.#snapshotBoard().then(() => this.#queueSave());
    }, BOARD_DELAY_MS);
  }

  /** Refreshes the board copy and saves right away (leaving the page, tests). */
  async saveNow() {
    clearTimeout(this.#boardTimer);
    this.#boardTimer = null;
    await this.#snapshotBoard();
    this.#queueSave();
    await this.#saving;
  }

  /** Writes the backup into a room that is still empty; false if someone started drawing first. */
  async restore(board) {
    const patch = boardPatch(await unpackBoard(board));
    if (Object.keys(patch).length === 0) return false;
    const revision = await this.#session.state.set((current) => (hasElements(current) ? undefined : patch));
    return revision !== undefined;
  }

  async #snapshotBoard() {
    const state = this.#store.snapshot();
    const count = Object.keys(state).filter(isElementKey).length;
    if (count === 0) return; // never replace a good copy with an empty board
    const packed = await packBoard(state);
    const size = (packed.gz ?? packed.raw).length;
    this.tooBig = size > BOARD_CHARS;
    if (this.tooBig) return;
    this.#data.board = { ...packed, n: count, at: Date.now(), name: this.#store.meta().name };
  }

  #queueSave() {
    if (!this.#loaded) return;
    this.#saving = this.#saving.then(() => this.#save()).catch(() => undefined);
  }

  async #save() {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        this.#revision = await this.#session.progress.save(this.#data, this.#revision);
        return;
      } catch (error) {
        if (error?.status !== 409) return;
        // Another tab saved meanwhile: take its revision, keep our newer values.
        try {
          const latest = await this.#session.progress.load();
          this.#revision = latest.revision;
        } catch {
          return;
        }
      }
    }
  }
}
