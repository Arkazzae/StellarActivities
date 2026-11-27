/**
 * The Stellarr session. Inside Stellarr (or `stellarr dev`) the host serves its SDK at
 * /_stellarr/sdk/v1.js and the activity joins the room through it. Opened any other way
 * (plain `vite dev`) there is no room, so a local stand-in gives a one-player session with
 * the same surface: commands are decided on the spot by the same handlers.
 */
import type { ActivityState, CommandHandler, JsonValue, Participant, Session } from "./types.ts";

const SDK_URL = "/_stellarr/sdk/v1.js";

let current: Session | null = null;
let local = false;

/** Whether this is a real Stellarr room (or `stellarr dev`), not the offline stand-in. */
export const inStellarr = () => !!current && !local;

export async function connectSession<S extends ActivityState>(initialState: S): Promise<Session<S>> {
  if (current) return current as unknown as Session<S>;
  if (window.parent !== window) {
    try {
      const sdk = (await import(/* @vite-ignore */ SDK_URL)) as { connect: (options: { initialState: S }) => Promise<Session<S>> };
      current = (await sdk.connect({ initialState })) as unknown as Session;
      return current as unknown as Session<S>;
    } catch (error) {
      console.warn("Stellarr session unavailable, playing offline.", error);
    }
  }
  local = true;
  current = localSession(initialState as ActivityState);
  return current as unknown as Session<S>;
}

/** A canned room for screenshots of one screen: fixed people, host and own assignment. */
export interface Preview {
  me: Participant;
  people: Participant[];
  host: string;
  mine: JsonValue;
  /** The language to show, like a player's Stellarr interface would. */
  locale?: string;
}

export function previewSession<S extends ActivityState>(state: S, preview: Preview): Session<S> {
  local = true;
  current = localSession(state as ActivityState, preview);
  return current as unknown as Session<S>;
}

function observable<T>(initial: T) {
  let value = initial;
  const listeners = new Set<(value: T) => void>();
  return {
    get: () => value,
    subscribe(listener: (value: T) => void) {
      listeners.add(listener);
      listener(value);
      return () => { listeners.delete(listener); };
    },
    set(next: T) {
      value = next;
      for (const listener of listeners) listener(value);
    },
  };
}

/**
 * Offline GIFs for plain `vite dev`: the game's own placeholder stills, the same answer for
 * every query. `stellarr dev` has its own offline set, and Stellarr asks GIPHY.
 */
const DEMO = ["raccoon-cash", "cat-shades", "dog-dance", "goose-shop", "fireworks", "dog-tears"];

function demoGifs(): Session["media"]["gifs"] {
  const items = DEMO.map((name) => ({ id: `demo${name.replace(/-/g, "")}`, alt: name.replace(/-/g, " "), width: 640, height: 480 }));
  return {
    search: (query = "") => {
      const shift = [...query].reduce((sum, char) => sum + char.charCodeAt(0), 0) % items.length;
      return Promise.resolve({ items: [...items.slice(shift), ...items.slice(0, shift)], offset: 0, total: items.length });
    },
    load: (id) => {
      const index = items.findIndex((item) => item.id === id);
      if (index < 0) return Promise.reject(Object.assign(new Error("No such GIF"), { code: "notFound" }));
      const item = items[index];
      return Promise.resolve({ url: `./art/demo/${DEMO[index]}.webp`, type: "image/webp", width: item.width, height: item.height, alt: item.alt, release() {} });
    },
  };
}

