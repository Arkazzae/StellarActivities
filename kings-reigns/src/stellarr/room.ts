/**
 * The room as the interface sees it: the shared state, who is here, who hosts, this player's
 * own note. Registers the rules with the SDK (every client does; the elected host runs them),
 * nudges the clock from the host's client, and sends the player's commands.
 */

import { useSyncExternalStore } from "react";
import type { ActivityState, JsonValue, Participant } from "@stellarr/sdk";
import { COMMANDS, INITIAL_STATE, decide, needsNudge, nudgeKey, roleOf, type Assignment, type SharedState } from "@/game/rules";
import { connectSession, session } from "./sdk";

export interface RoomView {
  ready: boolean;
  me: string;
  state: SharedState;
  participants: Participant[];
  host: string | null;
  assignment: Assignment | null;
  launchMode: "voice" | "personal";
  device: "desktop" | "tablet" | "phone";
  connection: "connected" | "reconnecting" | "closed";
  error: string | null;
}

let view: RoomView = {
  ready: false,
  me: "",
  state: INITIAL_STATE,
  participants: [],
  host: null,
  assignment: null,
  launchMode: "personal",
  device: "desktop",
  connection: "connected",
  error: null,
};

const listeners = new Set<() => void>();

function update(next: Partial<RoomView>): void {
  view = { ...view, ...next };
  for (const listener of listeners) listener();
}

export function useRoom(): RoomView {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => view,
  );
}

export function roomNow(): number {
  try {
    return session().now();
  } catch {
    return Date.now();
  }
}

let errorTimer: ReturnType<typeof setTimeout> | undefined;

function showError(message: string): void {
  update({ error: message });
  clearTimeout(errorTimer);
  errorTimer = setTimeout(() => update({ error: null }), 4000);
}

/** Send a command to the host; a refusal is shown for a few seconds. */
export async function send(kind: string, data: Record<string, JsonValue> = {}, id?: string): Promise<void> {
  try {
    await session().commands.submit(kind, data, id ? { id } : undefined);
  } catch (error) {
    showError(error instanceof Error ? error.message : String(error));
  }
}

export async function startRoom(): Promise<void> {
  const s = await connectSession(INITIAL_STATE as unknown as ActivityState);
  const me = s.context.me.id;

  for (const kind of COMMANDS) {
    s.commands.handle(kind, (data, meta, current) => {
      const decision = decide(kind, data, { ...INITIAL_STATE, ...(current as Partial<SharedState>) } as SharedState, {
        from: meta.from,
        now: s.now(),
        host: s.host.get(),
        roster: s.participants.get(),
        random: Math.random,
      });
      return {
        patch: decision.patch as Partial<ActivityState> | undefined,
        assignments: decision.assignments as Record<string, JsonValue> | undefined,
        result: (decision.result ?? null) as JsonValue,
      };
    });
  }

  update({ ready: true, me, launchMode: s.context.launchMode, device: s.device.get() });
  s.state.subscribe((state) => update({ state: { ...INITIAL_STATE, ...(state as Partial<SharedState>) } as SharedState }));
  s.participants.subscribe((participants) => update({ participants }));
  s.host.subscribe((host) => update({ host }));
  s.device.subscribe((device) => update({ device }));
  s.connection.subscribe((connection) => update({ connection }));
  s.assignments.subscribe((assignment) => update({ assignment: (assignment as Assignment | null) ?? null }));

  // Ask for this seat's own note whenever a running game leaves us without one (a reload, a return after a drop).
  let asked = "";
  const askForNote = () => {
    const state = view.state;
    if (state.phase === "lobby" || view.assignment || !roleOf(state, me)) return;
    const key = `${state.phase}-${state.year}`;
    if (asked === key) return;
    asked = key;
    void send("hello");
  };
  s.state.subscribe(() => askForNote());

  // The host's client moves bots and deadlines along: it runs the rules itself and submits a
  // nudge only when something is due, so the room's command log grows by one entry per step.
  setInterval(() => {
    if (s.host.get() !== me || !needsNudge(view.state)) return;
    const ctx = { from: me, now: s.now(), host: me, roster: s.participants.get(), random: () => 0.5 };
    let due = false;
    try {
      const decision = decide("nudge", {}, view.state, ctx);
      due = !!(decision.patch || decision.assignments);
    } catch {
      return;
    }
    if (!due) return;
    s.commands.submit("nudge", {}, { id: `${nudgeKey(view.state)}-${Math.floor(ctx.now / 5000)}` }).catch(() => undefined);
  }, 1000);
}
