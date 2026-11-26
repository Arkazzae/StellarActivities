// Errors are translation keys from i18n.js so each person reads them in their own language.
const ITEM_LIMIT = 50;
const HISTORY_LIMIT = 100;
export const MAX_SECONDS = 604_800;
export const CHECKPOINT_MS = 5_000;
export const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];
export const SAMPLE_TITLE = "SyncTube cinema sample";

const videoIdPattern = /^[A-Za-z0-9_-]{11}$/;
const videoHosts = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

export function parseYouTube(input) {
  const value = input.trim();
  if (videoIdPattern.test(value)) return { videoId: value, startSeconds: 0 };
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.port) return null;
    const [, first, second, ...rest] = url.pathname.split("/");
    let videoId;
    if (url.hostname === "youtu.be" && !second) videoId = first;
    if (videoHosts.has(url.hostname)) {
      if (first === "watch" && !second) videoId = url.searchParams.get("v");
      if (["embed", "shorts", "live"].includes(first) && !rest.some(Boolean)) videoId = second;
    }
    if (typeof videoId !== "string" || !videoIdPattern.test(videoId)) return null;
    const raw = url.searchParams.get("t") ?? url.searchParams.get("start") ??
      new URLSearchParams(url.hash.slice(1)).get("t") ?? "";
    const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i.exec(raw);
    const seconds = /^\d+$/.test(raw) ? Number(raw) : match
      ? Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0)
      : 0;
    return { videoId, startSeconds: Math.min(MAX_SECONDS, seconds) };
  } catch {
    return null;
  }
}

export function videoTitle(videoId) {
  return `YouTube · ${videoId}`;
}

export function emptyRoom() {
  return {
    current: null,
    queue: [],
    history: [],
    votes: [],
    founder: null,
    notice: null,
    settings: { control: "everyone", autoplay: true, repeat: false },
    playback: { host: null, playing: false, position: 0, at: 0, serial: 0, rate: 1 },
  };
}

// Rooms saved by 0.1.x have no history, votes, settings or rate.
export function normalizeRoom(state) {
  const base = emptyRoom();
  if (!state || typeof state !== "object") return base;
  return {
    ...base,
    ...state,
    queue: Array.isArray(state.queue) ? state.queue : [],
    history: Array.isArray(state.history) ? state.history : [],
    votes: Array.isArray(state.votes) ? state.votes : [],
    founder: typeof state.founder === "string" ? state.founder : null,
    settings: { ...base.settings, ...state.settings },
    playback: { ...base.playback, ...state.playback },
  };
}

export function positionAt(playback, now) {
  const rate = playback.rate || 1;
  const elapsed = playback.playing ? Math.max(0, now - playback.at) / 1000 * rate : 0;
  return Math.min(MAX_SECONDS, playback.position + elapsed);
}