function localSession(initialState: ActivityState, preview?: Preview): Session {
  const me: Participant = preview?.me ?? { id: "local-player", name: "Gracz", avatar: null, connected: true };
  const device = window.matchMedia?.("(pointer: coarse)").matches ? (Math.min(screen.width, screen.height) >= 600 ? "tablet" : "phone") : "desktop";
  let state: ActivityState = structuredClone(initialState);
  let revision = 1;
  let progress: ActivityState | null = null;
  let progressRevision = 0;
  const stateListeners = new Set<(state: ActivityState, revision: number) => void>();
  const handlers = new Map<string, CommandHandler<ActivityState>>();
  const assignments = observable<JsonValue>(preview?.mine ?? null);
  const allAssignments: Record<string, JsonValue> = preview ? { [me.id]: preview.mine } : {};
  const people = preview?.people ?? [me];
  const listeners = new Map<string, Set<(data: JsonValue | Uint8Array, meta: { from: string }) => void>>();

  const publish = (patch: Partial<ActivityState> | void | undefined) => {
    if (!patch) return revision;
    state = { ...state, ...patch } as ActivityState;
    revision++;
    for (const listener of stateListeners) listener(structuredClone(state), revision);
    return revision;
  };

  return {
    context: { standalone: true, launchMode: "personal", sessionId: "local", me, place: null, locale: preview?.locale ?? navigator.language, device },
    limits: { stateBytes: 262_144, messageBytes: 65_536, writesPerSecond: 32, messagesPerSecond: 96, graceSeconds: 10, emptySeconds: 120, maxParticipants: 1 },
    capabilities: ["progress", "host", "commands", "assignments"],
    now: () => Date.now(),
    close: () => Promise.resolve(),
    connection: observable<"connected" | "reconnecting" | "closed">("connected"),
    locale: observable(preview?.locale ?? navigator.language),
    device: observable(device),
    progress: {
      load: () => Promise.resolve({ revision: progressRevision, data: progress }),
      save(data: ActivityState, expected: number) {
        if (expected !== progressRevision) return Promise.reject(Object.assign(new Error("Conflict"), { status: 409 }));
        progress = structuredClone(data);
        return Promise.resolve(++progressRevision);
      },
    },
    media: { volume: observable(1), gifs: demoGifs() },
    participants: observable(people),
    // Alone in the room: a message to oneself is delivered locally, anything else goes nowhere.
    send(kind, data, options) {
      if (options?.to && options.to !== me.id) return false;
      const payload = data instanceof ArrayBuffer ? new Uint8Array(data) : ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : data;
      queueMicrotask(() => { for (const listener of listeners.get(kind) ?? []) listener(payload as JsonValue | Uint8Array, { from: me.id }); });
      return true;
    },
    on(kind, listener) {
      const set = listeners.get(kind) ?? new Set();
      set.add(listener);
      listeners.set(kind, set);
      return () => { set.delete(listener); };
    },
    state: {
      get: () => structuredClone(state),
      subscribe(listener) {
        stateListeners.add(listener);
        listener(structuredClone(state), revision);
        return () => { stateListeners.delete(listener); };
      },
      set(change: Partial<ActivityState> | ((current: ActivityState) => Partial<ActivityState> | void)) {
        const patch = typeof change === "function" ? change(structuredClone(state)) : change;
        return Promise.resolve(publish(patch ?? undefined));
      },
    } as Session["state"],
    seats: Object.assign(observable(people.map((p) => p.id)), { claim: () => Promise.resolve(), release: () => Promise.resolve() }),
    assignments: Object.assign(assignments, {
      checkpoint: () => Promise.resolve({ revision, state: structuredClone(state), assignments: structuredClone(allAssignments) }),
    }),
    host: observable<string | null>(preview?.host ?? me.id),
    commands: {
      handle(kind, handler) {
        handlers.set(kind, handler);
        return () => { handlers.delete(kind); };
      },
      async submit(kind, data, options) {
        const handler = handlers.get(kind);
        if (!handler) throw new Error(`No handler for ${kind}`);
        const decision = await handler(structuredClone(data), { id: options?.id ?? crypto.randomUUID(), from: me.id }, structuredClone(state), { assignments: structuredClone(allAssignments) });
        if (!decision) return undefined;
        if (decision.assignments) {
          for (const [id, value] of Object.entries(decision.assignments)) {
            if (value === null) delete allAssignments[id];
            else allAssignments[id] = value;
          }
          assignments.set(structuredClone(allAssignments[me.id] ?? null));
        }
        publish(decision.patch);
        return decision.result;
      },
    },
  };
}
