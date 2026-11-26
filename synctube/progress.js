// Private, per-account data saved through session.progress (SDK 0.3.0, up to 64 KiB).
// Shared queue and playback stay in session.state.
const SPOT_LIMIT = 40;
const MIN_SPOT = 10;
const FINISHED_MARGIN = 30;

function clean(data) {
  return data && typeof data === "object" && !Array.isArray(data) ? data : {};
}

export function spots(data) {
  const list = clean(data).spots;
  return Array.isArray(list) ? list.filter(spot => spot && typeof spot.videoId === "string") : [];
}

// Remembers where this account stopped in a YouTube video. Near the end counts as finished.
export function rememberSpot(data, spot) {
  const current = clean(data);
  const others = spots(current).filter(item => item.videoId !== spot.videoId);
  const position = Math.floor(spot.position || 0);
  const duration = Math.floor(spot.duration || 0);
  if (position < MIN_SPOT) return current;
  if (duration && position > duration - FINISHED_MARGIN) return { ...current, spots: others };
  const entry = {
    videoId: spot.videoId,
    title: String(spot.title || "").slice(0, 180),
    author: String(spot.author || "").slice(0, 120),
    position,
    duration,
    at: spot.at,
  };
  return { ...current, spots: [entry, ...others].slice(0, SPOT_LIMIT) };
}

export function forgetSpot(data, videoId) {
  const current = clean(data);
  return { ...current, spots: spots(current).filter(item => item.videoId !== videoId) };
}

export function latestSpot(data) {
  return spots(data).reduce((latest, spot) => (!latest || spot.at > latest.at ? spot : latest), null);
}

export function spotFor(data, videoId) {
  return spots(data).find(spot => spot.videoId === videoId) ?? null;
}

export function withPreference(data, key, value) {
  const current = clean(data);
  return { ...current, preferences: { ...clean(current.preferences), [key]: value } };
}

export function preference(data, key) {
  return clean(clean(data).preferences)[key];
}

export function createProgress(session) {
  const api = session?.progress;
  const supported = Boolean(api) && (!Array.isArray(session.capabilities) || session.capabilities.includes("progress"));
  let data = {};
  let revision = 0;
  let loaded = false;
  let pending = [];
  let timer;
  let saving = Promise.resolve();
  const listeners = new Set();

  function notify() {
    for (const listener of listeners) listener(data);
  }

  async function load() {
    if (!supported) return data;
    try {
      const result = await api.load();
      revision = result.revision;
      data = pending.reduce((value, change) => change(value), clean(result.data));
      loaded = true;
      notify();
    } catch {
      // Progress is optional. The room works without it.
    }
    return data;
  }

  async function save() {
    if (!supported || !loaded || !pending.length) return;
    const batch = pending;
    pending = [];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        revision = await api.save(data, revision);
        return;
      } catch (error) {
        if (error?.status !== 409) {
          pending = [...batch, ...pending];
          return;
        }
        // Another device saved first. Reapply this device's changes on top of it.
        const fresh = await api.load();
        revision = fresh.revision;
        data = [...batch, ...pending].reduce((value, change) => change(value), clean(fresh.data));
        notify();
      }
    }
    pending = [...batch, ...pending];
  }

  function flush() {
    clearTimeout(timer);
    saving = saving.then(save, save);
    return saving;
  }

  return {
    supported,
    get data() { return data; },
    load,
    flush,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    update(change, { soon = false } = {}) {
      data = change(data);
      pending.push(change);
      notify();
      clearTimeout(timer);
      timer = setTimeout(flush, soon ? 300 : 4000);
    },
  };
}
