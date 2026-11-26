const ITEM_LIMIT = 50;
export const MAX_SECONDS = 604_800;
export const CHECKPOINT_MS = 5_000;
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
  return `YouTube video · ${videoId}`;
}

export function emptyRoom() {
  return {
    current: null,
    queue: [],
    playback: { host: null, playing: false, position: 0, at: 0, serial: 0 },
  };
}

export function positionAt(playback, now) {
  const elapsed = playback.playing ? Math.max(0, now - playback.at) / 1000 : 0;
  return Math.min(MAX_SECONDS, playback.position + elapsed);
}

export function formatTime(seconds) {
  const time = Math.floor(seconds);
  const hours = Math.floor(time / 3600);
  const minutes = Math.floor(time / 60) % 60;
  const remaining = String(time % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${remaining}` : `${minutes}:${remaining}`;
}

export function playbackFor(state, hostId, hostOnline) {
  if (hostOnline && state.playback.host === hostId) return state.playback;
  return { ...state.playback, playing: false };
}

function reanchor(playback, host, now, playing, position) {
  return { host, at: now, playing, position, serial: playback.serial + 1 };
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

function checkedPosition(seconds) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0 || seconds > MAX_SECONDS)
    throw new Error("Choose a valid point in the video.");
  return seconds;
}

function queuedVideo(action, meta) {
  if (action.source === "sample") {
    return { id: meta.id, source: "sample", title: SAMPLE_TITLE, startSeconds: 0, addedBy: meta.from };
  }
  if (action.source !== "youtube" || typeof action.videoId !== "string" || !videoIdPattern.test(action.videoId))
    throw new Error("Add a valid YouTube video link.");
  const title = typeof action.title === "string" ? action.title.trim().slice(0, 180) : "";
  return {
    id: meta.id,
    source: "youtube",
    videoId: action.videoId,
    title: title || videoTitle(action.videoId),
    startSeconds: checkedPosition(action.startSeconds),
    addedBy: meta.from,
  };
}

const CURRENT_ACTIONS = new Set(["play", "pause", "seek", "skip", "ended", "select"]);

export function reduceRoom(state, action, meta, host, now) {
  if (!action || typeof action !== "object") throw new Error("Choose a valid room action.");
  if (!host) throw new Error("Wait for a host to reconnect.");
  const transfer = takeover(state, host, now);
  const playback = transfer?.playback ?? state.playback;

  if (CURRENT_ACTIONS.has(action.type) && (!state.current || action.currentId !== state.current.id)) {
    // A second skip or completion can arrive after another participant has advanced the queue.
    if (action.type === "skip" || action.type === "ended") return { patch: transfer, result: false };
    throw new Error("The room moved to another video.");
  }

  function start(video, queue, playing) {
    return {
      current: video,
      queue,
      playback: reanchor(playback, host, now, Boolean(video && playing), video?.startSeconds ?? 0),
    };
  }

  let patch;
  switch (action.type) {
    case "add": {
      if (state.queue.length >= ITEM_LIMIT) throw new Error("The queue holds up to 50 videos.");
      const video = queuedVideo(action, meta);
      patch = state.current ? { ...transfer, queue: [...state.queue, video] } : start(video, [], false);
      break;
    }
    case "remove":
    case "move":
    case "select": {
      const index = state.queue.findIndex(video => video.id === action.id);
      if (index < 0) throw new Error("This video has left the queue.");
      const queue = [...state.queue];
      if (action.type === "move") {
        if (action.direction !== -1 && action.direction !== 1) throw new Error("Choose a queue direction.");
        const target = index + action.direction;
        if (target < 0 || target >= queue.length) return { patch: transfer, result: false };
        [queue[index], queue[target]] = [queue[target], queue[index]];
      } else {
        const [video] = queue.splice(index, 1);
        if (action.type === "select") return { patch: start(video, queue, true), result: true };
      }
      patch = { ...transfer, queue };
      break;
    }
    case "play":
    case "pause": {
      const playing = action.type === "play";
      patch = playing === playback.playing ? transfer :
        { playback: reanchor(playback, host, now, playing, positionAt(playback, now)) };
      break;
    }
    case "seek":
      patch = { playback: reanchor(playback, host, now, playback.playing, checkedPosition(action.position)) };
      break;
    case "ended":
      if (meta.from !== host) throw new Error("The host confirms when a video ends.");
      if (!playback.playing || action.serial !== playback.serial) return { patch: transfer, result: false };
      // Fall through to the same atomic transition as Skip.
    case "skip":
      patch = start(state.queue[0] ?? null, state.queue.slice(1), playback.playing);
      break;
    default:
      throw new Error("Choose a valid room action.");
  }
  return { patch, result: true };
}

export function effectiveVolume(localVolume, roomVolume, muted) {
  return muted ? 0 : localVolume * roomVolume;
}
