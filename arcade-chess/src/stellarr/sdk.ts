/**
 * The Stellarr session. Inside Stellarr (or `stellarr dev`) the host serves its SDK at
 * /_stellarr/sdk/v1.js and the activity joins the room through it. Opened any other way (plain
 * `vite dev`, a file on disk) there is no room: a local stand-in gives a solo session with the
 * same surface, so bot games and settings still work.
 */

import type { ActivityState, DevSession, JsonValue, Participant } from "@stellarr/sdk";

export type Session = DevSession<ActivityState>;

/** The host's SDK, loaded at run time so the activity always speaks the host's own version. */
const SDK_URL = "/_stellarr/sdk/v1.js";

let current: Session | null = null;
/** The local stand-in is in use (no Stellarr room). Not `context.standalone`: `stellarr dev` sets that too. */
let local = false;

export function session(): Session {
  if (!current) throw new Error("The Stellarr session is not connected yet.");
  return current;
}

/** Whether the session is a Stellarr room (a real one or `stellarr dev`), not the local stand-in. */
export function inStellarr(): boolean {
  return !!current && !local;
}

/** A voice-channel room where other people can join the board. */
export function isVoiceRoom(): boolean {
  return inStellarr() && current!.context.launchMode === "voice";
}

export async function connectSession(initialState: ActivityState): Promise<Session> {
  if (current) return current;
  if (window.parent !== window) {
    try {
      const sdk = (await import(/* @vite-ignore */ SDK_URL)) as { connect: (options: { initialState: ActivityState }) => Promise<Session> };
      current = await sdk.connect({ initialState });
      return current;
    } catch (error) {
      console.warn("Stellarr session unavailable, playing offline.", error);
    }
  }
  local = true;
  current = localSession(initialState);
  return current;
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

const PROGRESS_KEY = "arcade-chess:progress";

function readLocal(): ActivityState | null {
  try {
    const raw = window.localStorage.getItem(PROGRESS_KEY);
    return raw ? (JSON.parse(raw) as ActivityState) : null;
  } catch {
    return null;
  }
}

/** One player alone with the board: commands are decided on the spot by the same handlers. */
function localSession(initialState: ActivityState): Session {
  const me: Participant = { id: "local-player", name: "Player", avatar: null, connected: true };
  const device = window.matchMedia?.("(pointer: coarse)").matches ? (Math.min(screen.width, screen.height) >= 600 ? "tablet" : "phone") : "desktop";
  let state: ActivityState = structuredClone(initialState);
  let revision = 1;
  let progressRevision = readLocal() ? 1 : 0;
  const stateListeners = new Set<(state: ActivityState, revision: number) => void>();
  const handlers = new Map<string, Parameters<Session["commands"]["handle"]>[1]>();
  const publish = (patch: Partial<ActivityState> | void | undefined) => {
    if (!patch) return;
    state = { ...state, ...patch } as ActivityState;
    revision++;
    for (const listener of stateListeners) listener(structuredClone(state), revision);
  };
  const unsupported = () => Promise.reject(new Error("Not available offline."));
  const fake = {
    context: { standalone: true, launchMode: "personal", sessionId: "local", me, place: null, locale: navigator.language, device },
    limits: { stateBytes: 262_144, messageBytes: 65_536, writesPerSecond: 32, messagesPerSecond: 96, graceSeconds: 10, emptySeconds: 120, maxParticipants: 1 },
    capabilities: [],
    now: () => Date.now(),
    close: () => Promise.resolve(),
    connection: observable<"connected" | "reconnecting" | "closed">("connected"),
    theme: observable({ mode: "dark", colors: { background: "#302e2b", surface: "#262522", text: "#ffffff", muted: "#9b9a97", accent: "#81b64c", border: "#3c3a37" } }),
    locale: observable(navigator.language),
    device: observable(device),
    progress: {
      load: () => Promise.resolve({ revision: progressRevision, data: readLocal() }),
      save(data: ActivityState, expected: number) {
        if (expected !== progressRevision) return Promise.reject(Object.assign(new Error("Conflict"), { status: 409 }));
        try { window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(data)); } catch { /* storage is optional */ }
        return Promise.resolve(++progressRevision);
      },
    },
    media: {
      volume: observable(1),
      microphoneLevel: { open: unsupported },
      cameraTile: { mount: unsupported },
      embed: { mount: unsupported },
    },
    participants: observable([me]),
    send: () => false,
    on: () => () => undefined,
    state: {
      get: () => structuredClone(state),
      subscribe(listener: (state: ActivityState, revision: number) => void) {
        stateListeners.add(listener);
        listener(structuredClone(state), revision);
        return () => { stateListeners.delete(listener); };
      },
      async set(change: Partial<ActivityState> | ((current: ActivityState) => Partial<ActivityState> | void)) {
        const patch = typeof change === "function" ? change(structuredClone(state)) : change;
        if (patch === undefined) return undefined;
        publish(patch);
        return revision;
      },
    },
    seats: Object.assign(observable([me.id]), { claim: () => Promise.resolve(), release: () => Promise.resolve() }),
    assignments: Object.assign(observable<JsonValue>(null), { checkpoint: () => Promise.resolve({ revision, state, assignments: {} }) }),
    host: Object.assign(observable<string | null>(me.id), { transfer: () => Promise.resolve() }),
    commands: {
      handle(kind: string, handler: Parameters<Session["commands"]["handle"]>[1]) {
        handlers.set(kind, handler);
        return () => { handlers.delete(kind); };
      },
      async submit(kind: string, data: JsonValue) {
        const handler = handlers.get(kind);
        if (!handler) throw Object.assign(new Error(`No handler for ${kind}.`), { status: 404 });
        const decision = await handler(data, { id: crypto.randomUUID(), from: me.id }, structuredClone(state), { assignments: {} });
        publish(decision?.patch);
        return decision?.result;
      },
    },
  };
  return fake as unknown as Session;
}
