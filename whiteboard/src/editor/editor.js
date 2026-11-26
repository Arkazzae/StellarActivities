import {
  boxContains,
  centerOf,
  commonBounds,
  distance,
  distanceToPolyline,
  elementBounds,
  hitElement,
  insideElementBox,
  linearPath,
  normalizePoints,
  rebaseLinear,
  rotate,
  snapAngle,
  toLocal,
  toWorld,
} from "../model/geometry.js";
import { compareOrder, keyBetween, keysBetween } from "../model/order.js";
import { canHoldLabel, createElement, DEFAULT_STYLE, isBindable, isLinear, newId } from "../model/types.js";
import { ImageStore } from "../render/images.js";
import { clearMetricsCache, Renderer } from "../render/renderer.js";
import { loadFonts, LINE_HEIGHT, measureText, requiredContainerHeight } from "../render/text.js";
import { MAX_POINTS, simplifyStroke } from "../model/codec.js";
import { t } from "../i18n.js";
import { bindTargetAt, routeArrow } from "./bindings.js";
import { cloneForInsert, parseClipboard, serializeClipboard } from "./clipboard.js";
import {
  cursorForHandle,
  framePoint,
  handleOptionsFor,
  handlePositions,
  handleSigns,
  HANDLE_SIZE,
  midpoints,
  selectionFrame,
} from "./handles.js";
import { resizeElement, resizeMany, rotateMany, snapToGrid } from "./transform.js";
export const GRID_SIZE = 20;
/** Selection colour: the brand cobalt (lighter on the dark board). */
export const ACCENT = "#1f35d1";
const ACCENT_DARK = "#8c9bff";
const PEER_COLORS = ["#2f7de1", "#1f9d6b", "#9b51e0", "#d9467a", "#c98a12", "#13939f", "#6b5bd6", "#c4462b"];
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 30;
/** Normalises preferences stored in the account's progress save. */
export const normalizePrefs = (raw) => {
  const prefs = typeof raw === "object" && raw !== null ? raw : {};
  return {
    theme: prefs.theme === "dark" || prefs.theme === "light" ? prefs.theme : null,
    grid: prefs.grid === true,
    style: { ...DEFAULT_STYLE, ...(typeof prefs.style === "object" && prefs.style !== null ? prefs.style : {}) },
    toolLocked: prefs.toolLocked === true,
  };
};
const hashColor = (id) => {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) | 0;
  return PEER_COLORS[Math.abs(hash) % PEER_COLORS.length];
};
const isTypingTarget = (target) =>
  target instanceof HTMLElement &&
  (target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable);
