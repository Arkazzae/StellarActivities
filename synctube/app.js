import { connect } from "/_stellarr/sdk/v1.js";
import { createPlayer } from "./player.js";
import {
  checkpoint, effectiveVolume, emptyRoom, formatTime, parseYouTube, playbackFor,
  positionAt, reduceRoom, takeover,
} from "./room.js";

const ui = Object.fromEntries([...document.querySelectorAll("[id]")].map(element => [element.id, element]));
const commandKind = "watch";
const input = ui.link;
let session;
let state = emptyRoom();
let participants = [];
let host;
let player;
let playerItem;
let roomVolume = 1;
let connection = "connected";
let muted = false;
let ready = false;
let adding = false;
let dragging = false;
let seeking;
let endedItem;
let lastQueue;
let queueRendered;
let lastCurrent;

function readVolume() {
  try {
    const value = Number(localStorage.getItem("synctube-volume") ?? 100);
    return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 100;
  } catch {
    return 100;
  }
}

ui.volume.value = String(readVolume());

function message(element, text) {
  element.textContent = text || "";
  element.hidden = !text;
}

function button(label, glyph, className) {
  const element = document.createElement("button");
  element.type = "button";
  element.className = className;
  element.setAttribute("aria-label", label);
  element.title = label;
  element.textContent = glyph;
  return element;
}

function hostOnline() {
  return Boolean(connection === "connected" && host && participants.some(person => person.id === host && person.connected));
}

function playback() {
  return playbackFor(state, host, hostOnline());
}

function roomPosition() {
  return positionAt(playback(), session?.now() ?? 0);
}

function applyVolume() {
  const personal = Number(ui.volume.value) / 100;
  player?.setVolume(effectiveVolume(personal, roomVolume, muted));
  ui.volume.style.setProperty("--progress", `${personal * 100}%`);
  ui.mute.setAttribute("aria-pressed", String(muted || personal === 0));
  ui.mute.setAttribute("aria-label", muted ? "Unmute for me" : "Mute for me");
  ui.mute.title = muted ? "Unmute for me" : "Mute for me";
}

function participantName(id) {
  if (id === session?.context.me.id) return "you";
  return participants.find(person => person.id === id)?.name || "a watcher";
}

function renderPeople() {
  const me = session?.context.me.id;
  const count = participants.filter(person => person.connected).length;
  ui["people-label"].textContent = ready ? `${count} watching` : "Connecting…";
  ui.watchers.replaceChildren(...participants.map(person => {
    const row = document.createElement("li");
    const identity = document.createElement("div");
    identity.className = "watcher-name";
    identity.textContent = `${person.name || "Watcher"}${person.id === me ? " (you)" : ""}`;
    if (!person.connected || person.id === host) {
      const detail = document.createElement("small");
      detail.textContent = person.connected ? "Host" : "Reconnecting…";
      identity.append(detail);
    }
    row.append(identity);
    if (me === host && person.connected && person.id !== me) {
      const transfer = button(`Make ${person.name} host`, "Make host", "subtle");
      transfer.addEventListener("click", async () => {
        try {
          await session.host.transfer(person.id);
          ui.people.open = false;
        } catch (error) {
          message(ui["room-error"], error.message || "Couldn’t transfer the room.");
        }
      });
      row.append(transfer);
    }
    return row;
  }));
}

function renderQueue() {
  const canControl = ready && hostOnline();
  const signature = JSON.stringify([state.queue, state.current?.id, participants, canControl]);
  if (lastQueue === signature) return;
  lastQueue = signature;
  const queue = state.queue;
  ui["queue-count"].textContent = `${queue.length} queued`;
  ui["queue-empty"].hidden = queue.length > 0;
  ui.items.hidden = queue.length === 0;
  const focused = document.activeElement?.dataset.queueAction;
  ui.items.replaceChildren(...queue.map((item, index) => {
    const row = document.createElement("li");
    const play = button(`Play ${item.title} now`, "", "thumbnail");
    const thumbnail = document.createElement("img");
    thumbnail.alt = "";
    thumbnail.loading = "lazy";
    thumbnail.src = item.source === "sample" ? "./assets/cinema.webp" :
      `https://i.ytimg.com/vi/${item.videoId}/mqdefault.jpg`;
    thumbnail.onerror = () => thumbnail.remove();
    play.append(thumbnail);
    const currentId = state.current?.id;
    play.disabled = !canControl;
    play.onclick = () => run({ type: "select", id: item.id, currentId });
    play.dataset.queueAction = `${item.id}:play`;

    const info = document.createElement("div");
    info.className = "item-text";
    const title = document.createElement("div");
    title.textContent = item.title;
    title.className = "item-title";
    const by = document.createElement("div");
    by.className = "item-by";
    by.textContent = `Added by ${participantName(item.addedBy)}`;
    info.append(title, by);

    const actions = document.createElement("div");
    actions.className = "item-actions";
    const up = button(`Move ${item.title} up`, "↑", "item-action");
    const down = button(`Move ${item.title} down`, "↓", "item-action");
    const remove = button(`Remove ${item.title}`, "×", "item-action");
    up.disabled = !canControl || index === 0;
    down.disabled = !canControl || index === queue.length - 1;
    remove.disabled = !canControl;
    up.onclick = () => run({ type: "move", direction: -1, id: item.id });
    down.onclick = () => run({ type: "move", direction: 1, id: item.id });
    remove.onclick = () => run({ type: "remove", id: item.id });
    up.dataset.queueAction = `${item.id}:up`;
    down.dataset.queueAction = `${item.id}:down`;
    remove.dataset.queueAction = `${item.id}:remove`;
    actions.append(up, down, remove);
    row.append(play, info, actions);
    return row;
  }));
  if (focused) {
    const sameControl = [...ui.items.querySelectorAll("button")].find(element => element.dataset.queueAction === focused && !element.disabled);
    const rowPlay = [...ui.items.querySelectorAll(".thumbnail")].find(element => element.dataset.queueAction.split(":")[0] === focused.split(":")[0]);
    (sameControl || rowPlay || input).focus();
  }
}

