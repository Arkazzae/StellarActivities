const YOUTUBE_EMBED = "https://www.youtube-nocookie.com/embed/";
const RESYNC_SECONDS = 1.5;

// Status messages are translation keys; app.js turns them into text.
function youtubeError(code) {
  if (code === 2 || code === 100) return "errUnavailable";
  if (code === 101 || code === 150) return "errEmbedDisabled";
  if (code === 153) return "errEmbedIdentity";
  return "errGeneric";
}

function mountYouTube(item, mount, events, embed) {
  const id = crypto.randomUUID();
  const url = new URL(YOUTUBE_EMBED + item.videoId);
  url.search = new URLSearchParams({
    enablejsapi: "1", origin: location.origin, controls: "0", disablekb: "1",
    playsinline: "1", rel: "0", start: String(Math.floor(item.startSeconds)),
  });
  let handle;
  let ready = false;
  let closed = false;
  let time = 0;
  let duration = 0;
  let state = -1;
  let playbackRate = 1;
  const listen = () => post({ event: "listening" });
  const retry = setInterval(listen, 300);
  const deadline = setTimeout(() => fail("errTimeout"), 16000);
  function stopTimers() {
    clearInterval(retry);
    clearTimeout(deadline);
  }
  function post(message) {
    if (!closed) handle?.postMessage(JSON.stringify({ ...message, id, channel: "widget" }));
  }
  function command(func, ...args) {
    post({ event: "command", func, args });
  }
  function fail(message) {
    stopTimers();
    closed = true;
    events.error(message);
  }
  function receive(raw) {
    if (closed) return;
    let data = raw;
    if (typeof raw === "string") {
      try { data = JSON.parse(raw); } catch { return; }
    }
    if (!data || (data.id && data.id !== id)) return;
    const info = data.info;
    switch (data.event) {
      case "onReady":
        if (ready) return;
        ready = true;
        stopTimers();
        for (const event of ["onStateChange", "onError", "onAutoplayBlocked"])
          command("addEventListener", event);
        events.ready();
        break;
      case "infoDelivery":
      case "initialDelivery":
        if (Number.isFinite(info?.currentTime)) time = info.currentTime;
        if (Number.isFinite(info?.duration)) duration = info.duration;
        if (Number.isFinite(info?.playerState)) state = info.playerState;
        break;
      case "onStateChange":
        state = info;
        if ((state === 1 || state === 5) && playbackRate !== 1) command("setPlaybackRate", playbackRate);
        if (state === 1) events.playing();
        if (state === 0) {
          if (duration > 0) time = duration;
          events.ended();
        }
        break;
      case "onAutoplayBlocked": events.blocked(); break;
      case "onError": fail(youtubeError(info)); break;
    }
  }
  try {
    handle = embed.mount(url.href, mount, { title: "YouTube", onLoad: listen, onMessage: receive });
  } catch {
    fail("errGeneric");
  }
  return {
    prepare: (position, playing) => command(playing ? "loadVideoById" : "cueVideoById", item.videoId, position),
    time: () => time,
    duration: () => duration,
    running: () => state === 1 || state === 3,
    seek: position => command("seekTo", position, true),
    rate(value) {
      playbackRate = value;
      command("setPlaybackRate", value);
    },
    play: () => command("playVideo"),
    pause: () => command("pauseVideo"),
    volume: value => command("setVolume", Math.round(value * 100)),
    destroy() {
      closed = true;
      stopTimers();
      handle?.destroy();
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
  const provider = item.source === "sample" ? mountSample(mount, events) : mountYouTube(item, mount, events, view.embed);

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
