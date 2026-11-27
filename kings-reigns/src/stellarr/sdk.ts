/**
 * The Stellarr session. Inside Stellarr (or `stellarr dev`) the host serves its SDK at
 * /_stellarr/sdk/v1.js and the activity joins the room through it. Opened any other way (plain
 * `vite dev`) a local stand-in gives a solo room with the same surface: commands are decided on
 * the spot by the same rules, and the player's own note arrives through the same observable.
 */

import type { ActivityState, DevSession, JsonValue, Participant } from "@stellarr/sdk";

export type Session = DevSession<ActivityState>;

const SDK_URL = "/_stellarr/sdk/v1.js";

let current: Session | null = null;
let local = false;

export function session(): Session {
  if (!current) throw new Error("The Stellarr session is not connected yet.");
  return current;
}

export function inStellarr(): boolean {
  return !!current && !local;
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

/** One player alone at the table: commands are decided on the spot by the same handlers. */
function localSession(initialState: ActivityState): Session {
  const me: Participant = { id: "local-player", name: "Ty", avatar: null, connected: true };
  const device = window.matchMedia?.("(pointer: coarse)").matches ? (Math.min(screen.width, screen.height) >= 600 ? "tablet" : "phone") : "desktop";
  let state: ActivityState = structuredClone(initialState);
  let revision = 1;
  const stateListeners = new Set<(state: ActivityState, revision: number) => void>();
  const handlers = new Map<string, Parameters<Session["commands"]["handle"]>[1]>();
  const assignment = observable<JsonValue>(null);
  const privateNotes: Record<string, JsonValue> = {};
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
    theme: observable({ mode: "dark", colors: { background: "#0e0f0c", surface: "#151a16", text: "#eeebdf", muted: "#a9ad9c", accent: "#d4a446", border: "#2a302a" } }),
    locale: observable(navigator.language),
    device: observable(device),
    progress: {
      load: () => Promise.resolve({ revision: 0, data: null }),
      save: () => Promise.resolve(1),
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
    assignments: Object.assign(assignment, { checkpoint: () => Promise.resolve({ revision, state, assignments: { ...privateNotes } }) }),
    host: Object.assign(observable<string | null>(me.id), { transfer: () => Promise.resolve() }),
    commands: {
      handle(kind: string, handler: Parameters<Session["commands"]["handle"]>[1]) {
        handlers.set(kind, handler);
        return () => { handlers.delete(kind); };
      },
      async submit(kind: string, data: JsonValue) {
        const handler = handlers.get(kind);
        if (!handler) throw Object.assign(new Error(`No handler for ${kind}.`), { status: 404 });
        const decision = await handler(data, { id: crypto.randomUUID(), from: me.id }, structuredClone(state), { assignments: { ...privateNotes } });
        if (decision?.assignments) {
          for (const [id, value] of Object.entries(decision.assignments)) {
            if (value === null) delete privateNotes[id];
            else privateNotes[id] = value;
          }
          assignment.set(privateNotes[me.id] ?? null);
        }
        publish(decision?.patch);
        return decision?.result;
      },
    },
  };
  return fake as unknown as Session;
}
