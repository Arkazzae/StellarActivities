import { connect } from "/_stellarr/sdk/v1.js";
import { createPlayer } from "./player.js";
import { LANGUAGE_NAMES, resolveLanguage, translator } from "./i18n.js";
import { createProgress, forgetSpot, latestSpot, preference, rememberSpot, spotFor, withPreference } from "./progress.js";
import {
  RATES, canControl, checkpoint, effectiveVolume, emptyRoom, formatTime, liveVotes, normalizeRoom, parseYouTube,
  playbackFor, positionAt, reduceRoom, skipRole, takeover, voteThreshold,
} from "./room.js";

const ui = Object.fromEntries([...document.querySelectorAll("[id]")].map(element => [element.id, element]));
const COMMAND = "watch";
const TABS = ["queue", "history", "people", "settings"];
const LANGUAGES = ["auto", "pl", "en"];
const SPOT_EVERY_MS = 15_000;
const AVATAR_COLORS = ["#b91c1c", "#2563eb", "#15803d", "#7c3aed", "#c2410c", "#0e7490"];
const SVG = "http://www.w3.org/2000/svg";

let session;
let state = emptyRoom();
let participants = [];
let host = null;
let connection = "connected";
let ready = false;
let personal = false;
let player;
let playerItem;
let endedItem;
let providerState = null;
let roomVolume = 1;
let muted = false;
let adding = false;
let dragging = false;
let seeking;
let tab = "queue";
let openMenu = null;
let cinema = false;
let canRate = false;
let stellarrLocale = navigator.language || "en";
let languagePref = readLocal("synctube-language", "auto");
let t = translator("en");
let language = "en";
let progress = createProgress(null);
let lookup = { videoId: null, title: "", author: "", loading: false };
let lookupTimer;
let lookupAbort;
let toastTimer;
let idleTimer;
let lastNotice;
let lastSpot = null;
let spotSavedAt = 0;
let renderQueued = false;
let tapWoke = false;
let listSignatures = {};

function readLocal(key, fallback) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeLocal(key, value) {
  try { localStorage.setItem(key, value); } catch { /* Storage is unavailable in opaque activity frames. */ }
}

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key.startsWith("aria-") || key === "role" || key === "title" || key.startsWith("data-")) node.setAttribute(key, String(value));
    else node[key] = value;
  }
  node.append(...children.filter(Boolean));
  return node;
}

function icon(paths, { filled = false } = {}) {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "icon");
  for (const d of paths) {
    const path = document.createElementNS(SVG, "path");
    path.setAttribute("d", d);
    if (filled) path.setAttribute("class", "fill");
    svg.append(path);
  }
  return svg;
}

const ICONS = {
  play: () => icon(["M8 5v14l12-7z"], { filled: true }),
  up: () => icon(["M12 19V5", "M6 11l6-6 6 6"]),
  down: () => icon(["M12 5v14", "M6 13l6 6 6-6"]),
  remove: () => icon(["M5 7h14", "M10 7V4h4v3", "M7 7l1 13h8l1-13"]),
  add: () => icon(["M12 5v14", "M5 12h14"]),
  more: () => {
    const svg = icon([]);
    for (const cy of [5.5, 12, 18.5]) {
      const dot = document.createElementNS(SVG, "circle");
      dot.setAttribute("cx", "12");
      dot.setAttribute("cy", String(cy));
      dot.setAttribute("r", "1.8");
      dot.setAttribute("class", "fill");
      svg.append(dot);
    }
    return svg;
  },
};

// Session helpers

function me() {
  return session?.context.me.id;
}

function connected() {
  return participants.filter(person => person.connected);
}

function connectedIds() {
  return connected().map(person => person.id);
}

// Stellarr does not report instance owners to activities yet. This activates once participants carry `role: "owner"`.
function ownerIds(list = participants) {
  return list.filter(person => person.role === "owner").map(person => person.id);
}

function hostOnline() {
  return Boolean(ready && connection === "connected" && host && participants.some(person => person.id === host && person.connected));
}

function isHost() {
  return ready && host === me();
}

function playback() {
  return playbackFor(state, host, hostOnline());
}

function roomPosition() {
  return positionAt(playback(), session?.now() ?? 0);
}

function control() {
  return hostOnline() && canControl(state, me(), host);
}

function skipAs() {
  return hostOnline() ? skipRole(state, me(), host, ownerIds()) : null;
}

function nameOf(id) {
  if (id === me()) return t("you");
  return participants.find(person => person.id === id)?.name || "?";
}

function itemTitle(item) {
  return item.source === "sample" ? t("sampleTitle") : item.title;
}

function itemChannel(item) {
  return item.author || (item.source === "sample" ? "SyncTube" : "YouTube");
}

function thumbnailFor(item) {
  return item.source === "sample" ? "./assets/cinema.webp" : `https://i.ytimg.com/vi/${item.videoId}/mqdefault.jpg`;
}

function watchUrl(videoId, seconds = 0) {
  const url = new URL("https://www.youtube.com/watch");
  url.searchParams.set("v", videoId);
  if (seconds >= 1) url.searchParams.set("t", `${Math.floor(seconds)}s`);
  return url.href;
}

function clock(at) {
  return new Date(at).toLocaleTimeString(language === "pl" ? "pl-PL" : "en-GB", { hour: "2-digit", minute: "2-digit" });
}

