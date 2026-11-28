const recordModes = ['solo', 'sprint', 'sudden', 'relay'];
const settingsKey = 'hackergame_settings';
const recordKey = mode => mode === 'solo' ? 'hackergame_best_run' : 'hackergame_best_run_' + mode;

let data = {};
let progress;
let local;
let revision;
let pending = new Map();
let saving = Promise.resolve();

function readLocal(key) {
  try { return JSON.parse(local.getItem(key)); } catch { return null; }
}

function merge(base, edits) {
  const result = { ...base };
  for (const [key, value] of edits) {
    if (recordModes.includes(key) && Number.isFinite(result[key]?.score) && result[key].score >= value.score) continue;
    result[key] = value;
  }
  return result;
}

async function loadProgress() {
  const latest = await progress.load();
  revision = latest.revision;
  data = merge(latest.data, pending);
}

export async function openStorage(session) {
  if (session) {
    if (session.capabilities.includes('progress')) {
      progress = session.progress;
      try { await loadProgress(); } catch { /* Retry when a score or preference changes. */ }
    }
    return;
  }
  try { local = globalThis.localStorage; } catch { return; }
  if (!local) return;
  data = { ...readLocal(settingsKey) };
  for (const mode of recordModes) data[mode] = readLocal(recordKey(mode));
}

async function savePending() {
  if (!progress || !pending.size) return;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (revision === undefined) await loadProgress();
    const batch = new Map(pending);
    try {
      revision = await progress.save(data, revision);
      for (const [key, value] of batch) {
        if (pending.get(key) === value) pending.delete(key);
      }
      return;
    } catch (error) {
      if (error.status !== 409) throw error;
      revision = undefined;
    }
  }
}

export function flushStorage() {
  saving = saving.then(savePending).catch(() => { /* Keep pending edits for the next save or reconnect. */ });
  return saving;
}

function change(key, value) {
  data = merge(data, [[key, value]]);
  if (progress) {
    pending.set(key, data[key]);
    void flushStorage();
  } else if (local) {
    try {
      if (recordModes.includes(key)) {
        const stored = readLocal(recordKey(key));
        data = merge({ ...data, [key]: stored }, [[key, data[key]]]);
        local.setItem(recordKey(key), JSON.stringify(data[key]));
      } else {
        local.setItem(settingsKey, JSON.stringify({ ...readLocal(settingsKey), [key]: value }));
      }
    } catch { /* Keep the change in memory when browser storage is unavailable. */ }
  }
}

export function loadSettings() {
  return { effects: typeof data.effects === 'boolean' ? data.effects : undefined, sound: data.sound !== false };
}

export function saveSetting(key, enabled) {
  change(key, enabled);
}

export function getBestScore(mode = 'solo') {
  const score = data[mode]?.score;
  return Number.isFinite(score) ? score : 0;
}

export function setBestScore(score, stats, mode) {
  change(mode, { ...stats, score, savedAt: Date.now() });
}