export function formatTime(seconds) {
  const time = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const hours = Math.floor(time / 3600);
  const minutes = Math.floor(time / 60) % 60;
  const remaining = String(time % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${remaining}` : `${minutes}:${remaining}`;
}

export function playbackFor(state, hostId, hostOnline) {
  if (hostOnline && state.playback.host === hostId) return state.playback;
  return { ...state.playback, playing: false };
}

function reanchor(playback, host, now, playing, position, rate = playback.rate || 1) {
  return { host, at: now, playing, position, serial: playback.serial + 1, rate };
}

export function takeover(state, host, now) {
  if (!state.current || state.playback.host === host) return undefined;
  return { playback: reanchor(state.playback, host, now, false, state.playback.position) };
}

export function checkpoint(state, host, now) {
  if (!state.playback.playing || state.playback.host !== host || now - state.playback.at < CHECKPOINT_MS)
    return undefined;
  return { playback: { ...state.playback, at: now, position: positionAt(state.playback, now) } };
}

export function canControl(state, id, host) {
  return state.settings?.control !== "host" || id === host;
}

// The host, the person who started the room and the instance owner can skip without a vote.
export function skipRole(state, id, host, owners = []) {
  if (canControl(state, id, host)) return "control";
  if (owners.includes(id)) return "owner";
  if (id && id === state.founder) return "founder";
  return null;
}

export function voteThreshold(count) {
  return Math.floor(count / 2) + 1;
}

export function liveVotes(state, connected) {
  return (state.votes ?? []).filter(id => connected.includes(id));
}

function checkedPosition(seconds) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0 || seconds > MAX_SECONDS)
    throw new Error("errPosition");
  return seconds;
}

function text(value, limit) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function queuedVideo(action, meta) {
  if (action.source === "sample") {
    return { id: meta.id, source: "sample", title: SAMPLE_TITLE, author: "SyncTube", startSeconds: 0, addedBy: meta.from };
  }
  if (action.source !== "youtube" || typeof action.videoId !== "string" || !videoIdPattern.test(action.videoId))
    throw new Error("errLink");
  return {
    id: meta.id,
    source: "youtube",
    videoId: action.videoId,
    title: text(action.title, 180) || videoTitle(action.videoId),
    author: text(action.author, 120),
    startSeconds: checkedPosition(action.startSeconds ?? 0),
    addedBy: meta.from,
  };
}

const CURRENT_ACTIONS = new Set(["play", "pause", "seek", "skip", "ended", "select", "vote", "rate"]);
const QUIET_MISSES = new Set(["skip", "ended", "vote"]);

export function reduceRoom(input, action, meta, host, now, context = {}) {
  if (!action || typeof action !== "object") throw new Error("errAction");
  if (!host) throw new Error("errNoHost");
  const state = normalizeRoom(input);
  const connected = Array.isArray(context.connected) ? context.connected : [];
  const owners = Array.isArray(context.owners) ? context.owners : [];
  const from = meta.from;
  const transfer = takeover(state, host, now);
  const playback = transfer?.playback ?? state.playback;
  const base = { ...transfer };
  // The first host to accept a command is the person who started the room.
  if (!state.founder) base.founder = host;
  const control = canControl(state, from, host);

  if (CURRENT_ACTIONS.has(action.type) && (!state.current || action.currentId !== state.current.id)) {
    // A second skip, vote or completion can arrive after the room has moved on.
    if (QUIET_MISSES.has(action.type)) return { patch: base, result: false };
    throw new Error("errMoved");
  }

  function start(video, queue, playing) {
    return {
      current: video,
      queue,
      votes: [],
      playback: reanchor(playback, host, now, Boolean(video && playing), video?.startSeconds ?? 0),
    };
  }

  function advance(reason) {
    const reached = Math.round(positionAt(playback, now));
    const history = state.current
      ? [{ video: state.current, at: now, reason, reached }, ...state.history].slice(0, HISTORY_LIMIT)
      : state.history;
    if (reason === "ended" && state.settings.repeat && state.current)
      return { history, ...start(state.current, state.queue, true) };
    const next = state.queue[0] ?? null;
    const playing = reason === "ended" ? state.settings.autoplay : playback.playing || state.settings.autoplay;
    return { history, ...start(next, state.queue.slice(1), playing) };
  }

  function enqueue(video) {
    if (state.queue.length >= ITEM_LIMIT) throw new Error("errQueueLimit");
    return state.current ? { queue: [...state.queue, video] } : start(video, [], state.settings.autoplay);
  }

  let patch;
  let result = true;
  switch (action.type) {
    case "add":
      patch = enqueue(queuedVideo(action, meta));
      break;
    case "replay": {
      const entry = state.history.find(item => item.video?.id === action.id);
      if (!entry) throw new Error("errHistoryGone");
      patch = enqueue({ ...entry.video, id: meta.id, addedBy: from });
      break;
    }
    case "remove":
    case "move":
    case "select": {
      const index = state.queue.findIndex(video => video.id === action.id);
      if (index < 0) throw new Error("errQueueGone");
      const video = state.queue[index];
      if (action.type === "remove" && !control && video.addedBy !== from)
        throw new Error("errRemoveOwn");
      if (action.type !== "remove" && !control) throw new Error("errHostQueue");
      const queue = [...state.queue];
      if (action.type === "move") {
        if (action.direction !== -1 && action.direction !== 1) throw new Error("errDirection");
        const target = index + action.direction;
        if (target < 0 || target >= queue.length) return { patch: base, result: false };
        [queue[index], queue[target]] = [queue[target], queue[index]];
        patch = { queue };
      } else if (action.type === "remove") {
        queue.splice(index, 1);
        patch = { queue };
      } else {
        queue.splice(index, 1);
        const history = [{ video: state.current, at: now, reason: "skipped", reached: Math.round(positionAt(playback, now)) },
          ...state.history].slice(0, HISTORY_LIMIT);
        patch = { history, ...start(video, queue, true) };
      }
      break;
    }
    case "play":
    case "pause": {
      if (!control) throw new Error("errHostPlayback");
      const playing = action.type === "play";
      patch = playing === playback.playing ? {} :
        { playback: reanchor(playback, host, now, playing, positionAt(playback, now)) };
      break;
    }
    case "seek":
      if (!control) throw new Error("errHostPlayback");
      patch = { playback: reanchor(playback, host, now, playback.playing, checkedPosition(action.position)) };
      break;
    case "rate":
      if (!control) throw new Error("errHostPlayback");
      if (!RATES.includes(action.rate)) throw new Error("errRate");
      patch = { playback: reanchor(playback, host, now, playback.playing, positionAt(playback, now), action.rate) };
      break;
    case "skip": {
      const role = skipRole(state, from, host, owners);
      if (!role) throw new Error("errSkip");
      patch = advance("skipped");
      if (role !== "control") patch.notice = { kind: role, by: from, at: now };
      break;
    }
    case "ended":
      if (from !== host) throw new Error("errEnded");
      if (!playback.playing || action.serial !== playback.serial) return { patch: base, result: false };
      patch = advance("ended");
      break;
    case "vote": {
      if (!connected.includes(from)) throw new Error("errVoteJoin");
      const votes = state.votes.includes(from) ? state.votes.filter(id => id !== from) : [...state.votes, from];
      const live = votes.filter(id => connected.includes(id));
      if (live.length >= voteThreshold(connected.length)) {
        patch = { ...advance("skipped"), notice: { kind: "vote", by: from, at: now } };
        result = "skipped";
      } else {
        patch = { votes: live };
      }
      break;
    }
    case "settings": {
      if (from !== host) throw new Error("errSettingsHost");
      const next = { ...state.settings };
      if (action.control !== undefined) {
        if (!["everyone", "host"].includes(action.control)) throw new Error("errControlMode");
        next.control = action.control;
      }
      for (const key of ["autoplay", "repeat"]) {
        if (action[key] === undefined) continue;
        if (typeof action[key] !== "boolean") throw new Error("errSetting");
        next[key] = action[key];
      }
      patch = { settings: next };
      break;
    }
    case "clearHistory":
      if (from !== host) throw new Error("errClearHost");
      patch = { history: [] };
      break;
    default:
      throw new Error("errAction");
  }
  return { patch: { ...base, ...patch }, result };
}

export function effectiveVolume(localVolume, roomVolume, muted) {
  return muted ? 0 : localVolume * roomVolume;
}