function avatarFor(person) {
  const node = el("span", { class: "avatar", "aria-hidden": "true" });
  const own = person.id === me();
  const hash = [...person.id].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  node.style.background = own ? "var(--text)" : AVATAR_COLORS[hash % AVATAR_COLORS.length];
  node.style.color = own ? "var(--bg)" : "#ffffff";
  node.textContent = (person.name || "?").trim().slice(0, 1).toUpperCase();
  if (person.avatar) {
    const image = el("img", { alt: "", src: person.avatar, referrerPolicy: "no-referrer" });
    image.onerror = () => image.remove();
    node.append(image);
  }
  return node;
}

function thumbnail(item, tag = "span", props = {}) {
  const holder = el(tag, { class: "thumb", ...props });
  const image = el("img", { alt: "", loading: "lazy", src: thumbnailFor(item) });
  image.onerror = () => {
    image.remove();
    holder.classList.add("fallback");
  };
  holder.append(image);
  return holder;
}

function message(element, text) {
  element.textContent = text || "";
  element.hidden = !text;
  delete element.dataset.hint;
}

function toast(text) {
  if (!text) return;
  clearTimeout(toastTimer);
  ui.toast.textContent = text;
  ui.toast.hidden = false;
  toastTimer = setTimeout(() => { ui.toast.hidden = true; }, 3200);
}

function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  queueMicrotask(() => {
    renderQueued = false;
    render();
  });
}

// Language

function translateStatic() {
  for (const node of document.querySelectorAll("[data-i18n]")) node.textContent = t(node.dataset.i18n);
  for (const node of document.querySelectorAll("[data-i18n-label]")) node.setAttribute("aria-label", t(node.dataset.i18nLabel));
  for (const node of document.querySelectorAll("[data-i18n-placeholder]")) node.placeholder = t(node.dataset.i18nPlaceholder);
}

function buildRates() {
  ui.rate.replaceChildren(...RATES.map(rate => el("option", { value: String(rate), text: t("rateLabel", rate) })));
  ui.rate.setAttribute("aria-label", t("speed"));
  ui.rate.title = t("speed");
}

function applyLanguage() {
  language = languagePref === "auto" ? resolveLanguage(stellarrLocale) : languagePref;
  t = translator(language);
  document.documentElement.lang = language;
  translateStatic();
  buildRates();
  listSignatures = {};
  render();
}

function chooseLanguage(value) {
  if (!LANGUAGES.includes(value) || value === languagePref) return;
  languagePref = value;
  writeLocal("synctube-language", value);
  progress.update(data => withPreference(data, "language", value), { soon: true });
  applyLanguage();
}

// Volume

ui.volume.value = readLocal("synctube-volume", "100");

function applyVolume() {
  const personalVolume = Number(ui.volume.value) / 100;
  player?.setVolume(effectiveVolume(personalVolume, roomVolume, muted));
  const shown = muted ? 0 : Number(ui.volume.value);
  for (const input of [ui.volume, ui["volume-settings"]]) {
    input.value = String(shown);
    input.style.setProperty("--progress", `${shown}%`);
  }
  const silent = muted || personalVolume === 0;
  ui.mute.setAttribute("aria-pressed", String(silent));
  ui.mute.setAttribute("aria-label", t(silent ? "unmute" : "mute"));
  ui.mute.title = t(silent ? "unmute" : "mute");
  ui.volume.setAttribute("aria-label", t("myVolume"));
}

function setVolume(value) {
  muted = false;
  ui.volume.value = String(value);
  writeLocal("synctube-volume", String(value));
  applyVolume();
}

function toggleMute() {
  if (Number(ui.volume.value) === 0) ui.volume.value = "100";
  else muted = !muted;
  applyVolume();
}

// Player

function providerStatus(kind, key) {
  providerState = kind ? { kind, key } : null;
  scheduleRender();
}

function rememberCurrentSpot(spot = lastSpot) {
  if (!progress.supported || !spot || spot.item.source !== "youtube") return;
  const { item, position, duration } = spot;
  spotSavedAt = Date.now();
  progress.update(data => rememberSpot(data, {
    videoId: item.videoId, title: item.title, author: item.author, position, duration, at: Date.now(),
  }));
}

function mount(force = false) {
  const item = state.current;
  if (!force && playerItem === item?.id) return;
  if (lastSpot && lastSpot.item.id !== item?.id) rememberCurrentSpot(lastSpot);
  player?.destroy();
  player = undefined;
  playerItem = item?.id;
  endedItem = undefined;
  providerState = null;
  lastSpot = null;
  ui.screen.hidden = !item;
  if (!item) return;
  player = createPlayer(item, ui.screen, {
    youtube: session.media.youtube,
    status: providerStatus,
    ended(duration) {
      const current = playback();
      const ending = `${item.id}:${current.serial}`;
      if (state.current?.id !== item.id || host !== me() || endedItem === ending ||
          !current.playing || roomPosition() < duration - 3) return;
      endedItem = ending;
      void run({ type: "ended", currentId: item.id, serial: current.serial }, { quiet: true }).catch(() => {
        if (endedItem === ending) endedItem = undefined;
      });
    },
  });
  applyVolume();
}

function renderSync() {
  let name = "ok";
  let label = t("inSync");
  const drift = player?.drift();
  if (!ready || connection !== "connected") [name, label] = ["off", t("reconnectingSync")];
  else if (providerState?.kind === "error") [name, label] = ["bad", t("cantPlay")];
  else if (!hostOnline() || providerState?.kind === "blocked") [name, label] = ["late", t("waiting")];
  else if (providerState?.kind === "loading" || drift === null || drift === undefined) [name, label] = ["busy", t("buffering")];
  else if (drift > 1.5) [name, label] = ["late", t("catchingUp")];
  ui.sync.dataset.state = name;
  ui["sync-label"].textContent = label;
  ui.sync.title = t("syncTitle");
  ui.sync.setAttribute("aria-label", `${label}. ${t("syncTitle")}`);
}