export const outermostGroup = (el) => (el.groupIds.length === 0 ? null : el.groupIds[el.groupIds.length - 1]);
export class Editor {
  store;
  room;
  themeChoice = null;
  images;
  renderer;
  #stage;
  #sceneCanvas;
  #overlayCanvas;
  #sceneCtx;
  #overlayCtx;
  #host = null;
  tool = "select";
  toolLocked = false;
  theme = "light";
  grid = false;
  style = DEFAULT_STYLE;
  selection = new Set();
  editingId = null;
  scrollX = 0;
  scrollY = 0;
  zoom = 1;
  width = 0;
  height = 0;
  dpr = 1;
  #gesture = { kind: "none" };
  #pointers = new Map();
  #lastDown = null;
  #lastPointer = null;
  #spaceDown = false;
  #bindTarget = null;
  #activePoint = null;
  #eraserTrail = [];
  #laserTrail = [];
  #peers = new Map();
  #sceneDirty = true;
  #overlayDirty = true;
  #frameRequested = false;
  #clipboard = null;
  #pasteCount = 0;
  #changeListeners = new Set();
  #changeQueued = false;
  #cleanups = [];
  #buttonDown = false;
  #files = null;
  #liveIds = new Set();
  #liveSent = false;
  /**
   * @param room   presence and live previews (collab/room.js)
   * @param files  peer-to-peer images (collab/files.js)
   * @param prefs  preferences from the account save
   */
  constructor(stage, store, room, files, prefs) {
    this.#stage = stage;
    this.store = store;
    this.room = room;
    this.#files = files;
    this.#sceneCanvas = document.createElement("canvas");
    this.#sceneCanvas.className = "stage__scene";
    this.#overlayCanvas = document.createElement("canvas");
    this.#overlayCanvas.className = "stage__overlay";
    this.#overlayCanvas.tabIndex = 0;
    this.#overlayCanvas.setAttribute("role", "application");
    this.#overlayCanvas.setAttribute("aria-label", t("Tablica do rysowania"));
    stage.append(this.#sceneCanvas, this.#overlayCanvas);
    const sceneCtx = this.#sceneCanvas.getContext("2d");
    const overlayCtx = this.#overlayCanvas.getContext("2d");
    if (sceneCtx === null || overlayCtx === null) throw new Error(t("Przeglądarka nie obsługuje Canvas 2D."));
    this.#sceneCtx = sceneCtx;
    this.#overlayCtx = overlayCtx;
    const initial = normalizePrefs(prefs);
    this.themeChoice = initial.theme;
    if (initial.theme !== null) this.theme = initial.theme;
    this.grid = initial.grid;
    this.style = initial.style;
    this.toolLocked = initial.toolLocked;
    this.images = new ImageStore(
      (id) => {
        const data = this.store.file(id);
        if (data === undefined) this.#files?.want(id);
        return data;
      },
      () => this.requestRender(),
    );
    this.renderer = new Renderer(store, this.images);
    this.#cleanups.push(store.subscribe(this.#onSceneChange));
    this.#cleanups.push(room.onPeers(this.#onPeers));
    this.#cleanups.push(room.onOverrides(() => this.requestRender()));
    this.#bindEvents();
    this.#resize();
    const onFonts = () => {
      clearMetricsCache();
      this.#refitTextElements();
      this.requestRender();
    };
    void loadFonts().then(onFonts);
    // A subset can arrive later (e.g. the first character from another script).
    document.fonts.addEventListener("loadingdone", onFonts);
    this.#cleanups.push(() => document.fonts.removeEventListener("loadingdone", onFonts));
  }
  attachHost(host) {
    this.#host = host;
  }
  focusCanvas() {
    this.#overlayCanvas.focus({ preventScroll: true });
  }
  destroy() {
    for (const cleanup of this.#cleanups) cleanup();
    this.store.flush();
  }
  /* ============================================================ state API */
  onChange(listener) {
    this.#changeListeners.add(listener);
    return () => this.#changeListeners.delete(listener);
  }
  #emitChange() {
    if (this.#changeQueued) return;
    this.#changeQueued = true;
    requestAnimationFrame(() => {
      this.#changeQueued = false;
      for (const listener of this.#changeListeners) listener();
    });
  }
  get viewport() {
    return {
      scrollX: this.scrollX,
      scrollY: this.scrollY,
      zoom: this.zoom,
      width: this.width,
      height: this.height,
      dpr: this.dpr,
    };
  }
  get gestureKind() {
    return this.#gesture.kind;
  }
  get peerList() {
    return [...this.#peers].map(([id, peer]) => ({ id, name: peer.name, color: peer.color }));
  }
  selectedElements() {
    const out = [];
    for (const el of this.store.ordered()) if (this.selection.has(el.id)) out.push(el);
    return out;
  }
  /** Called with the preferences to keep in the account save. */
  onPrefs = null;
  #savePrefs() {
    this.onPrefs?.({ theme: this.themeChoice, grid: this.grid, style: this.style, toolLocked: this.toolLocked });
  }
  setTool(tool) {
    if (this.#gesture.kind === "multipoint") this.#finishMultipoint();
    if (this.editingId !== null) this.#host?.closeTextEditor();
    this.tool = tool;
    if (tool !== "select") this.setSelection([]);
    this.#updateCursor();
    this.#publishPresence();
    this.requestRender(false);
    this.#emitChange();
  }
  toggleToolLock() {
    this.toolLocked = !this.toolLocked;
    this.#savePrefs();
    this.#emitChange();
  }
  /** Drops the person's own choice and follows Stellarr's theme again. */
  useHostTheme(mode) {
    this.themeChoice = null;
    this.#savePrefs();
    this.theme = mode === "dark" ? "dark" : "light";
    this.requestRender();
    this.#emitChange();
  }
  /** `choice` = the person picked it (kept in their save); otherwise it follows Stellarr. */
  setTheme(theme, choice = true) {
    if (choice) {
      this.themeChoice = theme;
      this.#savePrefs();
    } else if (this.themeChoice !== null) {
      return;
    }
    this.theme = theme;
    this.requestRender();
    this.#emitChange();
  }
  setGrid(grid) {
    this.grid = grid;
    this.#savePrefs();
    this.requestRender();
    this.#emitChange();
  }
  setSelection(ids) {
    const next = new Set();
    for (const id of ids) if (this.store.has(id)) next.add(id);
    const same = next.size === this.selection.size && [...next].every((id) => this.selection.has(id));
    if (same) return;
    this.selection = next;
    this.#publishPresence();
    this.requestRender(false);
    this.#emitChange();
  }
  /** Applies a style change to the current style and to the selection. */
  setStyle(patch, options = {}) {
    this.style = { ...this.style, ...patch };
    this.#savePrefs();
    const selected = this.selectedElements();
    if (selected.length > 0) {
      if (!options.continuous) this.store.beginStep();
      for (const el of selected) {
        const elPatch = this.#stylePatchFor(el, patch);
        if (Object.keys(elPatch).length > 0) this.store.update(el.id, elPatch);
      }
      this.#refitLabels(selected.map((el) => el.id));
      this.#rerouteFor(new Set(selected.map((el) => el.id)));
      if (options.continuous) this.#scheduleLive();
      else this.store.beginStep();
    }
    this.#emitChange();
  }
  #stylePatchFor(el, patch) {
    const out = {};
    const has = (key) => patch[key] !== undefined;
    if (has("strokeColor")) out.strokeColor = patch.strokeColor;
    if (has("opacity")) out.opacity = patch.opacity;
    const drawsShape = el.type !== "text" && el.type !== "image";
    if (drawsShape) {
      if (has("strokeWidth")) out.strokeWidth = patch.strokeWidth;
      if (has("roughness")) out.roughness = patch.roughness;
      if (has("strokeStyle") && el.type !== "freedraw") out.strokeStyle = patch.strokeStyle;
    }
    if (el.type !== "freedraw" && el.type !== "image" && el.type !== "text" && el.type !== "arrow") {
      if (has("fillColor")) out.fillColor = patch.fillColor;
      if (has("fillStyle")) out.fillStyle = patch.fillStyle;
    }
    if (has("rounded") && (el.type === "rectangle" || el.type === "diamond" || isLinear(el)))
      out.rounded = patch.rounded;
    if (el.type === "text" || canHoldLabel(el)) {
      if (has("fontFamily")) out.fontFamily = patch.fontFamily;
      if (has("fontSize")) out.fontSize = patch.fontSize;
      if (has("textAlign")) out.textAlign = patch.textAlign;
    }
    if (el.type === "arrow") {
      if (has("startArrow")) out.startArrow = patch.startArrow;
      if (has("endArrow")) out.endArrow = patch.endArrow;
    }
    if (el.type === "text" && (out.fontFamily !== undefined || out.fontSize !== undefined)) {
      const next = { ...el, ...out };
      Object.assign(out, this.#textBox(next));
    }
    return out;
  }
  /* ============================================================ viewport */
  screenToScene(sx, sy) {
    return { x: sx / this.zoom - this.scrollX, y: sy / this.zoom - this.scrollY };
  }
  sceneToScreen(x, y) {
    return { x: (x + this.scrollX) * this.zoom, y: (y + this.scrollY) * this.zoom };
  }
  zoomAt(nextZoom, sx = this.width / 2, sy = this.height / 2) {
    const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nextZoom));
    const anchor = this.screenToScene(sx, sy);
    this.zoom = clamped;
    this.scrollX = sx / clamped - anchor.x;
    this.scrollY = sy / clamped - anchor.y;
    this.#afterViewportChange();
  }
  zoomBy(factor) {
    this.zoomAt(this.zoom * factor);
  }
  resetZoom() {
    this.zoomAt(1);
  }
  scrollBy(dx, dy) {
    this.scrollX += dx / this.zoom;
    this.scrollY += dy / this.zoom;
    this.#afterViewportChange();
  }
  /** Fit the board (or the selection) into the viewport. */
  zoomToFit(selectionOnly = false, maxZoom = 1) {
    const elements = selectionOnly && this.selection.size > 0 ? this.selectedElements() : this.store.ordered();
    const box = commonBounds(elements);
    if (box === null) {
      this.zoom = 1;
      this.scrollX = this.width / 2;
      this.scrollY = this.height / 2;
      this.#afterViewportChange();
      return;
    }
    const margin = Math.min(120, Math.max(40, Math.min(this.width, this.height) * 0.1));
    const width = Math.max(1, box.maxX - box.minX);
    const height = Math.max(1, box.maxY - box.minY);
    const zoom = Math.max(
      MIN_ZOOM,
      Math.min(
        maxZoom === Infinity ? MAX_ZOOM : maxZoom,
        (this.width - margin * 2) / width,
        (this.height - margin * 2) / height,
      ),
    );
    this.zoom = zoom;
    this.scrollX = this.width / 2 / zoom - (box.minX + width / 2);
    this.scrollY = this.height / 2 / zoom - (box.minY + height / 2);
    this.#afterViewportChange();
  }
  #afterViewportChange() {
    if (this.editingId !== null) {
      const el = this.store.get(this.editingId);
      if (el !== undefined) this.#host?.openTextEditor(el);
    }
    this.requestRender();
    this.#emitChange();
  }
  #resize = () => {
    const rect = this.#stage.getBoundingClientRect();
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    this.dpr = Math.min(3, window.devicePixelRatio || 1);
    for (const canvas of [this.#sceneCanvas, this.#overlayCanvas]) {
      canvas.width = Math.round(this.width * this.dpr);
      canvas.height = Math.round(this.height * this.dpr);
      canvas.style.width = `${this.width}px`;
      canvas.style.height = `${this.height}px`;
    }
    this.requestRender();
  };
  /* ============================================================== render */
  requestRender(scene = true) {
    if (scene) this.#sceneDirty = true;
    this.#overlayDirty = true;
    if (this.#frameRequested) return;
    this.#frameRequested = true;
    requestAnimationFrame(this.#frame);
  }
  #frame = () => {
    this.#frameRequested = false;
    const dark = this.theme === "dark";
    const viewport = this.viewport;
    if (this.#sceneDirty) {
      this.#sceneDirty = false;
      const drafts = [];
      const overrides = new Map();
      for (const [id, el] of this.room.overrides()) {
        if (this.store.has(id)) overrides.set(id, el);
        else drafts.push(el);
      }
      if (this.#gesture.kind === "freedraw") drafts.push(this.#gesture.draft);
      this.renderer.drawScene(this.#sceneCtx, viewport, {
        dark,
        grid: this.grid,
        background: this.store.meta().background,
        hiddenTextId: this.editingId,
        fadedIds: this.#gesture.kind === "erase" ? this.#gesture.ids : new Set(),
        drafts,
        overrides,
      });
    }
    let animating = false;
    if (this.#overlayDirty) {
      this.#overlayDirty = false;
      const now = performance.now();
      animating = this.#stepPeers(now);
      this.#eraserTrail = this.#eraserTrail.filter((point) => now - point.t < 260);
      this.#laserTrail = this.#laserTrail.filter((point) => now - point.t < 900);
      if (this.#eraserTrail.length > 0 || this.#laserTrail.length > 0) animating = true;
      this.renderer.drawOverlay(this.#overlayCtx, viewport, this.#overlayState(now));
    }
    if (animating) this.requestRender(false);
  };
  #overlayState(now) {
    const gestureHidesFrame = this.#gesture.kind === "move" && this.#gesture.moved;
    const selected = this.editingId === null ? this.selectedElements() : [];
    const single = selected.length === 1 ? selected[0] : null;
    const pointHandles = single !== null && isLinear(single) && !single.locked ? single : null;
    const frame = selectionFrame(selected);
    const showHandles =
      frame !== null &&
      !gestureHidesFrame &&
      this.#gesture.kind !== "marquee" &&
      pointHandles === null &&
      !selected.some((el) => el.locked);
    const peers = [];
    for (const [id, peer] of this.#peers) {
      const selectedEls = [];
      for (const elId of peer.selectedIds) {
        const el = this.store.get(elId);
        if (el !== undefined) selectedEls.push(el);
      }
      peers.push({
        id,
        name: peer.name,
        color: peer.color,
        cursor: peer.shown,
        laser: peer.laser,
        down: peer.down,
        trail: peer.trail,
        selected: selectedEls,
      });
    }
    return {
      selection: selected,
      frame: gestureHidesFrame ? null : frame,
      handles: showHandles && frame !== null ? handlePositions(frame, this.zoom, handleOptionsFor(selected)) : null,
      pointHandles: gestureHidesFrame ? null : pointHandles,
      activePoint: this.#activePoint,
      marquee:
        this.#gesture.kind === "marquee"
          ? {
              minX: Math.min(this.#gesture.start.x, this.#gesture.current.x),
              minY: Math.min(this.#gesture.start.y, this.#gesture.current.y),
              maxX: Math.max(this.#gesture.start.x, this.#gesture.current.x),
              maxY: Math.max(this.#gesture.start.y, this.#gesture.current.y),
            }
          : null,
      bindTarget: this.#bindTarget,
      eraserTrail: this.#eraserTrail,
      laserTrail: this.#laserTrail,
      peers,
      accent: this.theme === "dark" ? ACCENT_DARK : ACCENT,
      now,
    };
  }
  /** Smooth remote cursors toward their latest position. Returns true while moving. */
  #stepPeers(now) {
    let moving = false;
    for (const peer of this.#peers.values()) {
      peer.trail = peer.trail.filter((point) => now - point.t < 900);
      if (peer.trail.length > 0) moving = true;
      if (peer.target === null) {
        peer.shown = null;
        continue;
      }
      if (peer.shown === null) {
        peer.shown = { ...peer.target };
        continue;
      }
      const dx = peer.target.x - peer.shown.x;
      const dy = peer.target.y - peer.shown.y;
      if (Math.abs(dx) * this.zoom < 0.5 && Math.abs(dy) * this.zoom < 0.5) {
        peer.shown = { ...peer.target };
      } else {
        peer.shown = { x: peer.shown.x + dx * 0.45, y: peer.shown.y + dy * 0.45 };
        moving = true;
      }
    }
    return moving;
  }
  /* ============================================================ presence */
  #onPeers = (peers) => {
    const seen = new Set();
    const now = performance.now();
    for (const peer of peers) {
      seen.add(peer.id);
      const state = this.#peers.get(peer.id) ?? {
        name: peer.name,
        color: hashColor(peer.id),
        target: null,
        shown: null,
        laser: false,
        down: false,
        trail: [],
        selectedIds: [],
      };
      state.name = peer.name;
      const presence = peer.presence;
      state.target = presence?.cursor ?? null;
      state.laser = presence?.tool === "laser";
      state.down = presence?.button === "down";
      state.selectedIds = presence?.selectedIds ?? [];
      if (state.laser && presence?.trail?.length) {
        for (const point of presence.trail) if (point.t > (state.trail.at(-1)?.t ?? 0)) state.trail.push(point);
        while (state.trail.length > 80) state.trail.shift();
      }
      void now;
      this.#peers.set(peer.id, state);
    }
    for (const id of [...this.#peers.keys()]) if (!seen.has(id)) this.#peers.delete(id);
    this.requestRender(false);
    this.#emitChange();
  };
  #publishPresence() {
    const presence = {
      cursor: this.#lastPointer,
      tool: this.tool === "laser" ? "laser" : "pointer",
      button: this.#buttonDown ? "down" : "up",
      selectedIds: [...this.selection],
    };
    this.room.publish(presence);
  }
  /* ========================================================= scene events */
  #onSceneChange = (change) => {
    if (change.files) this.images.refresh();
    if (!change.external && (this.#gesture.kind !== "none" || this.editingId !== null)) {
      for (const id of change.ids) this.#liveIds.add(id);
    }
    if (change.external) {
      let pruned = false;
      for (const id of this.selection) {
        if (!this.store.has(id)) {
          this.selection.delete(id);
          pruned = true;
        }
      }
      if (this.editingId !== null && !this.store.has(this.editingId)) {
        this.editingId = null;
        this.#host?.closeTextEditor();
      }
      if (pruned) this.#publishPresence();
      this.renderer.prune();
    }
    this.requestRender();
    this.#emitChange();
  };
  /** Shows others what I am doing right now; the room state is written when the gesture ends. */
  #scheduleLive() {
    const elements = [];
    for (const id of this.#liveIds) {
      const el = this.store.get(id);
      if (el !== undefined) elements.push(el);
    }
    if (this.#gesture.kind === "freedraw") elements.push(this.#gesture.draft);
    if (elements.length === 0) return;
    this.#liveSent = true;
    this.room.sendLive(elements);
  }
  #endLive() {
    if (this.#liveSent) this.room.endLive();
    this.#liveSent = false;
    this.#liveIds.clear();
  }
  #flushNow() {
    this.#endLive();
    this.store.flush();
  }
  /* ============================================================ hit tests */
  get #tolerance() {
    return 8 / this.zoom;
  }
  /** Topmost unlocked element under a scene point. */
  elementAt(point, includeLocked = false) {
    const ordered = this.store.ordered();
    for (let index = ordered.length - 1; index >= 0; index -= 1) {
      const el = ordered[index];
      if (el.locked && !includeLocked) continue;
      const insideCounts = this.selection.has(el.id);
      if (hitElement(el, point.x, point.y, this.#tolerance, insideCounts)) return el;
    }
    return null;
  }
  /** The element plus all members of its outermost group. */
  groupMembers(el) {
    const group = outermostGroup(el);
    if (group === null) return [el.id];
    return this.store
      .ordered()
      .filter((other) => other.groupIds.includes(group))
      .map((other) => other.id);
  }
  #handleAt(screen) {
    const selected = this.selectedElements();
    if (selected.length === 0 || selected.some((el) => el.locked)) return null;
    if (selected.length === 1 && isLinear(selected[0])) return null;
    const frame = selectionFrame(selected);
    if (frame === null) return null;
    const handles = handlePositions(frame, this.zoom, handleOptionsFor(selected));
    const radius = HANDLE_SIZE / 2 + 5;
    let best = null;
    let bestDistance = Infinity;
    for (const [id, position] of handles) {
      const s = this.sceneToScreen(position.x, position.y);
      const d = Math.hypot(s.x - screen.x, s.y - screen.y);
      if (d <= radius && d < bestDistance) {
        best = id;
        bestDistance = d;
      }
    }
    return best;
  }
  /** Point handle (or midpoint) of a single selected linear element. */
  #pointHandleAt(screen) {
    const selected = this.selectedElements();
    if (selected.length !== 1) return null;
    const el = selected[0];
    if (!isLinear(el) || el.locked) return null;
    for (let index = el.points.length - 1; index >= 0; index -= 1) {
      const [lx, ly] = el.points[index];
      const world = toWorld(el, lx, ly);
      const s = this.sceneToScreen(world.x, world.y);
      if (Math.hypot(s.x - screen.x, s.y - screen.y) <= 9) return { el, index, mid: false };
    }
    const mids = midpoints(el.points);
    for (let index = 0; index < mids.length; index += 1) {
      const a = el.points[index];
      const b = el.points[index + 1];
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) * this.zoom < 36) continue;
      const [lx, ly] = mids[index];
      const world = toWorld(el, lx, ly);
      const s = this.sceneToScreen(world.x, world.y);
      if (Math.hypot(s.x - screen.x, s.y - screen.y) <= 8) return { el, index, mid: true };
    }
    return null;
  }
  #insideSelectionFrame(point) {
    const selected = this.selectedElements();
    if (selected.length === 0) return false;
    if (selected.length === 1) return insideElementBox(selected[0], point.x, point.y, 6 / this.zoom);
    const box = commonBounds(selected);
    return box !== null && point.x >= box.minX && point.x <= box.maxX && point.y >= box.minY && point.y <= box.maxY;
  }
  /* ============================================================== events */
  #bindEvents() {
    const canvas = this.#overlayCanvas;
    const on = (target, type, listener, options) => {
      target.addEventListener(type, listener, options);
      this.#cleanups.push(() => target.removeEventListener(type, listener, options));
    };
    on(canvas, "pointerdown", this.#onPointerDown);
    on(canvas, "pointermove", this.#onPointerMove);
    on(canvas, "pointerup", this.#onPointerUp);
    on(canvas, "pointercancel", this.#onPointerCancel);
    on(canvas, "pointerleave", () => {
      if (this.#gesture.kind === "none") {
        this.#lastPointer = null;
        this.#publishPresence();
      }
    });
    on(canvas, "wheel", this.#onWheel, { passive: false });
    on(canvas, "contextmenu", (event) => {
      event.preventDefault();
      const point = this.#scenePoint(event);
      const target = this.elementAt(point, true);
      if (target !== null && !this.selection.has(target.id)) this.setSelection(this.groupMembers(target));
      if (target === null) this.setSelection([]);
      this.#host?.contextMenu(event.clientX, event.clientY, target);
    });
    on(canvas, "dragover", (event) => event.preventDefault());
    on(canvas, "drop", (event) => {
      event.preventDefault();
      const point = this.#scenePoint(event);
      const files = [...(event.dataTransfer?.files ?? [])];
      void this.#insertFiles(files, point);
    });
    on(window, "keydown", this.#onKeyDown);
    on(window, "keyup", (event) => {
      if (event.code === "Space") {
        this.#spaceDown = false;
        this.#updateCursor();
      }
    });
    on(window, "blur", () => {
      this.#spaceDown = false;
    });
    on(document, "copy", (event) => this.#onCopy(event, false));
    on(document, "cut", (event) => this.#onCopy(event, true));
    on(document, "paste", this.#onPaste);
    const observer = new ResizeObserver(() => this.#resize());
    observer.observe(this.#stage);
    this.#cleanups.push(() => observer.disconnect());
    const dprQuery = () => this.#resize();
    window.addEventListener("resize", dprQuery);
    this.#cleanups.push(() => window.removeEventListener("resize", dprQuery));
  }
  #screenPoint(event) {
    const rect = this.#overlayCanvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  #scenePoint(event) {
    const screen = this.#screenPoint(event);
    return this.screenToScene(screen.x, screen.y);
  }
  #snap(point) {
    if (!this.grid) return point;
    return { x: snapToGrid(point.x, GRID_SIZE), y: snapToGrid(point.y, GRID_SIZE) };
  }
  #onWheel = (event) => {
    event.preventDefault();
    const screen = this.#screenPoint(event);
    const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.height : 1;
    if (event.ctrlKey || event.metaKey) {
      const delta = Math.max(-60, Math.min(60, event.deltaY * scale));
      this.zoomAt(this.zoom * Math.exp(-delta * 0.0095), screen.x, screen.y);
      return;
    }
    let dx = event.deltaX * scale;
    let dy = event.deltaY * scale;
    if (event.shiftKey && dx === 0) {
      dx = dy;
      dy = 0;
    }
    this.scrollBy(-dx, -dy);
  };
  #onPointerDown = (event) => {
    if (this.editingId !== null) this.#host?.closeTextEditor();
    this.#overlayCanvas.focus({ preventScroll: true });
    this.#pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    try {
      this.#overlayCanvas.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic events in tests have no active pointer.
    }
    if (this.#pointers.size === 2) {
      this.#startPinch();
      return;
    }
    if (this.#pointers.size > 2) return;
    if (event.button === 2) return;
    const screen = this.#screenPoint(event);
    const point = this.screenToScene(screen.x, screen.y);
    this.#lastPointer = point;
    this.#buttonDown = true;
    const now = performance.now();
    const isDouble =
      this.#lastDown !== null &&
      now - this.#lastDown.time < 380 &&
      Math.hypot(this.#lastDown.x - screen.x, this.#lastDown.y - screen.y) < 8 &&
      event.button === 0;
    this.#lastDown = isDouble ? null : { time: now, x: screen.x, y: screen.y };
    if (event.button === 1 || this.#spaceDown || this.tool === "hand") {
      this.#gesture = {
        kind: "pan",
        startX: event.clientX,
        startY: event.clientY,
        scrollX: this.scrollX,
        scrollY: this.scrollY,
      };
      this.#updateCursor("grabbing");
      return;
    }
    if (isDouble && this.#onDoubleClick(point, screen)) return;
    switch (this.tool) {
      case "select":
        this.#downSelect(point, screen, event);
        break;
      case "rectangle":
      case "diamond":
      case "ellipse":
        this.#downCreateShape(this.tool, point);
        break;
      case "arrow":
      case "line":
        this.#downLinear(this.tool, point, event);
        break;
      case "freedraw":
        this.#downFreedraw(point, event);
        break;
      case "text":
        this.#downText(point);
        break;
      case "image":
        this.#host?.pickImage(point);
        break;
      case "eraser":
        this.#gesture = { kind: "erase", ids: new Set(), last: point };
        this.#eraseAlong(point, point);
        break;
      case "laser":
        this.#gesture = { kind: "laser" };
        this.#laserTrail.push({ ...point, t: performance.now() });
        break;
      default:
        break;
    }
    this.#publishPresence();
    this.requestRender(false);
  };
  #onPointerMove = (event) => {
    if (this.#pointers.has(event.pointerId))
      this.#pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const gesture = this.#gesture;
    if (gesture.kind === "pinch") {
      this.#movePinch();
      return;
    }
    const screen = this.#screenPoint(event);
    const point = this.screenToScene(screen.x, screen.y);
    this.#lastPointer = point;
    switch (gesture.kind) {
      case "none":
        this.#hover(point, screen);
        break;
      case "pan":
        this.scrollX = gesture.scrollX + (event.clientX - gesture.startX) / this.zoom;
        this.scrollY = gesture.scrollY + (event.clientY - gesture.startY) / this.zoom;
        this.#afterViewportChange();
        break;
      case "create":
        this.#moveCreateShape(gesture, point, event);
        break;
      case "linear":
      case "multipoint":
        this.#moveLinear(gesture.id, point, event.shiftKey);
        if (gesture.kind === "linear" && distance(gesture.start.x, gesture.start.y, point.x, point.y) * this.zoom > 4) {
          gesture.moved = true;
        }
        break;
      case "freedraw": {
        const events = typeof event.getCoalescedEvents === "function" ? event.getCoalescedEvents() : [];
        for (const sample of events.length > 0 ? events : [event]) {
          const p = this.#scenePoint(sample);
          gesture.points.push([p.x - gesture.origin.x, p.y - gesture.origin.y]);
          if (sample.pointerType === "pen") gesture.pressures.push(sample.pressure);
        }
        gesture.draft = { ...gesture.draft, points: gesture.points.slice(), pressures: gesture.pressures.slice() };
        this.requestRender();
        this.#scheduleLive();
        break;
      }
      case "move":
        this.#moveSelection(gesture, point);
        break;
      case "resize":
        this.#resizeSelection(gesture, point, event);
        break;
      case "rotate":
        this.#rotateSelection(gesture, point, event.shiftKey);
        break;
      case "point":
        this.#movePoint(gesture, point, event.shiftKey);
        break;
      case "marquee":
        gesture.current = point;
        this.#updateMarquee(gesture);
        break;
      case "erase":
        this.#eraseAlong(gesture.last, point);
        gesture.last = point;
        break;
      case "laser":
        this.#laserTrail.push({ ...point, t: performance.now() });
        if (this.#laserTrail.length > 120) this.#laserTrail.shift();
        this.requestRender(false);
        break;
    }
    this.#publishPresence();
  };
  #onPointerUp = (event) => {
    this.#pointers.delete(event.pointerId);
    const gesture = this.#gesture;
    if (gesture.kind === "pinch") {
      if (this.#pointers.size < 2) this.#gesture = { kind: "none" };
      return;
    }
    this.#buttonDown = false;
    const point = this.#scenePoint(event);
    switch (gesture.kind) {
      case "pan":
        this.#gesture = { kind: "none" };
        this.#updateCursor();
        break;
      case "create":
        this.#finishCreateShape(gesture);
        break;
      case "linear":
        if (!gesture.moved) {
          this.#gesture = { kind: "multipoint", id: gesture.id };
          const el = this.store.get(gesture.id);
          if (el !== undefined)
            this.store.update(el.id, {
              points: [
                [0, 0],
                [0, 0],
              ],
            });
        } else {
          this.#finishLinear(gesture.id);
        }
        break;
      case "multipoint":
        break;
      case "freedraw":
        this.#finishFreedraw(gesture);
        break;
      case "move":
        this.#finishMove(gesture);
        break;
      case "resize":
      case "rotate":
        this.#gesture = { kind: "none" };
        this.#flushNow();
        this.store.beginStep();
        break;
      case "point":
        this.#finishPoint(gesture, point);
        break;
      case "marquee":
        this.#gesture = { kind: "none" };
        break;
      case "erase":
        this.#gesture = { kind: "none" };
        if (gesture.ids.size > 0) this.#deleteIds(gesture.ids);
        this.requestRender();
        break;
      case "laser":
        this.#gesture = { kind: "none" };
        break;
      default:
        this.#gesture = { kind: "none" };
    }
    this.#bindTarget = gesture.kind === "multipoint" ? this.#bindTarget : null;
    this.#activePoint = null;
    this.#publishPresence();
    this.requestRender(false);
    this.#emitChange();
  };
  #onPointerCancel = (event) => {
    this.#pointers.delete(event.pointerId);
    this.#cancelGesture();
  };
  #cancelGesture(discardCreation = false) {
    const gesture = this.#gesture;
    if (gesture.kind === "create" || gesture.kind === "linear") {
      const el = this.store.get(gesture.id);
      const tiny = el !== undefined && (!gesture.moved || Math.abs(el.width) + Math.abs(el.height) < 4);
      if (el !== undefined && (tiny || discardCreation)) this.store.remove([el.id]);
    }
    if (gesture.kind === "multipoint" && discardCreation) this.store.remove([gesture.id]);
    if (gesture.kind === "freedraw" || gesture.kind === "erase") this.requestRender();
    this.#gesture = { kind: "none" };
    this.#buttonDown = false;
    this.#bindTarget = null;
    this.#flushNow();
    this.store.beginStep();
    this.requestRender();
  }
  #startPinch() {
    // A second finger means the first one was navigating, not drawing.
    if (this.#gesture.kind !== "none" && this.#gesture.kind !== "pan") this.#cancelGesture(true);
    const [a, b] = [...this.#pointers.values()];
    const rect = this.#overlayCanvas.getBoundingClientRect();
    const center = { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top };
    this.#gesture = {
      kind: "pinch",
      distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      zoom: this.zoom,
      center,
      scene: this.screenToScene(center.x, center.y),
    };
  }
  #movePinch() {
    const gesture = this.#gesture;
    if (gesture.kind !== "pinch" || this.#pointers.size < 2) return;
    const [a, b] = [...this.#pointers.values()];
    const rect = this.#overlayCanvas.getBoundingClientRect();
    const center = { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top };
    const nextZoom = Math.max(
      MIN_ZOOM,
      Math.min(MAX_ZOOM, gesture.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / gesture.distance)),
    );
    this.zoom = nextZoom;
    this.scrollX = center.x / nextZoom - gesture.scene.x;
    this.scrollY = center.y / nextZoom - gesture.scene.y;
    this.#afterViewportChange();
  }
  #hover(point, screen) {
    if (this.tool !== "select" || this.#spaceDown) return;
    const handle = this.#handleAt(screen);
    if (handle !== null) {
      const frame = selectionFrame(this.selectedElements());
      this.#updateCursor(cursorForHandle(handle, frame?.angle ?? 0));
      return;
    }
    if (this.#pointHandleAt(screen) !== null) {
      this.#updateCursor("pointer");
      return;
    }
    const hit = this.elementAt(point);
    this.#updateCursor(hit !== null || this.#insideSelectionFrame(point) ? "move" : "default");
  }
  #updateCursor(override) {
    let cursor = override;
    if (cursor === undefined) {
      if (this.#spaceDown || this.tool === "hand") cursor = "grab";
      else if (this.tool === "text") cursor = "text";
      else if (this.tool === "select") cursor = "default";
      else if (this.tool === "eraser") cursor = "cell";
      else cursor = "crosshair";
    }
    this.#overlayCanvas.style.cursor = cursor;
  }
  /* ----------------------------------------------------------- selecting */
  #downSelect(point, screen, event) {
    const handle = this.#handleAt(screen);
    const selected = this.selectedElements();
    if (handle !== null) {
      this.store.beginStep();
      const frame = selectionFrame(selected);
      if (handle === "rotate") {
        const pivot = { x: frame.cx, y: frame.cy };
        this.#gesture = {
          kind: "rotate",
          pivot,
          startAngle: Math.atan2(point.y - pivot.y, point.x - pivot.x),
          originals: selected,
          baseAngle: frame.angle,
        };
      } else {
        // Drag relative to where the handle was grabbed, not the cursor tip,
        // so the box does not jump by the handle's padding.
        const [sx, sy] = handleSigns(handle);
        const corner = rotate(
          frame.cx + (sx * frame.width) / 2,
          frame.cy + (sy * frame.height) / 2,
          frame.cx,
          frame.cy,
          frame.angle,
        );
        this.#gesture = {
          kind: "resize",
          handle,
          frame,
          originals: selected,
          offset: { x: corner.x - point.x, y: corner.y - point.y },
        };
      }
      return;
    }
    const pointHandle = this.#pointHandleAt(screen);
    if (pointHandle !== null) {
      this.store.beginStep();
      let el = pointHandle.el;
      let index = pointHandle.index;
      if (pointHandle.mid) {
        const mids = midpoints(el.points);
        const points = el.points.slice();
        points.splice(index + 1, 0, mids[index]);
        el = this.store.update(el.id, { points }) ?? el;
        index += 1;
      }
      this.#activePoint = index;
      this.#gesture = { kind: "point", id: el.id, index, original: el };
      return;
    }
    const hit = this.elementAt(point);
    if (hit === null && !event.shiftKey && this.#insideSelectionFrame(point)) {
      this.#beginMove(point, event.altKey);
      return;
    }
    if (hit !== null) {
      const members = this.groupMembers(hit);
      if (event.shiftKey) {
        const next = new Set(this.selection);
        const allSelected = members.every((id) => next.has(id));
        for (const id of members) {
          if (allSelected) next.delete(id);
          else next.add(id);
        }
        this.setSelection(next);
        if (allSelected) return;
      } else if (!this.selection.has(hit.id)) {
        this.setSelection(members);
      }
      this.#beginMove(point, event.altKey);
      return;
    }
    const base = event.shiftKey ? new Set(this.selection) : new Set();
    if (!event.shiftKey) this.setSelection([]);
    this.#gesture = { kind: "marquee", start: point, current: point, additive: event.shiftKey, base };
  }
  #beginMove(point, duplicate) {
    this.store.beginStep();
    if (duplicate) {
      const clones = cloneForInsert(this.selectedElements(), this.store.topKey(), 0, 0);
      this.store.insert(clones);
      this.setSelection(clones.map((el) => el.id));
    }
    const originals = new Map(this.selectedElements().map((el) => [el.id, el]));
    const bounds = commonBounds(originals.values()) ?? { minX: point.x, minY: point.y, maxX: point.x, maxY: point.y };
    this.#gesture = { kind: "move", start: point, originals, bounds, moved: false };
  }
  #moveSelection(gesture, point) {
    let dx = point.x - gesture.start.x;
    let dy = point.y - gesture.start.y;
    if (!gesture.moved && Math.hypot(dx, dy) * this.zoom < 2) return;
    gesture.moved = true;
    if (this.grid) {
      dx = snapToGrid(gesture.bounds.minX + dx, GRID_SIZE) - gesture.bounds.minX;
      dy = snapToGrid(gesture.bounds.minY + dy, GRID_SIZE) - gesture.bounds.minY;
    }
    for (const [id, original] of gesture.originals) {
      this.store.update(id, { x: original.x + dx, y: original.y + dy });
    }
    this.#rerouteFor(new Set(gesture.originals.keys()));
    this.#scheduleLive();
  }
  #finishMove(gesture) {
    this.#gesture = { kind: "none" };
    if (gesture.moved) {
      // Arrows moved on their own detach from targets left behind.
      for (const id of gesture.originals.keys()) {
        const el = this.store.get(id);
        if (el === undefined || el.type !== "arrow") continue;
        const patch = {};
        if (el.startBind !== null && !gesture.originals.has(el.startBind.id)) patch.startBind = null;
        if (el.endBind !== null && !gesture.originals.has(el.endBind.id)) patch.endBind = null;
        if (Object.keys(patch).length > 0) this.store.update(id, patch);
      }
    }
    this.#flushNow();
    this.store.beginStep();
  }
  #updateMarquee(gesture) {
    const box = {
      minX: Math.min(gesture.start.x, gesture.current.x),
      minY: Math.min(gesture.start.y, gesture.current.y),
      maxX: Math.max(gesture.start.x, gesture.current.x),
      maxY: Math.max(gesture.start.y, gesture.current.y),
    };
    const next = new Set(gesture.base);
    for (const el of this.store.ordered()) {
      if (el.locked) continue;
      if (boxContains(box, elementBounds(el))) for (const id of this.groupMembers(el)) next.add(id);
    }
    this.setSelection(next);
    this.requestRender(false);
  }
  #resizeSelection(gesture, point, event) {
    const options = { keepAspect: event.shiftKey, fromCenter: event.altKey };
    const target = this.#snap({ x: point.x + gesture.offset.x, y: point.y + gesture.offset.y });
    if (gesture.originals.length === 1) {
      const original = gesture.originals[0];
      const patch = resizeElement(original, gesture.handle, target, options);
      const next = this.store.update(original.id, patch);
      if (next !== undefined) this.#refitLabels([next.id]);
    } else {
      for (const [id, patch] of resizeMany(gesture.originals, gesture.frame, gesture.handle, target, options)) {
        this.store.update(id, patch);
      }
    }
    this.#rerouteFor(new Set(gesture.originals.map((el) => el.id)));
    this.#scheduleLive();
  }
  #rotateSelection(gesture, point, snap) {
    let delta = Math.atan2(point.y - gesture.pivot.y, point.x - gesture.pivot.x) - gesture.startAngle;
    if (snap) {
      const step = Math.PI / 12;
      const target = Math.round((gesture.baseAngle + delta) / step) * step;
      delta = target - gesture.baseAngle;
    }
    for (const [id, patch] of rotateMany(gesture.originals, gesture.pivot, delta)) this.store.update(id, patch);
    this.#rerouteFor(new Set(gesture.originals.map((el) => el.id)));
    this.#scheduleLive();
  }
  /* -------------------------------------------------------- point editing */
  #movePoint(gesture, point, snap) {
    const original = gesture.original;
    const target = this.#snap(point);
    let local = toLocal(original, target.x, target.y);
    const neighbor = original.points[gesture.index === 0 ? 1 : gesture.index - 1];
    if (snap && neighbor !== undefined) {
      const snapped = snapAngle(local.x - neighbor[0], local.y - neighbor[1]);
      local = { x: neighbor[0] + snapped.x, y: neighbor[1] + snapped.y };
    }
    const isEnd = gesture.index === 0 || gesture.index === original.points.length - 1;
    if (original.type === "arrow" && isEnd) {
      this.#bindTarget = bindTargetAt(this.store.ordered(), point, this.#tolerance, new Set([original.id]));
    }
    const points = original.points.map((p, index) => (index === gesture.index ? [local.x, local.y] : p));
    this.store.update(original.id, rebaseLinear(original, points));
    this.#scheduleLive();
    this.requestRender(false);
  }
  #finishPoint(gesture, point) {
    this.#gesture = { kind: "none" };
    const el = this.store.get(gesture.id);
    if (el !== undefined && el.type === "arrow") {
      const atStart = gesture.index === 0;
      const atEnd = gesture.index === el.points.length - 1;
      if (atStart || atEnd) {
        const target = bindTargetAt(this.store.ordered(), point, this.#tolerance, new Set([el.id]));
        const bind = target === null ? null : { id: target.id };
        const updated = this.store.update(el.id, atStart ? { startBind: bind } : { endBind: bind });
        if (updated !== undefined) this.#reroute(updated);
      }
    }
    this.#flushNow();
    this.store.beginStep();
  }
  /* ----------------------------------------------------------- creating */
  #downCreateShape(type, point) {
    this.store.beginStep();
    const start = this.#snap(point);
    const el = createElement(type, { x: start.x, y: start.y, z: this.store.nextKey() }, this.style);
    if (!this.store.insert([el])) return;
    this.#gesture = { kind: "create", id: el.id, start, moved: false };
  }
  #moveCreateShape(gesture, point, event) {
    const target = this.#snap(point);
    let width = target.x - gesture.start.x;
    let height = target.y - gesture.start.y;
    if (event.shiftKey) {
      const size = Math.max(Math.abs(width), Math.abs(height));
      width = Math.sign(width || 1) * size;
      height = Math.sign(height || 1) * size;
    }
    let x = width < 0 ? gesture.start.x + width : gesture.start.x;
    let y = height < 0 ? gesture.start.y + height : gesture.start.y;
    width = Math.abs(width);
    height = Math.abs(height);
    if (event.altKey) {
      x = gesture.start.x - width;
      y = gesture.start.y - height;
      width *= 2;
      height *= 2;
    }
    if (width * this.zoom > 2 || height * this.zoom > 2) gesture.moved = true;
    this.store.update(gesture.id, { x, y, width, height });
    this.#scheduleLive();
  }
  #finishCreateShape(gesture) {
    this.#gesture = { kind: "none" };
    const el = this.store.get(gesture.id);
    if (el === undefined) return;
    if (!gesture.moved || (el.width < 2 && el.height < 2)) {
      this.store.remove([el.id]);
      this.#flushNow();
      this.store.beginStep();
      return;
    }
    this.#flushNow();
    this.store.beginStep();
    this.#afterCreate(el.id);
  }
  #afterCreate(id) {
    if (!this.toolLocked) {
      this.tool = "select";
      this.#updateCursor();
    }
    this.setSelection(this.toolLocked ? [] : [id]);
    this.#emitChange();
  }
  #downLinear(type, point, event) {
    if (this.#gesture.kind === "multipoint") {
      this.#addMultipoint(point, event);
      return;
    }
    this.store.beginStep();
    const start = this.#snap(point);
    const startTarget = type === "arrow" ? bindTargetAt(this.store.ordered(), point, this.#tolerance, new Set()) : null;
    const el = createElement(
      type,
      {
        x: start.x,
        y: start.y,
        z: this.store.nextKey(),
        points: [
          [0, 0],
          [0, 0],
        ],
        startBind: startTarget === null ? null : { id: startTarget.id },
      },
      this.style,
    );
    if (!this.store.insert([el])) return;
    this.#gesture = { kind: "linear", id: el.id, start, moved: false };
  }
  /** Moves the last (floating) point of the linear element being drawn. */
  #moveLinear(id, point, snap) {
    const el = this.store.get(id);
    if (el === undefined || el.points.length < 2) return;
    const target = this.#snap(point);
    const anchor = el.points[el.points.length - 2];
    let local = { x: target.x - el.x, y: target.y - el.y };
    if (snap) {
      const snapped = snapAngle(local.x - anchor[0], local.y - anchor[1]);
      local = { x: anchor[0] + snapped.x, y: anchor[1] + snapped.y };
    }
    const points = [...el.points.slice(0, -1), [local.x, local.y]];
    this.store.update(id, { points });
    if (el.type === "arrow") {
      this.#bindTarget = bindTargetAt(this.store.ordered(), point, this.#tolerance, new Set([id]));
    }
    this.#scheduleLive();
    this.requestRender(false);
  }
  #addMultipoint(point, event) {
    const gesture = this.#gesture;
    if (gesture.kind !== "multipoint") return;
    const el = this.store.get(gesture.id);
    if (el === undefined) {
      this.#gesture = { kind: "none" };
      return;
    }
    this.#moveLinear(el.id, point, event.shiftKey);
    const current = this.store.get(el.id);
    const first = current.points[0];
    const last = current.points[current.points.length - 1];
    if (current.points.length >= 4 && distance(first[0], first[1], last[0], last[1]) * this.zoom < 10) {
      // Clicking the first point closes the shape.
      const closed = [...current.points.slice(0, -1), first];
      this.store.update(el.id, { points: closed });
      this.#finishLinear(el.id);
      return;
    }
    this.store.update(el.id, { points: [...current.points, last] });
  }
  #finishMultipoint() {
    const gesture = this.#gesture;
    if (gesture.kind !== "multipoint") return;
    const el = this.store.get(gesture.id);
    if (el !== undefined && el.points.length > 2) {
      this.store.update(el.id, { points: el.points.slice(0, -1) });
    }
    this.#finishLinear(gesture.id);
  }
  #finishLinear(id) {
    this.#gesture = { kind: "none" };
    this.#bindTarget = null;
    const el = this.store.get(id);
    if (el === undefined) return;
    const path = linearPath(el);
    let length = 0;
    for (let index = 1; index < path.length; index += 1) {
      const a = path[index - 1];
      const b = path[index];
      length += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    if (el.points.length < 2 || length * this.zoom < 4) {
      this.store.remove([id]);
      this.#flushNow();
      this.store.beginStep();
      return;
    }
    const normalized = normalizePoints(el.x, el.y, el.points);
    let next = this.store.update(id, normalized) ?? el;
    if (next.type === "arrow") {
      const lastPoint = next.points[next.points.length - 1];
      const world = toWorld(next, lastPoint[0], lastPoint[1]);
      const endTarget = bindTargetAt(this.store.ordered(), world, this.#tolerance, new Set([id]));
      const startId = next.startBind?.id;
      next =
        this.store.update(id, {
          endBind: endTarget === null || endTarget.id === startId ? null : { id: endTarget.id },
        }) ?? next;
      this.#reroute(next);
    }
    this.#flushNow();
    this.store.beginStep();
    this.#afterCreate(id);
  }
  #downFreedraw(point, event) {
    const draft = createElement(
      "freedraw",
      {
        x: point.x,
        y: point.y,
        z: "a0",
        points: [[0, 0]],
        pressures: event.pointerType === "pen" ? [event.pressure] : [],
      },
      this.style,
    );
    this.#gesture = {
      kind: "freedraw",
      draft,
      origin: point,
      points: [[0, 0]],
      pressures: event.pointerType === "pen" ? [event.pressure] : [],
    };
    this.requestRender();
  }
  #finishFreedraw(gesture) {
    this.#gesture = { kind: "none" };
    const raw = gesture.points.length === 1 ? [gesture.points[0], gesture.points[0]] : gesture.points;
    const pressures = gesture.pressures.length === raw.length ? gesture.pressures : [];
    // Fewer points keep the shared room state small; the ink outline smooths the rest.
    const simple = simplifyStroke(raw, pressures, 0.4 / Math.max(0.5, this.zoom));
    const points = simple.points.slice(0, MAX_POINTS);
    const normalized = normalizePoints(gesture.origin.x, gesture.origin.y, points);
    const el = {
      ...gesture.draft,
      ...normalized,
      pressures: simple.pressures.length === points.length ? simple.pressures : [],
      z: this.store.nextKey(),
      updated: Date.now(),
    };
    this.store.step(() => this.store.insert([el]));
    this.#endLive();
    this.requestRender();
  }
  /* ---------------------------------------------------------------- text */
  #downText(point) {
    const hit = this.elementAt(point);
    if (hit !== null && (hit.type === "text" || canHoldLabel(hit))) {
      this.startEditing(hit.id);
      return;
    }
    this.#createTextAt(point);
  }
  #createTextAt(point) {
    this.store.beginStep();
    const lineHeight = this.style.fontSize * LINE_HEIGHT;
    const el = createElement(
      "text",
      { x: point.x, y: point.y - lineHeight / 2, z: this.store.nextKey(), width: 4, height: lineHeight },
      this.style,
    );
    if (!this.store.insert([el])) return;
    this.#flushNow();
    this.startEditing(el.id, true);
  }
  startEditing(id, keepStep = false) {
    const el = this.store.get(id);
    if (el === undefined || el.locked) return;
    if (!keepStep) this.store.beginStep();
    this.editingId = id;
    this.setSelection([id]);
    this.#host?.openTextEditor(el);
    this.requestRender();
    this.#emitChange();
  }
  /** Live text update from the text editor (not yet a sealed undo step). */
  updateEditingText(text) {
    if (this.editingId === null) return;
    const el = this.store.get(this.editingId);
    if (el === undefined) return;
    const next = { ...el, text };
    const patch = { text };
    if (el.type === "text") Object.assign(patch, this.#textBox(next));
    this.store.update(el.id, patch);
    if (canHoldLabel(el)) this.#refitLabels([el.id]);
    this.#rerouteFor(new Set([el.id]));
    this.#scheduleLive();
  }
  finishEditing() {
    const id = this.editingId;
    if (id === null) return;
    this.editingId = null;
    const el = this.store.get(id);
    if (el !== undefined && el.type === "text" && el.text.trim().length === 0) {
      this.#deleteIds(new Set([id]), false);
    }
    this.#flushNow();
    this.store.beginStep();
    if (!this.toolLocked && this.tool === "text") this.tool = "select";
    this.#updateCursor();
    this.requestRender();
    this.#emitChange();
  }
  /** Width/height (and x for centred/right text) of a text element. */
  #textBox(el) {
    const metrics = measureText(el.text.length === 0 ? " " : el.text, el.fontFamily, el.fontSize);
    let x = el.x;
    if (el.textAlign === "center") x = el.x + (el.width - metrics.width) / 2;
    else if (el.textAlign === "right") x = el.x + el.width - metrics.width;
    return { x, width: metrics.width, height: metrics.height };
  }
  /** Grow containers whose label no longer fits. */
  #refitLabels(ids) {
    for (const id of ids) {
      const el = this.store.get(id);
      if (el === undefined || !canHoldLabel(el)) continue;
      const height = requiredContainerHeight(el);
      if (height !== null) {
        const centerY = el.y + el.height / 2;
        this.store.update(id, { height, y: centerY - height / 2 });
      }
    }
  }
  /** After fonts load the first measurement may have used a fallback font. */
  #refitTextElements() {
    // Housekeeping, not a user edit: keep it out of the undo history.
    this.store.untracked(() => this.#refitTexts());
  }
  #refitTexts() {
    for (const el of this.store.ordered()) {
      if (el.type !== "text") continue;
      const box = this.#textBox({ ...el, x: el.x });
      if (Math.abs((box.width ?? el.width) - el.width) > 1 || Math.abs((box.height ?? el.height) - el.height) > 1) {
        this.store.update(el.id, { width: box.width, height: box.height, x: el.textAlign === "left" ? el.x : box.x });
      }
    }
    if (this.#gesture.kind === "none") this.store.flush();
  }
  /* -------------------------------------------------------------- erasing */
  #eraseAlong(from, to) {
    const gesture = this.#gesture;
    if (gesture.kind !== "erase") return;
    const steps = Math.max(1, Math.ceil((distance(from.x, from.y, to.x, to.y) * this.zoom) / 4));
    const tolerance = 6 / this.zoom;
    const ordered = this.store.ordered();
    let changed = false;
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      const x = from.x + (to.x - from.x) * t;
      const y = from.y + (to.y - from.y) * t;
      for (let index = ordered.length - 1; index >= 0; index -= 1) {
        const el = ordered[index];
        if (el.locked || gesture.ids.has(el.id)) continue;
        if (hitElement(el, x, y, tolerance)) {
          for (const id of this.groupMembers(el)) gesture.ids.add(id);
          changed = true;
        }
      }
    }
    this.#eraserTrail.push({ ...to, t: performance.now() });
    if (this.#eraserTrail.length > 40) this.#eraserTrail.shift();
    this.requestRender(changed);
  }
  /* -------------------------------------------------------- double click */
  #onDoubleClick(point, screen) {
    if (this.#gesture.kind === "multipoint") {
      this.#finishMultipoint();
      return true;
    }
    if (this.tool !== "select") return false;
    const pointHandle = this.#pointHandleAt(screen);
    if (pointHandle !== null && !pointHandle.mid && pointHandle.el.points.length > 2) {
      const el = pointHandle.el;
      const points = el.points.filter((_, index) => index !== pointHandle.index);
      this.store.step(() => {
        const updated = this.store.update(el.id, rebaseLinear(el, points));
        if (updated !== undefined) this.#reroute(updated);
      });
      return true;
    }
    const hit = this.elementAt(point);
    if (hit === null) {
      this.#createTextAt(point);
      return true;
    }
    if (hit.type === "text" || canHoldLabel(hit)) {
      this.startEditing(hit.id);
      return true;
    }
    if (isLinear(hit)) {
      // Insert a point on the nearest segment.
      const local = toLocal(hit, point.x, point.y);
      let bestIndex = 0;
      let bestDistance = Infinity;
      for (let index = 0; index < hit.points.length - 1; index += 1) {
        const d = distanceToPolyline(local.x, local.y, [hit.points[index], hit.points[index + 1]]);
        if (d < bestDistance) {
          bestDistance = d;
          bestIndex = index;
        }
      }
      const points = hit.points.slice();
      points.splice(bestIndex + 1, 0, [local.x, local.y]);
      this.store.step(() => this.store.update(hit.id, rebaseLinear(hit, points)));
      this.setSelection([hit.id]);
      return true;
    }
    return false;
  }
  /* ------------------------------------------------------------ bindings */
  #reroute(arrow) {
    const patch = routeArrow(arrow, (id) => this.store.get(id));
    if (patch !== null) this.store.update(arrow.id, patch);
  }
  /** Re-route arrows bound to any of `ids` (and arrows in `ids` themselves). */
  #rerouteFor(ids) {
    for (const el of this.store.ordered()) {
      if (el.type !== "arrow") continue;
      const startHit = el.startBind !== null && ids.has(el.startBind.id);
      const endHit = el.endBind !== null && ids.has(el.endBind.id);
      if (!startHit && !endHit) continue;
      if (ids.has(el.id)) {
        // Moving together with its targets: only re-route if a target is outside the set.
        const startInside = el.startBind === null || ids.has(el.startBind.id);
        const endInside = el.endBind === null || ids.has(el.endBind.id);
        if (startInside && endInside) continue;
      }
      this.#reroute(el);
    }
  }
  /* =============================================================== keyboard */
  #onKeyDown = (event) => {
    if (isTypingTarget(event.target)) return;
    if (document.querySelector("dialog[open]") !== null) return;
    if (event.target instanceof HTMLElement && event.target !== this.#overlayCanvas) {
      // Menus handle their own keys; buttons keep Enter/Space/arrows for activation.
      if (event.target.closest('[role="menu"]') !== null) return;
      const control = event.target.closest('button, a[href], [role="radio"], [role="menuitem"], input, select');
      if (control !== null && /^(Enter| |Spacebar|Arrow\w+)$/.test(event.key)) return;
    }
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (event.code === "Space" && !mod) {
      if (!this.#spaceDown) {
        this.#spaceDown = true;
        this.#updateCursor("grab");
      }
      event.preventDefault();
      return;
    }
    if (mod) {
      const handled = this.#modShortcut(event, key);
      if (handled) event.preventDefault();
      return;
    }
    if (event.altKey && event.shiftKey && event.code === "KeyD") {
      this.setTheme(this.theme === "dark" ? "light" : "dark");
      event.preventDefault();
      return;
    }
    if (event.shiftKey && (event.code === "Digit1" || event.code === "Digit2")) {
      this.zoomToFit(event.code === "Digit2", event.code === "Digit2" ? Infinity : 1);
      event.preventDefault();
      return;
    }
    switch (event.key) {
      case "Escape":
        if (this.#gesture.kind === "multipoint") this.#finishMultipoint();
        else if (this.#gesture.kind !== "none") this.#cancelGesture();
        else if (this.selection.size > 0) this.setSelection([]);
        else if (this.tool !== "select") this.setTool("select");
        event.preventDefault();
        return;
      case "Enter":
        if (this.#gesture.kind === "multipoint") {
          this.#finishMultipoint();
        } else if (this.selection.size === 1) {
          const el = this.selectedElements()[0];
          if (el.type === "text" || canHoldLabel(el)) this.startEditing(el.id);
        }
        event.preventDefault();
        return;
      case "Delete":
      case "Backspace":
        this.deleteSelection();
        event.preventDefault();
        return;
      case "ArrowLeft":
      case "ArrowRight":
      case "ArrowUp":
      case "ArrowDown": {
        if (this.selection.size === 0) return;
        const step = event.shiftKey ? (this.grid ? GRID_SIZE : 10) : 1;
        const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
        const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
        this.nudge(dx, dy);
        event.preventDefault();
        return;
      }
      case "?":
        this.#host?.help();
        event.preventDefault();
        return;
    }
    if (event.altKey || event.shiftKey) return;
    const toolByKey = {
      v: "select",
      1: "select",
      h: "hand",
      r: "rectangle",
      2: "rectangle",
      d: "diamond",
      3: "diamond",
      o: "ellipse",
      4: "ellipse",
      a: "arrow",
      5: "arrow",
      l: "line",
      6: "line",
      p: "freedraw",
      7: "freedraw",
      t: "text",
      8: "text",
      9: "image",
      e: "eraser",
      0: "eraser",
      k: "laser",
    };
    const tool = toolByKey[key];
    if (tool !== undefined) {
      if (tool === "image") this.#host?.pickImage(this.#viewCenter());
      else this.setTool(tool);
      event.preventDefault();
      return;
    }
    if (key === "q") {
      this.toggleToolLock();
      event.preventDefault();
    } else if (key === "g") {
      this.setGrid(!this.grid);
      event.preventDefault();
    }
  };
  #modShortcut(event, key) {
    switch (event.code) {
      case "KeyZ":
        if (event.shiftKey) this.redo();
        else this.undo();
        return true;
      case "KeyY":
        this.redo();
        return true;
      case "KeyA":
        this.selectAll();
        return true;
      case "KeyD":
        this.duplicateSelection();
        return true;
      case "KeyG":
        if (event.shiftKey) this.ungroupSelection();
        else this.groupSelection();
        return true;
      case "KeyL":
        if (event.shiftKey) {
          this.toggleLockSelection();
          return true;
        }
        return false;
      case "BracketRight":
        this.reorder(event.shiftKey ? "front" : "forward");
        return true;
      case "BracketLeft":
        this.reorder(event.shiftKey ? "back" : "backward");
        return true;
      case "Quote":
        this.setGrid(!this.grid);
        return true;
      case "Digit0":
      case "Numpad0":
        this.resetZoom();
        return true;
      case "Equal":
      case "NumpadAdd":
        this.zoomBy(1.2);
        return true;
      case "Minus":
      case "NumpadSubtract":
        this.zoomBy(1 / 1.2);
        return true;
      case "KeyS":
        this.#host?.saveFile();
        return true;
      case "KeyO":
        this.#host?.openFile();
        return true;
      case "KeyE":
        if (event.shiftKey) {
          this.#host?.exportDialog();
          return true;
        }
        return false;
    }
    if (key === "/") {
      this.#host?.help();
      return true;
    }
    return false;
  }
  #viewCenter() {
    return this.screenToScene(this.width / 2, this.height / 2);
  }
  /* ================================================================ actions */
  undo() {
    if (this.#gesture.kind !== "none") this.#cancelGesture();
    if (this.editingId !== null) this.#host?.closeTextEditor();
    if (!this.store.undoStep()) return;
    this.setSelection([...this.selection].filter((id) => this.store.has(id)));
    this.requestRender();
    this.#emitChange();
  }
  redo() {
    if (this.#gesture.kind !== "none") this.#cancelGesture();
    if (!this.store.redoStep()) return;
    this.requestRender();
    this.#emitChange();
  }
  selectAll() {
    this.setTool("select");
    this.setSelection(
      this.store
        .ordered()
        .filter((el) => !el.locked)
        .map((el) => el.id),
    );
  }
  deleteSelection() {
    if (this.selection.size === 0) return;
    const ids = new Set(
      this.selectedElements()
        .filter((el) => !el.locked)
        .map((el) => el.id),
    );
    this.#deleteIds(ids);
  }
  #deleteIds(ids, ownStep = true) {
    const work = () => {
      // Detach arrows that pointed at removed elements.
      for (const el of this.store.ordered()) {
        if (el.type !== "arrow" || ids.has(el.id)) continue;
        const patch = {};
        if (el.startBind !== null && ids.has(el.startBind.id)) patch.startBind = null;
        if (el.endBind !== null && ids.has(el.endBind.id)) patch.endBind = null;
        if (Object.keys(patch).length > 0) this.store.update(el.id, patch);
      }
      this.store.remove(ids);
    };
    if (ownStep) this.store.step(work);
    else work();
    this.setSelection([...this.selection].filter((id) => !ids.has(id)));
    this.renderer.prune();
  }
  nudge(dx, dy) {
    const selected = this.selectedElements().filter((el) => !el.locked);
    if (selected.length === 0) return;
    this.store.step(() => {
      for (const el of selected) this.store.update(el.id, { x: el.x + dx, y: el.y + dy });
      this.#rerouteFor(new Set(selected.map((el) => el.id)));
    });
  }
  duplicateSelection() {
    const selected = this.selectedElements();
    if (selected.length === 0) return;
    const offset = 16;
    const clones = cloneForInsert(selected, this.store.topKey(), offset, offset);
    this.store.step(() => this.store.insert(clones));
    this.setSelection(clones.map((el) => el.id));
  }
  groupSelection() {
    const selected = this.selectedElements();
    if (selected.length < 2) return;
    const group = newId();
    this.store.step(() => {
      for (const el of selected) this.store.update(el.id, { groupIds: [...el.groupIds, group] });
    });
    this.#emitChange();
  }
  ungroupSelection() {
    const selected = this.selectedElements();
    const groups = new Set(selected.map(outermostGroup).filter((group) => group !== null));
    if (groups.size === 0) return;
    this.store.step(() => {
      for (const el of selected) {
        const group = outermostGroup(el);
        if (group !== null && groups.has(group)) this.store.update(el.id, { groupIds: el.groupIds.slice(0, -1) });
      }
    });
    this.#emitChange();
  }
  get selectionHasGroup() {
    return this.selectedElements().some((el) => el.groupIds.length > 0);
  }
  toggleLockSelection() {
    const selected = this.selectedElements();
    if (selected.length === 0) return;
    const lock = !selected.every((el) => el.locked);
    this.store.step(() => {
      for (const el of selected) this.store.update(el.id, { locked: lock });
    });
    if (lock) this.setSelection([]);
    this.#emitChange();
  }
  unlockAll() {
    const locked = this.store.ordered().filter((el) => el.locked);
    if (locked.length === 0) return;
    this.store.step(() => {
      for (const el of locked) this.store.update(el.id, { locked: false });
    });
    this.setSelection(locked.map((el) => el.id));
  }
  get hasLocked() {
    return this.store.ordered().some((el) => el.locked);
  }
  reorder(kind) {
    const ordered = this.store.ordered();
    const selected = ordered.filter((el) => this.selection.has(el.id));
    if (selected.length === 0) return;
    const others = ordered.filter((el) => !this.selection.has(el.id));
    let below = null;
    let above = null;
    if (kind === "front") {
      below = others.length === 0 ? null : others[others.length - 1].z;
    } else if (kind === "back") {
      above = others.length === 0 ? null : others[0].z;
    } else if (kind === "forward") {
      const top = selected[selected.length - 1];
      const next = others.find((el) => compareOrder(el, top) > 0);
      if (next === undefined) return;
      below = next.z;
      const afterNext = others.find((el) => compareOrder(el, next) > 0);
      above = afterNext?.z ?? null;
    } else {
      const bottom = selected[0];
      const previous = [...others].reverse().find((el) => compareOrder(el, bottom) < 0);
      if (previous === undefined) return;
      above = previous.z;
      const beforePrevious = [...others].reverse().find((el) => compareOrder(el, previous) < 0);
      below = beforePrevious?.z ?? null;
    }
    if (below !== null && above !== null && below >= above) {
      // Equal keys from concurrent inserts: open a gap just above `below`.
      above = keyBetween(below, null);
    }
    const keys = keysBetween(below, above, selected.length);
    this.store.step(() => selected.forEach((el, index) => this.store.update(el.id, { z: keys[index] })));
    this.requestRender();
  }
  align(kind) {
    const selected = this.selectedElements();
    const units = this.#selectionUnits(selected);
    if (units.length < 2) return;
    const box = commonBounds(selected);
    if (box === null) return;
    this.store.step(() => {
      for (const unit of units) {
        const bounds = commonBounds(unit);
        let dx = 0;
        let dy = 0;
        if (kind === "left") dx = box.minX - bounds.minX;
        if (kind === "right") dx = box.maxX - bounds.maxX;
        if (kind === "hcenter") dx = (box.minX + box.maxX) / 2 - (bounds.minX + bounds.maxX) / 2;
        if (kind === "top") dy = box.minY - bounds.minY;
        if (kind === "bottom") dy = box.maxY - bounds.maxY;
        if (kind === "vcenter") dy = (box.minY + box.maxY) / 2 - (bounds.minY + bounds.maxY) / 2;
        for (const el of unit) this.store.update(el.id, { x: el.x + dx, y: el.y + dy });
      }
      this.#rerouteFor(new Set(selected.map((el) => el.id)));
    });
  }
  distribute(axis) {
    const selected = this.selectedElements();
    const units = this.#selectionUnits(selected).map((unit) => ({ unit, bounds: commonBounds(unit) }));
    if (units.length < 3) return;
    units.sort((a, b) => (axis === "x" ? a.bounds.minX - b.bounds.minX : a.bounds.minY - b.bounds.minY));
    const first = units[0];
    const last = units[units.length - 1];
    const span = axis === "x" ? last.bounds.maxX - first.bounds.minX : last.bounds.maxY - first.bounds.minY;
    const occupied = units.reduce(
      (sum, item) => sum + (axis === "x" ? item.bounds.maxX - item.bounds.minX : item.bounds.maxY - item.bounds.minY),
      0,
    );
    const gap = (span - occupied) / (units.length - 1);
    let cursor = axis === "x" ? first.bounds.minX : first.bounds.minY;
    this.store.step(() => {
      for (const item of units) {
        const start = axis === "x" ? item.bounds.minX : item.bounds.minY;
        const delta = cursor - start;
        for (const el of item.unit) {
          this.store.update(el.id, axis === "x" ? { x: el.x + delta } : { y: el.y + delta });
        }
        cursor += (axis === "x" ? item.bounds.maxX - item.bounds.minX : item.bounds.maxY - item.bounds.minY) + gap;
      }
      this.#rerouteFor(new Set(selected.map((el) => el.id)));
    });
  }
  /** Groups count as one unit when aligning/distributing. */
  #selectionUnits(selected) {
    const units = new Map();
    for (const el of selected) {
      const key = outermostGroup(el) ?? `el:${el.id}`;
      const unit = units.get(key) ?? [];
      unit.push(el);
      units.set(key, unit);
    }
    return [...units.values()];
  }
  /* --------------------------------------------------------- clipboard */
  copySelection() {
    const selected = this.selectedElements();
    if (selected.length === 0) return null;
    const text = serializeClipboard(selected, (id) => this.store.file(id));
    this.#clipboard = text;
    this.#pasteCount = 0;
    return text;
  }
  get hasClipboard() {
    return this.#clipboard !== null;
  }
  pasteInternal(at) {
    if (this.#clipboard === null) return;
    const payload = parseClipboard(this.#clipboard);
    if (payload !== null) this.pastePayload(payload, at);
  }
  pastePayload(payload, at) {
    if (payload.elements.length === 0) return;
    for (const [id, data] of Object.entries(payload.files)) this.store.addFile(id, data);
    const box = commonBounds(payload.elements);
    if (box === null) return;
    let dx;
    let dy;
    if (at !== undefined) {
      dx = at.x - (box.minX + box.maxX) / 2;
      dy = at.y - (box.minY + box.maxY) / 2;
    } else {
      this.#pasteCount += 1;
      dx = this.#pasteCount * 16;
      dy = this.#pasteCount * 16;
    }
    if (this.grid) {
      dx = snapToGrid(box.minX + dx, GRID_SIZE) - box.minX;
      dy = snapToGrid(box.minY + dy, GRID_SIZE) - box.minY;
    }
    const clones = cloneForInsert(payload.elements, this.store.topKey(), dx, dy);
    this.store.step(() => this.store.insert(clones));
    this.setTool("select");
    this.setSelection(clones.map((el) => el.id));
  }
  #onCopy = (event, cut) => {
    if (isTypingTarget(event.target) || this.editingId !== null) return;
    const text = this.copySelection();
    if (text === null) return;
    event.clipboardData?.setData("text/plain", text);
    event.preventDefault();
    if (cut) this.deleteSelection();
  };
  #onPaste = (event) => {
    if (isTypingTarget(event.target) || this.editingId !== null) return;
    const data = event.clipboardData;
    if (data === null) return;
    event.preventDefault();
    const at = this.#lastPointer ?? this.#viewCenter();
    const files = [...data.files].filter((file) => file.type.startsWith("image/"));
    if (files.length > 0) {
      void this.#insertFiles(files, at);
      return;
    }
    const text = data.getData("text/plain");
    if (text.length === 0) return;
    const payload = parseClipboard(text);
    if (payload !== null) {
      this.pastePayload(payload, at);
      return;
    }
    this.insertText(text.slice(0, 20_000), at);
  };
  insertText(text, at) {
    const base = createElement("text", { x: at.x, y: at.y, z: this.store.nextKey(), text }, this.style);
    const el = { ...base, ...this.#textBox(base) };
    const centered = { ...el, x: at.x - el.width / 2, y: at.y - el.height / 2 };
    this.store.step(() => this.store.insert([centered]));
    this.setTool("select");
    this.setSelection([centered.id]);
  }
  /* ------------------------------------------------------------- images */
  async #insertFiles(files, at) {
    let offset = 0;
    for (const file of files) {
      if (/\.(whiteboard|kreska|json)$/i.test(file.name) || file.type === "application/json") {
        this.#host?.importFile(file);
        continue;
      }
      if (!file.type.startsWith("image/")) continue;
      await this.insertImage(file, { x: at.x + offset, y: at.y + offset });
      offset += 24;
    }
  }
  async insertImage(file, at) {
    try {
      const prepared = await prepareImage(file);
      const fileId = newId();
      this.store.addFile(fileId, prepared.dataUrl);
      const maxSide = 520 / this.zoom;
      const scale = Math.min(1, maxSide / Math.max(prepared.width, prepared.height));
      const width = prepared.width * scale;
      const height = prepared.height * scale;
      const el = createElement(
        "image",
        { x: at.x - width / 2, y: at.y - height / 2, width, height, fileId, z: this.store.nextKey() },
        this.style,
      );
      this.store.step(() => this.store.insert([{ ...el, fillColor: "transparent", opacity: 100 }]));
      if (!this.toolLocked) this.setTool("select");
      this.setSelection([el.id]);
    } catch (error) {
      console.error("Nie udało się wstawić obrazu.", error);
      this.#host?.toast(error instanceof Error ? error.message : t("Nie udało się wstawić obrazu."));
    }
  }
  /* -------------------------------------------------------- whole board */
  clearBoard() {
    const ids = new Set(this.store.ordered().map((el) => el.id));
    if (ids.size === 0) return;
    this.store.step(() => this.store.remove(ids));
    this.setSelection([]);
    this.renderer.prune();
  }
  importBoard(payload, replace) {
    for (const [id, data] of Object.entries(payload.files)) this.store.addFile(id, data);
    const clones = cloneForInsert(payload.elements, replace ? null : this.store.topKey(), 0, 0);
    // cloneForInsert remaps ids; keep bindings and groups consistent inside the import.
    this.store.step(() => {
      if (replace) this.store.remove(this.store.ordered().map((el) => el.id));
      this.store.insert(clones);
    });
    this.setSelection([]);
    this.zoomToFit(false, 1);
  }
  /** Rotation-aware centre helper used by the UI for menus. */
  selectionScreenBox() {
    const box = commonBounds(this.selectedElements());
    if (box === null) return null;
    const a = this.sceneToScreen(box.minX, box.minY);
    const b = this.sceneToScreen(box.maxX, box.maxY);
    return { minX: a.x, minY: a.y, maxX: b.x, maxY: b.y };
  }
  /** Scene → screen transform for a point in an element's local frame. */
  elementScreenPoint(el, lx, ly) {
    const world = toWorld(el, lx, ly);
    return this.sceneToScreen(world.x, world.y);
  }
  get frameRotateHandle() {
    const frame = selectionFrame(this.selectedElements());
    if (frame === null) return null;
    return framePoint(frame, 0, -1, this.zoom);
  }
  isEmpty() {
    return this.store.size === 0;
  }
  centerOfElement(el) {
    return centerOf(el);
  }
  rotatePoint(point, pivot, angle) {
    return rotate(point.x, point.y, pivot.x, pivot.y, angle);
  }
  isBindable(el) {
    return isBindable(el);
  }
}
/* ------------------------------------------------------------------ images */
const MAX_IMAGE_SIDE = 1600;
/** Images travel between people in chunks (collab/files.js), so keep them small. */
const MAX_IMAGE_BYTES = 1_400_000;
const loadBitmap = async (file) => {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      return { source: bitmap, width: bitmap.width, height: bitmap.height };
    } catch {
      // Fall back to <img> (e.g. SVG in some browsers).
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return { source: image, width: image.naturalWidth || 300, height: image.naturalHeight || 150 };
  } finally {
    URL.revokeObjectURL(url);
  }
};
/** Downscale and re-encode an image so boards stay well under the document cap. */
export const prepareImage = async (file) => {
  if (file.size > 40_000_000) throw new Error(t("Obraz jest za duży (maks. 40 MB)."));
  const bitmap = await loadBitmap(file);
  let side = MAX_IMAGE_SIDE;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (ctx === null) throw new Error(t("Przeglądarka nie obsługuje Canvas 2D."));
    ctx.drawImage(bitmap.source, 0, 0, width, height);
    let dataUrl = canvas.toDataURL("image/webp", attempt === 0 ? 0.86 : 0.78);
    if (!dataUrl.startsWith("data:image/webp")) dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    if (dataUrl.length <= MAX_IMAGE_BYTES) return { dataUrl, width: bitmap.width, height: bitmap.height };
    side = Math.round(side * 0.7);
  }
  throw new Error(t("Nie udało się zmniejszyć obrazu poniżej 1,4 MB."));
};