function providerStatus(kind, text) {
  ui["provider-notice"].hidden = !kind;
  ui["provider-text"].textContent = text || "";
  const action = ui["provider-action"];
  action.hidden = !["blocked", "error"].includes(kind);
  action.textContent = kind === "error" ? "Retry video" : "Play on this device";
  action.onclick = kind === "error" ? () => mount(true) : () => player?.unlock(roomPosition());
}

function mount(force = false) {
  const item = state.current;
  if (!force && playerItem === item?.id) return;
  player?.destroy();
  player = undefined;
  playerItem = item?.id;
  endedItem = undefined;
  providerStatus(null);
  ui.screen.hidden = !item;
  ui.welcome.hidden = Boolean(item);
  if (!item) return;
  player = createPlayer(item, ui.screen, {
    status: providerStatus,
    ended(duration) {
      const current = playback();
      const ending = `${item.id}:${current.serial}`;
      if (state.current?.id !== item.id || host !== session.context.me.id || endedItem === ending ||
          !current.playing || roomPosition() < duration - 3) return;
      endedItem = ending;
      const action = { type: "ended", currentId: item.id, serial: current.serial };
      void run(action, { quiet: true }).catch(() => {
        if (endedItem === ending) endedItem = undefined;
      });
    },
  });
  applyVolume();
  syncPlayer();
}

function syncPlayer() {
  const current = playback();
  const position = roomPosition();
  const duration = player?.getDuration() || 0;
  player?.sync({ playing: current.playing, position, serial: current.serial });
  const confirmed = state.current && seeking?.item === state.current.id ? seeking.position : Math.min(duration || Infinity, position);
  const elapsed = dragging ? Number(ui.seek.value) : confirmed;
  if (!dragging) {
    ui.seek.max = String(duration || 1);
    ui.seek.value = String(Math.min(duration || 1, confirmed));
  }
  ui.elapsed.value = formatTime(elapsed);
  ui.duration.value = duration ? formatTime(duration) : "–:––";
  ui.seek.setAttribute("aria-valuetext", duration ? `${formatTime(elapsed)} of ${formatTime(duration)}` : formatTime(elapsed));
  ui.seek.style.setProperty("--progress", `${duration ? Math.min(100, elapsed / duration * 100) : 0}%`);
  ui.seek.disabled = !state.current || !hostOnline() || !duration;
}

function render() {
  const item = state.current;
  const current = playback();
  const online = hostOnline();
  const control = ready && online;
  input.disabled = !control;
  ui["add-button"].disabled = !control || adding;
  ui.sample.disabled = !control || adding;
  ui.play.disabled = ui.skip.disabled = !item || !control;
  ui.fullscreen.disabled = !item || !document.fullscreenEnabled;
  let status = "Ready";
  if (!ready) status = "Joining the room…";
  else if (connection === "closed") status = "Room closed";
  else if (connection === "reconnecting") status = "Reconnecting…";
  else if (!online) status = "Waiting for host";
  else if (item && state.playback.host !== host) status = "Changing host…";
  else if (item) status = current.playing ? "Playing together" : "Paused";
  if (ui.status.textContent !== status) ui.status.textContent = status;
  ui.status.dataset.playing = String(current.playing);
  ui.play.dataset.playing = String(current.playing);
  const playLabel = current.playing ? "Pause for everyone" : "Play for everyone";
  ui.play.setAttribute("aria-label", playLabel);
  ui.play.title = playLabel;
  if (lastCurrent !== item) {
    lastCurrent = item;
    ui["current-title"].textContent = item?.title || "Nothing playing";
    ui["current-title"].title = item?.title || "";
  }
  message(ui["current-by"], item ? `Added by ${participantName(item.addedBy)}` : "");
  mount();
  syncPlayer();
  renderQueue();
  const people = JSON.stringify([participants, host, ready]);
  if (queueRendered !== people) {
    queueRendered = people;
    renderPeople();
  }
}

async function run(action, { quiet = false, id, errorElement = ui["room-error"] } = {}) {
  message(errorElement, null);
  try {
    return await session.commands.submit(commandKind, action, id ? { id } : {});
  } catch (error) {
    if (quiet) throw error;
    message(errorElement, error.message || "Couldn’t confirm that change. Try again.");
    return undefined;
  }
}

