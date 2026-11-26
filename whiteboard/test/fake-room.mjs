/**
 * In-memory stand-in for a Stellarr room with the SDK's state semantics:
 * writes merge top-level keys ({ ...state, ...patch }), every commit bumps the
 * revision, and every client receives the new snapshot. Writes queue until
 * `pump()` so tests can interleave clients deterministically.
 */
const sortKeys = (value) => {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]));
};

export const createRoom = ({ stateBytes = 256 * 1024, sorted = false } = {}) => {
  let state = {};
  let revision = 0;
  const queue = [];
  const clients = [];
  const size = (value) => new TextEncoder().encode(JSON.stringify(value)).length;

  const broadcast = () => {
    for (const client of clients) client.receive(structuredClone(state), revision);
  };

  const room = {
    get state() {
      return structuredClone(state);
    },
    get revision() {
      return revision;
    },
    get pending() {
      return queue.length;
    },
    client() {
      const listeners = new Set();
      let seen = { state: structuredClone(state), revision };
      const client = {
        writes: 0,
        receive(next, nextRevision) {
          if (nextRevision === seen.revision && nextRevision !== 0) return;
          seen = { state: next, revision: nextRevision };
          for (const listener of listeners) listener(structuredClone(next), nextRevision);
        },
        state: {
          get: () => structuredClone(seen.state),
          subscribe(listener) {
            listeners.add(listener);
            listener(structuredClone(seen.state), seen.revision);
            return () => listeners.delete(listener);
          },
          /** Like the SDK: a patch object, or a pure function of the state (undefined cancels). */
          set(change) {
            client.writes += 1;
            const entry = typeof change === "function" ? change : structuredClone(change);
            return new Promise((resolve, reject) => queue.push({ change: entry, resolve, reject }));
          },
        },
      };
      clients.push(client);
      return client;
    },
    /** Commits queued writes in arrival order, broadcasting after each. */
    async pump() {
      while (queue.length > 0) {
        const { change, resolve, reject } = queue.shift();
        const patch = typeof change === "function" ? change(structuredClone(state)) : change;
        if (patch === undefined) {
          resolve(undefined);
          await settle();
          continue;
        }
        const next = sorted ? sortKeys({ ...state, ...patch }) : { ...state, ...patch };
        if (size(next) > stateBytes) {
          reject(Object.assign(new Error("State is too large."), { status: 413 }));
        } else {
          state = next;
          revision += 1;
          broadcast();
          resolve(revision);
        }
        await settle();
      }
    },
    /** Empties the room the way Stellarr does after everyone left. */
    reset() {
      state = {};
      revision = 0;
      for (const client of clients) client.receive({}, 0);
    },
  };
  return room;
};

/** Lets promise callbacks (store settle → next flush) run. */
export const settle = async () => {
  for (let index = 0; index < 5; index += 1) await Promise.resolve();
};

/** Pumps until no client has anything left to write. */
export const sync = async (room) => {
  for (let round = 0; round < 20; round += 1) {
    await settle();
    if (room.pending === 0) return;
    await room.pump();
  }
};
