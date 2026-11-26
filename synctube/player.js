const YOUTUBE_API = "https://www.youtube.com/iframe_api";
const YOUTUBE_EMBED = "https://www.youtube-nocookie.com/embed/";
const RESYNC_SECONDS = 1.5;

let youtubeReady;

function loadYouTube() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeReady) return youtubeReady;
  youtubeReady = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = YOUTUBE_API;
    script.referrerPolicy = "origin";
    const deadline = setTimeout(fail, 10_000);
    function fail() {
      clearTimeout(deadline);
      script.remove();
      window.onYouTubeIframeAPIReady = undefined;
      youtubeReady = undefined;
      reject(new Error("errYouTubeApi"));
    }
    script.addEventListener("error", fail, { once: true });
    window.onYouTubeIframeAPIReady = () => {
      if (!window.YT?.Player) {
        fail();
        return;
      }
      clearTimeout(deadline);
      window.onYouTubeIframeAPIReady = undefined;
      resolve(window.YT);
    };
    document.head.append(script);
  });
  return youtubeReady;
}

// Status messages are translation keys; app.js turns them into text.
function youtubeError(code) {
  if (code === 2 || code === 100) return "errUnavailable";
  if (code === 101 || code === 150) return "errEmbedDisabled";
  if (code === 153) return "errEmbedIdentity";
  return "errGeneric";
}

function mountYouTube(item, mount, events, hosted) {
  if (hosted) return hosted.mount(item.videoId, mount, {
    ready: events.ready,
    blocked: events.blocked,
    error: code => events.error(youtubeError(code)),
    stateChange(state) {
      if (state === 1) events.playing();
      if (state === 0) events.ended();
    },
  });
  let player;
  let disposed = false;
  const deadline = setTimeout(() => events.error("errTimeout"), 16_000);
  loadYouTube().then(api => {
    if (disposed) return;
    const frame = document.createElement("iframe");
    frame.id = "synctube-youtube";
    frame.title = "YouTube video player";
    frame.allow = "autoplay; encrypted-media; fullscreen; picture-in-picture";
    frame.allowFullscreen = true;
    frame.setAttribute("credentialless", "");
    frame.referrerPolicy = "origin";
    const params = new URLSearchParams({
      enablejsapi: "1",
      origin: location.origin,
      controls: "0",
      disablekb: "1",
      playsinline: "1",
      rel: "0",
      start: String(Math.floor(item.startSeconds)),
    });
    frame.src = `${YOUTUBE_EMBED}${item.videoId}?${params}`;
    mount.replaceChildren(frame);
    player = new api.Player(frame.id, {
      events: {
        onReady({ target }) {
          if (disposed) return;
          player = target;
          clearTimeout(deadline);
          events.ready();
        },
        onStateChange({ data }) {
          if (disposed) return;
          if (data === 1) events.playing();
          if (data === 0) events.ended();
        },
        onAutoplayBlocked() {
          if (!disposed) events.blocked();
        },
        onError({ data }) {
          if (disposed) return;
          clearTimeout(deadline);
          events.error(youtubeError(data));
        },
      },
    });
  }).catch(error => {
    if (disposed) return;
    clearTimeout(deadline);
    events.error(error.message === "errYouTubeApi" ? "errYouTubeApi" : "errGeneric");
  });

  return {
    prepare(target, playing) {
      const args = { videoId: item.videoId, startSeconds: target };
      if (playing) player.loadVideoById(args);
      else player.cueVideoById(args);
    },
    time: () => player?.getCurrentTime?.() || 0,
    duration: () => player?.getDuration?.() || 0,
    running: () => [1, 3].includes(player.getPlayerState()),
    seek: position => player.seekTo(position, true),
    rate: value => player?.setPlaybackRate?.(value),
    play: () => player.playVideo(),
    pause: () => player.pauseVideo(),
    volume(value) {
      player.setVolume(Math.round(value * 100));
      if (value === 0) player.mute();
      else player.unMute();
    },
    destroy() {
      disposed = true;
      clearTimeout(deadline);
      player?.destroy?.();
      mount.replaceChildren();
    },
  };
}