function syncPlayer() {
  const item = state.current;
  const current = playback();
  const position = roomPosition();
  const duration = player?.getDuration() || 0;
  player?.sync({ playing: current.playing, position, serial: current.serial, rate: current.rate || 1 });
  const confirmed = item && seeking?.item === item.id ? seeking.position : Math.min(duration || Infinity, position);
  const elapsed = dragging ? Number(ui.seek.value) : confirmed;
  if (!dragging) {
    ui.seek.max = String(duration || 1);
    ui.seek.value = String(Math.min(duration || 1, confirmed));
  }
  const total = duration ? formatTime(duration) : "–:––";
  ui.time.value = `${formatTime(elapsed)} / ${total}`;
  ui.seek.setAttribute("aria-label", t("position"));
  ui.seek.setAttribute("aria-valuetext", t("valueText", formatTime(elapsed), total));
  ui.seek.style.setProperty("--progress", `${duration ? Math.min(100, elapsed / duration * 100) : 0}%`);
  ui.seek.disabled = !item || !control() || !duration;
  renderSync();
  if (item?.source === "youtube") {
    // Narrow rooms show these two as icons, so the label doubles as a tooltip.
    ui["copy-text"].textContent = ui["copy-link"].title = t("copyAt", formatTime(position));
    ui["open-youtube"].href = watchUrl(item.videoId, position);
    ui["open-youtube"].title = t("openYt");
  }
  if (item) {
    lastSpot = { item, position, duration };
    if (current.playing && Date.now() - spotSavedAt > SPOT_EVERY_MS) rememberCurrentSpot();
  }
}

// Rendering

function controlNote() {
  if (personal) return "";
  if (state.settings.control !== "host") return t("ctrlEveryone");
  return host === me() ? t("ctrlYou") : t("ctrlHost", nameOf(host));
}

function renderHeader() {
  const people = connected();
  ui["people-button"].hidden = personal;
  ui["private-label"].hidden = !personal;
  ui["people-label"].textContent = ready ? t("watching", people.length) : t("joining");
  ui["people-stack"].replaceChildren(...(ready ? people.slice(0, 4).map(avatarFor) : []));
}

function renderStage() {
  const item = state.current;
  const current = playback();
  const ctl = control();
  const online = hostOnline();
  mount();
  ui.stage.classList.toggle("is-empty", !item);
  ui.stage.classList.toggle("hosted", Boolean(session?.media?.youtube && item?.source === "youtube"));
  ui.welcome.hidden = Boolean(item) || state.history.length > 0;
  ui["welcome-text"].textContent = t(personal ? "welcomePersonal" : "welcomeText");
  ui["ran-out"].hidden = Boolean(item) || state.history.length === 0;
  ui.sample.disabled = !online || adding;
  ui.controls.hidden = !item;
  ui.veil.hidden = !item;
  const quiet = !providerState && online;
  ui["big-play"].hidden = !(item && !current.playing && ctl && quiet);
  ui["big-play"].setAttribute("aria-label", t("playEveryone"));
  ui["paused-note"].hidden = !(item && !current.playing && !ctl && quiet);
  ui["paused-text"].textContent = controlNote();
  if (!item || current.playing === false) ui.stage.classList.remove("idle");

  let title = "";
  let text = "";
  let primary;
  let secondary;
  let link = false;
  if (ready && connection === "closed") {
    title = t("closedTitle");
    text = t("closedText");
  } else if (item && providerState?.kind === "blocked") {
    title = t("blockedTitle");
    text = t("blockedText");
    primary = ["playHere", () => player?.unlock(roomPosition())];
  } else if (item && providerState?.kind === "error") {
    title = t("errTitle");
    text = t(providerState.key);
    secondary = ["retry", () => mount(true)];
    if (skipAs()) primary = ["skipEveryone", () => run({ type: "skip", currentId: item.id })];
    link = item.source === "youtube";
  } else if (item && ready && !online) {
    title = t("waitingHost");
    text = t("waitingText");
  }
  ui.notice.hidden = !title;
  ui["notice-title"].textContent = title;
  ui["notice-text"].textContent = text;
  for (const [element, action] of [[ui["notice-primary"], primary], [ui["notice-secondary"], secondary]]) {
    element.hidden = !action;
    if (action) {
      element.textContent = t(action[0]);
      element.onclick = action[1];
    }
  }
  ui["notice-link"].hidden = !link;
  if (link) ui["notice-link"].href = watchUrl(item.videoId, roomPosition());

  ui.play.disabled = !item || !ctl;
  ui.play.dataset.playing = String(Boolean(item) && current.playing);
  const playLabel = !ctl && item ? (online ? t("ctrlHost", nameOf(host)) : t("waitingHost")) :
    current.playing ? t("pauseEveryone") : t("playEveryone");
  ui.play.setAttribute("aria-label", playLabel);
  ui.play.title = playLabel;
  const role = skipAs();
  ui.skip.disabled = !item || !role;
  const skipLabel = role === "control" ? t("skipNext") : role ? t("skipNowLabel") : t("skipHost", nameOf(host));
  ui.skip.setAttribute("aria-label", skipLabel);
  ui.skip.title = skipLabel;
  ui.rate.hidden = !canRate;
  ui.rate.disabled = !item || !ctl;
  ui.rate.value = String(state.playback.rate || 1);
  ui.cinema.setAttribute("aria-pressed", String(cinema));
  ui.cinema.setAttribute("aria-label", t(cinema ? "cinemaOff" : "cinemaOn"));
  ui.cinema.title = t(cinema ? "cinemaOff" : "cinemaOn");
  ui.fullscreen.setAttribute("aria-label", t("fullscreen"));
  ui.fullscreen.title = t("fullscreen");
  ui.fullscreen.disabled = !item;
}