async function getTitle(videoId) {
  const watch = `https://www.youtube.com/watch?v=${videoId}`;
  const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(watch)}&format=json`;
  try {
    const result = await fetch(endpoint, {
      credentials: "omit",
      referrerPolicy: "origin",
      signal: AbortSignal.timeout(1600),
    });
    if (result.ok) return (await result.json()).title;
  } catch {
    // The video ID remains sufficient for playback.
  }
}

let lastAdd;
async function addVideo(action) {
  if (adding) return;
  const key = JSON.stringify(action);
  if (lastAdd?.key !== key) lastAdd = { key, id: crypto.randomUUID() };
  adding = true;
  render();
  try {
    if (action.source === "youtube") {
      const title = await getTitle(action.videoId);
      if (typeof title === "string") action.title = title;
    }
    const result = await run(action, { id: lastAdd.id, errorElement: ui["add-error"] });
    if (result) lastAdd = undefined;
    return result;
  } finally {
    adding = false;
    render();
  }
}

ui.add.onsubmit = async event => {
  event.preventDefault();
  const original = input.value;
  const parsed = parseYouTube(original);
  if (!parsed) {
    message(ui["add-error"], "Paste a YouTube video link or its 11-character ID.");
    input.focus();
    return;
  }
  if (await addVideo({ source: "youtube", type: "add", ...parsed }) && input.value === original) input.value = "";
};

input.addEventListener("input", () => message(ui["add-error"], null));
ui.sample.onclick = () => addVideo({ source: "sample", type: "add" });
ui.play.onclick = () => {
  if (!state.current) return;
  const type = playback().playing ? "pause" : "play";
  void run({ type, currentId: state.current.id });
};
ui.skip.onclick = () => {
  if (state.current) void run({ type: "skip", currentId: state.current.id });
};
ui.volume.oninput = () => {
  muted = false;
  try { localStorage.setItem("synctube-volume", ui.volume.value); } catch { /* Storage can be restricted. */ }
  applyVolume();
};
ui.mute.onclick = () => {
  if (Number(ui.volume.value) === 0) ui.volume.value = "100";
  else muted = !muted;
  applyVolume();
};
ui.fullscreen.onclick = async () => {
  try {
    await ui.stage.requestFullscreen();
  } catch {
    message(ui["room-error"], "Full screen is unavailable in this preview.");
  }
};
ui.seek.oninput = () => {
  dragging = true;
  syncPlayer();
};
ui.seek.onchange = async () => {
  const currentId = state.current?.id;
  const duration = player?.getDuration();
  dragging = false;
  if (!currentId || !duration) return;
  const position = Math.min(Number(ui.seek.value), Math.max(0, duration - .1));
  const request = { item: currentId, position };
  seeking = request;
  await run({ type: "seek", currentId, position });
  if (seeking === request) seeking = undefined;
  syncPlayer();
};
ui.seek.onpointercancel = () => { dragging = false; };
document.addEventListener("pointerdown", event => {
  if (ui.people.open && !ui.people.contains(event.target)) ui.people.open = false;
});
ui.people.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    ui.people.open = false;
    ui.people.querySelector("summary").focus();
  }
});

async function recoverHost() {
  const me = session.context.me.id;
  if (host !== me || !state.current || state.playback.host === me) return;
  try {
    await session.state.set(current => takeover(current, me, session.now()));
  } catch {
    // A newer host may have taken over. The state and host subscriptions will reconcile.
  }
}

applyVolume();
render();
try {
  session = await connect({ initialState: emptyRoom() });
  if (!session.commands || !session.host || !session.media?.volume || !session.participants)
    throw new Error("SyncTube needs host commands, presence and game audio support in the preview.");
  host = session.host.get();
  state = session.state.get();
  participants = session.participants.get();
  roomVolume = session.media.volume.get();
  session.commands.handle(commandKind, (action, meta, current) =>
    reduceRoom(current, action, meta, session.host.get(), session.now()));
  ready = true;
  session.state.subscribe(value => {
    state = value;
    render();
  });
  session.participants.subscribe(value => {
    participants = value;
    render();
  });
  session.host.subscribe(value => {
    host = value;
    render();
    void recoverHost();
  });
  session.connection?.subscribe(value => {
    connection = value;
    render();
  });
  session.media.volume.subscribe(value => {
    roomVolume = value;
    applyVolume();
  });
  applyVolume();
  render();
  void recoverHost();
  setInterval(syncPlayer, 650);
  setInterval(() => {
    const me = session.context.me.id;
    if (me !== host || !hostOnline()) return;
    if (state.current && state.playback.host !== me) {
      void recoverHost();
    } else if (state.playback.playing) {
      void session.state.set(current => checkpoint(current, me, session.now())).catch(() => {});
    }
  }, 5_000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") syncPlayer();
  });
} catch (error) {
  ui.status.textContent = "Unable to join";
  ui["people-label"].textContent = "Offline";
  message(ui["room-error"], error.message || "Couldn’t join the watch room.");
}