function mountSample(mount, events) {
  const video = document.createElement("video");
  video.title = "SyncTube sample video";
  video.playsInline = true;
  video.preload = "auto";
  video.addEventListener("loadedmetadata", events.ready, { once: true });
  video.addEventListener("playing", events.playing);
  video.addEventListener("ended", events.ended);
  video.addEventListener("error", () => events.error("errSample"));
  video.src = new URL("./assets/sample.mp4", import.meta.url);
  mount.replaceChildren(video);

  function play() {
    video.play().catch(error => {
      if (error.name === "NotAllowedError") events.blocked();
      else if (error.name !== "AbortError") events.error("errSampleBrowser");
    });
  }
  return {
    prepare(target, playing) {
      video.currentTime = target;
      if (playing) play();
    },
    time: () => video.currentTime,
    duration: () => Number.isFinite(video.duration) ? video.duration : 0,
    running: () => !video.paused && !video.ended,
    seek: position => { video.currentTime = position; },
    rate: value => { video.playbackRate = value; },
    play,
    pause: () => video.pause(),
    volume(value) {
      video.volume = value;
      video.muted = value === 0;
    },
    destroy() {
      video.pause();
      video.removeAttribute("src");
      video.load();
      mount.replaceChildren();
    },
  };
}

export function createPlayer(item, mount, view) {
  let ready = false;
  let failed = false;
  let blocked = false;
  let disposed = false;
  let prepared = false;
  let endedAt;
  let target;
  let lastMode;
  let lastSerial;
  let lastChange = 0;
  let volume = 1;
  let rate = 1;
  let drift = null;

  const events = {
    ready() {
      if (disposed || failed) return;
      ready = true;
      provider.volume(volume);
      view.status(null);
      sync();
    },
    playing() {
      if (disposed || failed) return;
      blocked = false;
      view.status(null);
    },
    error(message) {
      if (disposed) return;
      failed = true;
      view.status("error", message);
    },
    blocked() {
      if (disposed || failed || !target?.playing) return;
      blocked = true;
      view.status("blocked");
    },
    ended() {
      if (disposed || failed || !target?.playing) return;
      const duration = provider.duration();
      if (duration > 0 && provider.time() >= duration - 1.5) {
        endedAt = duration;
        view.ended(duration);
      }
    },
  };

  view.status("loading", item.source === "sample" ? "loadingSample" : "loadingYouTube");
  const provider = item.source === "sample" ? mountSample(mount, events) : mountYouTube(item, mount, events, view.youtube);

  function sync() {
    if (!ready || !target || failed) return;
    const duration = provider.duration();
    const position = duration > 0 ? Math.min(target.position, Math.max(0, duration - 0.1)) : target.position;
    const playing = target.playing;
    const now = performance.now();
    if (provider.rate && (target.rate || 1) !== rate) {
      rate = target.rate || 1;
      provider.rate(rate);
    }
    if (!prepared) {
      prepared = true;
      lastSerial = target.serial;
      lastMode = playing;
      lastChange = now;
      provider.prepare(position, playing);
      return;
    }
    const newAnchor = target.serial !== lastSerial || lastMode !== playing;
    if (endedAt && newAnchor && position < endedAt - 1.5) endedAt = undefined;
    if (endedAt && playing) {
      view.ended(endedAt);
      return;
    }
    const gap = Math.abs(provider.time() - position);
    drift = playing ? gap : 0;
    if (newAnchor || (gap > RESYNC_SECONDS && now - lastChange > 1800 && !blocked)) {
      if (gap > (newAnchor ? 0.2 : RESYNC_SECONDS)) provider.seek(position);
      lastChange = now;
    }
    lastSerial = target.serial;
    if (playing !== lastMode || (now - lastChange > 1800 && provider.running() !== playing)) {
      if (!playing) {
        blocked = false;
        view.status(null);
        provider.pause();
      } else if (!blocked) {
        provider.play();
      }
      lastChange = now;
    }
    lastMode = playing;
  }

  return {
    sync(next) {
      target = next;
      sync();
    },
    fullscreen: provider.fullscreen,
    canRate: Boolean(provider.rate),
    getDuration: () => ready && !failed ? provider.duration() : 0,
    // Seconds between this device and the room clock, or null before the first sync.
    drift: () => ready && !failed && prepared ? drift : null,
    resync() {
      if (!ready || failed || !target) return;
      provider.seek(target.position);
      if (target.playing) provider.play();
      lastChange = performance.now();
    },
    setVolume(value) {
      volume = value;
      if (ready && !failed) provider.volume(value);
    },
    unlock(position) {
      if (!ready || failed) return;
      blocked = false;
      provider.seek(position);
      provider.play();
      lastChange = performance.now();
    },
    destroy() {
      disposed = true;
      provider.destroy();
    },
  };
}