function renderInfo() {
  const item = state.current;
  const title = item ? itemTitle(item) : t("nothingPlaying");
  ui["current-title"].textContent = title;
  ui["current-title"].title = title;
  const channel = item ? itemChannel(item) : "SyncTube";
  ui["channel-name"].textContent = channel;
  ui["channel-avatar"].textContent = channel.slice(0, 1).toUpperCase();
  ui["added-line"].textContent = !item ? t("addToStart") : personal ? t("inPrivate") :
    item.addedBy === me() ? t("addedByYou") : t("addedBy", nameOf(item.addedBy));
  ui.actions.hidden = !item;

  const ids = connectedIds();
  const votes = liveVotes(state, ids);
  const threshold = voteThreshold(ids.length);
  const voted = votes.includes(me());
  ui.vote.hidden = personal || !item;
  ui.vote.disabled = !hostOnline();
  ui.vote.setAttribute("aria-pressed", String(voted));
  ui["vote-text"].textContent = ui.vote.title = t(voted ? "voted" : "vote");
  ui["vote-count"].textContent = t("ofMax", votes.length, threshold);
  ui["vote-pips"].replaceChildren(...Array.from({ length: threshold }, (_, index) =>
    el("span", { class: index < votes.length ? "on" : "" })));

  const role = skipAs();
  ui["skip-now"].hidden = personal || !item || !role || role === "control";
  ui["skip-now"].title = t(role === "owner" ? "skipNowOwner" : "skipNowFounder");
  ui["copy-link"].hidden = item?.source !== "youtube";
  ui["open-youtube"].hidden = item?.source !== "youtube";

  const bits = personal ? [t("privateSession")] : [t("watching", ids.length), controlNote()];
  bits.push(t(state.settings.autoplay ? "autoOn" : "autoOff"));
  if (state.settings.repeat) bits.push(t("repeatOn"));
  if ((state.playback.rate || 1) !== 1) bits.push(t("rateX", state.playback.rate));
  ui["room-line"].textContent = bits.join(" · ");
  let sub;
  if (personal) sub = t(progress.supported ? "roomSubPersonal" : "roomSubPersonalPlain");
  else {
    const founder = state.founder && participants.some(person => person.id === state.founder) ? state.founder : null;
    const extra = ownerIds().includes(me()) ? t("roomSubYouOwner") :
      founder === me() ? t("roomSubYouFounder") : founder ? t("roomSubFounder", nameOf(founder)) : "";
    sub = [t("roomSubVote"), extra].filter(Boolean).join(" ");
  }
  ui["room-sub"].textContent = sub;
}

function visibleTabs() {
  return TABS.filter(id => !(personal && id === "people"));
}

function renderTabs() {
  const visible = visibleTabs();
  if (!visible.includes(tab)) tab = "queue";
  for (const id of TABS) {
    const button = ui[`tab-${id}`];
    const selected = id === tab;
    button.hidden = !visible.includes(id);
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
    ui[`panel-${id}`].hidden = !selected;
  }
  ui["tab-settings"].title = t("tabSettings");
  ui["queue-badge"].textContent = state.queue.length ? String(state.queue.length) : "";
  ui["people-badge"].textContent = ready ? String(connected().length) : "";
  ui.add.hidden = tab !== "queue";
}

function renderAddForm() {
  const online = hostOnline();
  const value = ui.link.value.trim();
  const parsed = value ? parseYouTube(value) : null;
  const full = Boolean(state.current) && state.queue.length >= 50;
  ui.link.disabled = !online;
  ui["add-button"].disabled = !online || adding || !parsed || full;
  ui.field.classList.toggle("invalid", Boolean(value) && !parsed);
  // Hints follow the field; errors from a failed add stay until the next edit.
  const hint = value && !parsed ? t("badLink") : full ? t("queueFull") : null;
  if (hint) {
    message(ui["add-error"], hint);
    ui["add-error"].dataset.hint = "true";
  } else if (ui["add-error"].dataset.hint) {
    message(ui["add-error"], null);
  }
  ui.preview.hidden = !parsed;
  if (!parsed) return;
  const known = lookup.videoId === parsed.videoId;
  const src = `https://i.ytimg.com/vi/${parsed.videoId}/mqdefault.jpg`;
  if (ui["preview-thumb"].getAttribute("src") !== src) ui["preview-thumb"].src = src;
  ui["preview-title"].placeholder = known && lookup.title ? lookup.title : `YouTube · ${parsed.videoId}`;
  ui["preview-note"].textContent = parsed.startSeconds ? t("previewStarts", formatTime(parsed.startSeconds)) :
    known && lookup.loading ? t("lookingUp") : t("previewKeep");
}

function renderResume() {
  const spot = ready && progress.supported && !state.current ? latestSpot(progress.data) : null;
  ui.resume.hidden = !spot;
  if (!spot) return;
  const src = `https://i.ytimg.com/vi/${spot.videoId}/mqdefault.jpg`;
  if (ui["resume-thumb"].getAttribute("src") !== src) ui["resume-thumb"].src = src;
  ui["resume-title"].textContent = spot.title || `YouTube · ${spot.videoId}`;
  ui["resume-meta"].textContent = [spot.author, t("resumeStopped", formatTime(spot.position))].filter(Boolean).join(" · ");
  ui["resume-bar"].style.width = spot.duration ? `${Math.min(100, spot.position / spot.duration * 100)}%` : "0";
  ui["resume-start"].textContent = t(personal ? "resumeHere" : "resumeStartRoom", formatTime(spot.position));
  ui["resume-start"].disabled = !hostOnline() || adding;
  ui["resume-start"].onclick = () => addVideo({
    source: "youtube", type: "add", videoId: spot.videoId, startSeconds: spot.position, title: spot.title, author: spot.author,
  });
  ui["resume-forget"].onclick = () => progress.update(data => forgetSpot(data, spot.videoId), { soon: true });
}

