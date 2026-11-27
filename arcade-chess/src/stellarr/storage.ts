/**
 * Saved choices (settings, the bot screen, the language, statistics), kept in the player's
 * Stellarr progress: private to the account, the same in every room and on every device.
 *
 * The progress document is read once before the interface starts; stores read their part from
 * that snapshot synchronously. Writes update the snapshot at once and reach Stellarr shortly after,
 * coalesced, retrying on a revision conflict with the newest copy.
 */

import type { ActivityState, JsonValue } from "@stellarr/sdk";
import { session } from "./sdk";

/** Bumped when a saved shape changes incompatibly; older documents are ignored. */
const VERSION = 1;
const SAVE_DELAY_MS = 800;

let snapshot: Record<string, unknown> = {};
let revision = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let saving: Promise<void> = Promise.resolve();

/** Read the saved document; call once after connecting and before the stores load. */
export async function loadSaved(): Promise<void> {
  try {
    const loaded = await session().progress.load();
    revision = loaded.revision;
    const data = loaded.data as Record<string, unknown> | null;
    snapshot = data && data.v === VERSION ? { ...data } : {};
  } catch (error) {
    console.warn("Could not load saved progress.", error);
  }
}

export function readSaved(key: string): unknown {
  return snapshot[key] ?? null;
}

export function writeSaved(key: string, value: unknown): void {
  snapshot = { ...snapshot, [key]: value };
  if (timer) clearTimeout(timer);
  timer = setTimeout(flush, SAVE_DELAY_MS);
}

function flush(): void {
  timer = null;
  saving = saving.then(save, save);
}

async function save(): Promise<void> {
  const data = { ...snapshot, v: VERSION } as unknown as ActivityState;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      revision = await session().progress.save(data, revision);
      return;
    } catch (error) {
      if ((error as { status?: number }).status !== 409) {
        console.warn("Could not save progress.", error);
        return;
      }
      // Another device saved first: keep its keys we did not touch this session, ours win.
      const latest = await session().progress.load();
      revision = latest.revision;
      const theirs = (latest.data as Record<string, JsonValue> | null) ?? {};
      Object.assign(data, { ...theirs, ...data });
    }
  }
}