function menuButton(label, iconNode, disabled, action) {
  const button = el("button", { type: "button", role: "menuitem", disabled }, iconNode, el("span", { text: label }));
  button.onclick = () => {
    openMenu = null;
    listSignatures.queue = null;
    void action();
    render();
  };
  return button;
}

function renderQueue() {
  const ctl = control();
  const online = hostOnline();
  ui["queue-count"].value = t("ofMax", state.queue.length, 50);
  for (const toggle of [ui["autoplay-quick"], ui["autoplay-setting"]]) {
    toggle.setAttribute("aria-checked", String(state.settings.autoplay));
    toggle.disabled = !isHost();
  }
  ui["lock-note"].hidden = personal || ctl || !online;
  ui["lock-note"].textContent = t("lockNote", nameOf(host)) + (skipAs() ? t("lockSkip") : "");
  renderResume();
  ui["queue-empty"].hidden = state.queue.length > 0;

  const signature = JSON.stringify([state.queue, ctl, me(), openMenu, language, personal,
    participants.map(person => [person.id, person.name])]);
  if (listSignatures.queue === signature) return;
  listSignatures.queue = signature;
  const focused = document.activeElement?.dataset?.action;
  ui.items.replaceChildren(...state.queue.map((item, index) => {
    const title = itemTitle(item);
    const open = openMenu === item.id;
    const row = el("li");
    const playButton = thumbnail(item, "button", {
      type: "button", title: t("playNow"), "aria-label": t("playNowLabel", title),
      disabled: !ctl, "data-action": `${item.id}:play`,
    });
    playButton.onclick = () => run({ type: "select", id: item.id, currentId: state.current?.id });
    const by = personal ? (item.startSeconds ? t("from", formatTime(item.startSeconds)) : t("inYourQueue")) :
      (item.addedBy === me() ? t("addedByYou") : t("addedBy", nameOf(item.addedBy))) +
      (item.startSeconds ? ` · ${t("from", formatTime(item.startSeconds))}` : "");
    const text = el("div", { class: "row-text" },
      el("div", { class: "row-title", text: title, title }),
      el("div", { class: "row-meta", text: itemChannel(item) }),
      el("div", { class: "row-meta", text: by }));
    const more = el("button", {
      type: "button", class: "icon-button", "aria-label": t("moreLabel", title), "aria-haspopup": "menu",
      "aria-expanded": String(open), "data-action": `${item.id}:menu`,
    }, ICONS.more());
    more.onclick = () => {
      openMenu = open ? null : item.id;
      listSignatures.queue = null;
      renderQueue();
      if (openMenu) ui.items.querySelector(".menu button:not(:disabled)")?.focus();
    };
    row.append(playButton, text, more);
    if (open) {
      const menu = el("div", { class: "menu", role: "menu", "aria-label": t("moreLabel", title) },
        menuButton(t("playNow"), ICONS.play(), !ctl, () => run({ type: "select", id: item.id, currentId: state.current?.id })),
        menuButton(t("moveUp"), ICONS.up(), !ctl || index === 0, () => run({ type: "move", direction: -1, id: item.id })),
        menuButton(t("moveDown"), ICONS.down(), !ctl || index === state.queue.length - 1,
          () => run({ type: "move", direction: 1, id: item.id })),
        menuButton(t("removeItem"), ICONS.remove(), !ctl && item.addedBy !== me(), () => run({ type: "remove", id: item.id })));
      menu.addEventListener("keydown", event => {
        const items = [...menu.querySelectorAll("button:not(:disabled)")];
        const index = items.indexOf(document.activeElement);
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          const step = event.key === "ArrowDown" ? 1 : -1;
          items[(index + step + items.length) % items.length]?.focus();
        }
      });
      row.append(menu);
    }
    return row;
  }));
  if (focused) ui.items.querySelector(`[data-action="${CSS.escape(focused)}"]:not(:disabled)`)?.focus();
}

function renderHistory() {
  const online = hostOnline();
  ui["clear-history"].hidden = !isHost() || state.history.length === 0;
  ui["history-empty"].hidden = state.history.length > 0;
  const full = Boolean(state.current) && state.queue.length >= 50;
  const signature = JSON.stringify([state.history, online, full, language, progress.data?.spots?.length]);
  if (listSignatures.history === signature) return;
  listSignatures.history = signature;
  ui.history.replaceChildren(...state.history.map(entry => {
    const item = entry.video;
    const title = itemTitle(item);
    const holder = thumbnail(item);
    const spot = item.source === "youtube" ? spotFor(progress.data, item.videoId) : null;
    const share = entry.reason === "ended" ? 100 : spot?.duration ? Math.min(100, entry.reached / spot.duration * 100) : 0;
    if (share) {
      const bar = el("span", { class: "watched" });
      bar.style.width = `${Math.max(2, share)}%`;
      holder.append(bar);
    }
    const meta = [t(entry.reason === "ended" ? "watched" : "skipped"), clock(entry.at)];
    if (entry.reason === "skipped" && entry.reached >= 10) meta.push(t("reachedAt", formatTime(entry.reached)));
    const again = el("button", {
      type: "button", class: "icon-button", title: t("queueAgainLabel", title), "aria-label": t("queueAgainLabel", title),
      disabled: !online || full,
    }, ICONS.add());
    again.onclick = async () => {
      if (await run({ type: "replay", id: item.id })) toast(t("backInQueue"));
    };
    return el("li", {}, holder,
      el("div", { class: "row-text" },
        el("div", { class: "row-title", text: title, title }),
        el("div", { class: "row-meta", text: meta.join(" · ") })),
      again);
  }));
}

function renderPeople() {
  const ids = connectedIds();
  const votes = liveVotes(state, ids);
  const owners = ownerIds();
  const signature = JSON.stringify([participants, host, state.founder, votes, language, me()]);
  if (listSignatures.people === signature) return;
  listSignatures.people = signature;
  ui.watchers.replaceChildren(...participants.map(person => {
    const notes = [];
    if (person.username) notes.push(`@${person.username}`);
    if (owners.includes(person.id)) notes.push(t("ownerRole"));
    if (person.id === state.founder) notes.push(t("founderRole"));
    if (person.id === host) notes.push(t("hostRole"));
    if (!person.connected) notes.push(t("reconnecting"));
    if (votes.includes(person.id)) notes.push(t("votedRole"));
    const name = person.id === me() ? `${person.name || t("you")} (${t("you")})` : person.name || "?";
    const row = el("li", {}, avatarFor(person),
      el("div", { class: "person-text" },
        el("div", { class: `person-name${person.connected ? "" : " offline"}`, text: name }),
        el("div", { class: "small muted", text: notes.join(" · ") })));
    if (isHost() && person.connected && person.id !== me()) {
      const transfer = el("button", { type: "button", class: "pill", text: t("makeHost"), "aria-label": t("makeHostLabel", person.name) });
      transfer.onclick = async () => {
        try {
          await session.host.transfer(person.id);
          toast(t("nowHost", person.name));
        } catch (error) {
          message(ui["room-error"], error?.message ? t(error.message) : t("transferFailed"));
        }
      };
      row.append(transfer);
    }
    return row;
  }));
}

function renderSettings() {
  for (const button of ui.language.querySelectorAll("[data-language]"))
    button.setAttribute("aria-pressed", String(button.dataset.language === languagePref));
  ui["language-sub"].textContent = t("languageSub", LANGUAGE_NAMES[resolveLanguage(stellarrLocale)]);
  ui["room-note"].textContent = personal ? t("roomNotePersonal") : isHost() ? t("roomNoteHost") : t("roomNoteGuest", nameOf(host));
  ui["control-setting"].hidden = personal;
  for (const button of ui["control-mode"].querySelectorAll("[data-control]")) {
    button.setAttribute("aria-pressed", String(button.dataset.control === state.settings.control));
    button.disabled = !isHost();
  }
  ui["repeat-setting"].setAttribute("aria-checked", String(state.settings.repeat));
  ui["repeat-setting"].disabled = !isHost();
}

function render() {
  // Cinema mode hides the side panel and its button lives in the player controls,
  // so it ends when nothing is playing.
  if (!state.current) cinema = false;
  document.body.classList.toggle("cinema", cinema);
  renderHeader();
  renderStage();
  renderInfo();
  renderTabs();
  renderAddForm();
  renderQueue();
  renderHistory();
  renderPeople();
  renderSettings();
  applyVolume();
  syncPlayer();
}

// Commands

async function run(action, { quiet = false, id, errorElement = ui["room-error"] } = {}) {
  message(errorElement, null);
  try {
    return await session.commands.submit(COMMAND, action, id ? { id } : {});
  } catch (error) {
    if (quiet) throw error;
    message(errorElement, error?.message ? t(error.message) : t("confirmFailed"));
    return undefined;
  }
}

async function getMetadata(videoId, signal) {
  const watch = `https://www.youtube.com/watch?v=${videoId}`;
  const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(watch)}&format=json`;
  try {
    const response = await fetch(endpoint, { credentials: "omit", referrerPolicy: "origin", signal });
    if (!response.ok) return null;
    const data = await response.json();
    return {
      title: typeof data.title === "string" ? data.title : "",
      author: typeof data.author_name === "string" ? data.author_name : "",
    };
  } catch {
    // The video ID is enough for playback.
    return null;
  }
}

let lastAdd;
async function addVideo(action) {
  if (adding) return undefined;
  const key = JSON.stringify(action);
  if (lastAdd?.key !== key) lastAdd = { key, id: crypto.randomUUID() };
  adding = true;
  render();
  try {
    if (action.source === "youtube" && !action.title) {
      const meta = lookup.videoId === action.videoId && lookup.title ? lookup :
        await getMetadata(action.videoId, AbortSignal.timeout(1600));
      if (meta) {
        action.title = meta.title;
        action.author = meta.author;
      }
    }
    const result = await run(action, { id: lastAdd.id, errorElement: ui["add-error"] });
    if (result) {
      lastAdd = undefined;
      toast(t("added"));
    }
    return result;
  } finally {
    adding = false;
    render();
  }
}

function scheduleLookup() {
  clearTimeout(lookupTimer);
  lookupAbort?.abort();
  const parsed = parseYouTube(ui.link.value);
  if (!parsed) {
    lookup = { videoId: null, title: "", author: "", loading: false };
    return;
  }
  if (lookup.videoId === parsed.videoId) return;
  lookup = { videoId: parsed.videoId, title: "", author: "", loading: true };
  lookupTimer = setTimeout(async () => {
    lookupAbort = new AbortController();
    const timeout = setTimeout(() => lookupAbort.abort(), 6000);
    const meta = await getMetadata(parsed.videoId, lookupAbort.signal);
    clearTimeout(timeout);
    if (lookup.videoId !== parsed.videoId) return;
    lookup = { videoId: parsed.videoId, title: meta?.title || "", author: meta?.author || "", loading: false };
    renderAddForm();
  }, 350);
}

function togglePlay() {
  if (!state.current || !control()) return;
  void run({ type: playback().playing ? "pause" : "play", currentId: state.current.id });
}

function seekBy(delta) {
  const item = state.current;
  const duration = player?.getDuration() || 0;
  if (!item || !control() || !duration) return;
  const position = Math.min(Math.max(0, roomPosition() + delta), Math.max(0, duration - 0.1));
  void run({ type: "seek", currentId: item.id, position });
}

function toggleCinema() {
  cinema = !cinema && Boolean(state.current);
  render();
}

async function copyLink() {
  const item = state.current;
  if (item?.source !== "youtube") return;
  const position = roomPosition();
  const url = watchUrl(item.videoId, position);
  try {
    await navigator.clipboard.writeText(url);
    toast(t("copied", formatTime(position)));
  } catch {
    const area = el("textarea", { value: url, readOnly: true });
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    let copied = false;
    try { copied = document.execCommand("copy"); } catch { copied = false; }
    area.remove();
    toast(copied ? t("copied", formatTime(position)) : t("copyFailed"));
  }
}

function settings(change) {
  void run({ type: "settings", ...change });
}

function wakeControls() {
  ui.stage.classList.remove("idle");
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (state.current && playback().playing && !ui.controls.matches(":hover") && !ui.stage.classList.contains("hosted"))
      ui.stage.classList.add("idle");
  }, 2600);
}

// Events

ui.add.onsubmit = async event => {
  event.preventDefault();
  const original = ui.link.value;
  const parsed = parseYouTube(original);
  if (!parsed) {
    message(ui["add-error"], t("badLink"));
    ui.link.focus();
    return;
  }
  const known = lookup.videoId === parsed.videoId ? lookup : null;
  const result = await addVideo({
    source: "youtube", type: "add", ...parsed,
    title: ui["preview-title"].value.trim() || known?.title || "",
    author: known?.author || "",
  });
  if (result && ui.link.value === original) {
    ui.link.value = "";
    ui["preview-title"].value = "";
    lookup = { videoId: null, title: "", author: "", loading: false };
    renderAddForm();
  }
};
ui.link.addEventListener("input", () => {
  message(ui["add-error"], null);
  ui["preview-title"].value = "";
  scheduleLookup();
  renderAddForm();
});
ui.sample.onclick = () => addVideo({ source: "sample", type: "add" });
ui.play.onclick = togglePlay;
ui["big-play"].onclick = togglePlay;
ui.veil.onclick = () => {
  // On touch, the first tap only brings the controls back.
  if (tapWoke) {
    tapWoke = false;
    return;
  }
  togglePlay();
};
ui.veil.ondblclick = () => ui.fullscreen.click();
ui.stage.addEventListener("pointermove", event => {
  if (event.pointerType === "mouse") wakeControls();
});
ui.stage.addEventListener("pointerdown", event => {
  tapWoke = event.pointerType !== "mouse" && ui.stage.classList.contains("idle");
  wakeControls();
});
ui.stage.addEventListener("pointerleave", event => {
  if (event.pointerType === "mouse" && state.current && playback().playing) ui.stage.classList.add("idle");
});
ui.skip.onclick = () => {
  if (state.current) void run({ type: "skip", currentId: state.current.id });
};
ui["skip-now"].onclick = () => {
  if (state.current) void run({ type: "skip", currentId: state.current.id });
};
ui.vote.onclick = async () => {
  if (!state.current) return;
  await run({ type: "vote", currentId: state.current.id });
};
ui.rate.onchange = () => {
  if (state.current) void run({ type: "rate", currentId: state.current.id, rate: Number(ui.rate.value) });
};
ui.volume.oninput = () => setVolume(Number(ui.volume.value));
ui["volume-settings"].oninput = () => setVolume(Number(ui["volume-settings"].value));
ui.mute.onclick = toggleMute;
ui.cinema.onclick = toggleCinema;
ui.sync.onclick = () => {
  if (providerState?.kind === "blocked") player?.unlock(roomPosition());
  else if (providerState?.kind === "error") mount(true);
  else player?.resync();
};
ui.fullscreen.onclick = async () => {
  try {
    if (player?.fullscreen) player.fullscreen();
    else if (document.fullscreenElement) await document.exitFullscreen();
    else await ui.stage.requestFullscreen();
  } catch {
    toast(t("fullscreenUnavailable"));
  }
};
ui["copy-link"].onclick = copyLink;
ui.seek.oninput = () => {
  dragging = true;
  syncPlayer();
};
ui.seek.onchange = async () => {
  const currentId = state.current?.id;
  const duration = player?.getDuration();
  dragging = false;
  if (!currentId || !duration) return;
  const position = Math.min(Number(ui.seek.value), Math.max(0, duration - 0.1));
  const request = { item: currentId, position };
  seeking = request;
  await run({ type: "seek", currentId, position });
  if (seeking === request) seeking = undefined;
  syncPlayer();
};
ui.seek.onpointercancel = () => { dragging = false; };
ui["people-button"].onclick = () => {
  // Cinema mode hides the side panel, so showing the People tab leaves it.
  tab = "people";
  cinema = false;
  render();
  ui["tab-people"].focus();
};
ui["clear-history"].onclick = () => run({ type: "clearHistory" });
ui["autoplay-quick"].onclick = () => settings({ autoplay: !state.settings.autoplay });
ui["autoplay-setting"].onclick = () => settings({ autoplay: !state.settings.autoplay });
ui["repeat-setting"].onclick = () => settings({ repeat: !state.settings.repeat });
ui["control-mode"].onclick = event => {
  const value = event.target.closest("[data-control]")?.dataset.control;
  if (value && value !== state.settings.control) settings({ control: value });
};
ui.language.onclick = event => {
  const value = event.target.closest("[data-language]")?.dataset.language;
  if (value) chooseLanguage(value);
};
ui.tabs.onclick = event => {
  const value = event.target.closest("[data-tab]")?.dataset.tab;
  if (!value) return;
  tab = value;
  openMenu = null;
  render();
};
ui.tabs.onkeydown = event => {
  const visible = visibleTabs();
  const index = visible.indexOf(tab);
  let next;
  if (event.key === "ArrowRight") next = visible[(index + 1) % visible.length];
  else if (event.key === "ArrowLeft") next = visible[(index - 1 + visible.length) % visible.length];
  else if (event.key === "Home") next = visible[0];
  else if (event.key === "End") next = visible.at(-1);
  if (!next) return;
  event.preventDefault();
  tab = next;
  render();
  ui[`tab-${next}`].focus();
};
document.addEventListener("pointerdown", event => {
  if (openMenu && !event.target.closest(".menu, [aria-haspopup='menu']")) {
    openMenu = null;
    listSignatures.queue = null;
    renderQueue();
  }
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    if (openMenu) {
      const owner = openMenu;
      openMenu = null;
      listSignatures.queue = null;
      renderQueue();
      ui.items.querySelector(`[data-action="${CSS.escape(`${owner}:menu`)}"]`)?.focus();
    } else if (cinema) {
      toggleCinema();
    }
    return;
  }
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.target.closest?.("input, textarea, select, button, a, summary, [contenteditable='true']")) return;
  if (event.code === "Space") {
    event.preventDefault();
    togglePlay();
  } else if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
    event.preventDefault();
    seekBy(event.key === "ArrowRight" ? 5 : -5);
  } else if (event.key.toLowerCase() === "m") {
    toggleMute();
  } else if (event.key.toLowerCase() === "t") {
    toggleCinema();
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    syncPlayer();
    return;
  }
  if (lastSpot && playback().playing) rememberCurrentSpot();
  void progress.flush();
});

// Host duties

async function recoverHost() {
  const id = me();
  if (host !== id) return;
  try {
    if (!state.founder) await session.state.set(current => (current.founder ? undefined : { founder: id }));
    if (state.current && state.playback.host !== id)
      await session.state.set(current => takeover(normalizeRoom(current), id, session.now()));
  } catch {
    // A newer host may have taken over. The state and host subscriptions will reconcile.
  }
}

function announce(notice) {
  if (!notice || notice.at === lastNotice?.at) return;
  lastNotice = notice;
  if (notice.kind === "vote") toast(t("noticeVote"));
  else if (notice.by === me()) toast(t("noticeYou"));
  else toast(t(notice.kind === "owner" ? "noticeOwner" : "noticeFounder", nameOf(notice.by)));
}

translateStatic();
buildRates();
applyVolume();
render();

try {
  session = await connect({ initialState: emptyRoom() });
  if (!session.commands || !session.host || !session.media?.volume || !session.participants)
    throw new Error("sdkMissing");
  personal = session.context.launchMode === "personal";
  canRate = !session.media.youtube;
  stellarrLocale = session.context.locale || stellarrLocale;
  const setDevice = device => { if (device) document.documentElement.dataset.device = device; };
  setDevice(session.context.device);
  session.device?.subscribe(setDevice);
  session.locale?.subscribe(value => {
    if (!value || value === stellarrLocale) return;
    stellarrLocale = value;
    applyLanguage();
  });
  host = session.host.get();
  state = normalizeRoom(session.state.get());
  lastNotice = state.notice;
  participants = session.participants.get();
  roomVolume = session.media.volume.get();
  session.commands.handle(COMMAND, (action, meta, current) => {
    const people = session.participants.get();
    return reduceRoom(current, action, meta, session.host.get(), session.now(), {
      connected: people.filter(person => person.connected).map(person => person.id),
      owners: ownerIds(people),
    });
  });
  ready = true;

  progress = createProgress(session);
  progress.subscribe(data => {
    const saved = preference(data, "language");
    if (LANGUAGES.includes(saved) && saved !== languagePref) {
      languagePref = saved;
      writeLocal("synctube-language", saved);
      applyLanguage();
    } else {
      listSignatures.history = null;
      renderQueue();
      renderHistory();
      renderInfo();
    }
  });
  void progress.load();

  session.state.subscribe(value => {
    state = normalizeRoom(value);
    announce(state.notice);
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
  applyLanguage();
  void recoverHost();
  setInterval(syncPlayer, 650);
  setInterval(() => {
    const id = me();
    if (id !== host || !hostOnline()) return;
    if (state.current && state.playback.host !== id) void recoverHost();
    else if (state.playback.playing) void session.state.set(current => checkpoint(normalizeRoom(current), id, session.now())).catch(() => {});
  }, 5_000);
} catch (error) {
  ready = false;
  render();
  ui["people-label"].textContent = t("joinFailed");
  message(ui["room-error"], error?.message ? t(error.message) : t("joinFailed"));
}
