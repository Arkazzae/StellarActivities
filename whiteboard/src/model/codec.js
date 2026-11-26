import { isValidOrderKey } from "./order.js";

/**
 * Compact wire format for elements in the shared room state.
 *
 * The room state is one JSON object of at most 256 KiB, so every element is
 * stored under its own short key with short field names, defaults omitted and
 * points packed as quantised deltas. Decoding is canonical:
 * encode(decode(encode(el))) === encode(el), which lets the store compare
 * values by their encoded string.
 */

export const ELEMENT_PREFIX = "e";
export const META_KEY = "m";

export const DEFAULT_META = Object.freeze({ name: "", background: "#f7f4ec" });

const TYPES = { rectangle: "r", diamond: "d", ellipse: "e", line: "l", arrow: "a", freedraw: "f", text: "t", image: "i" };
const FILLS = { hachure: "h", cross: "c", solid: "s" };
const STROKES = { solid: "s", dashed: "d", dotted: "o" };
const FONTS = { hand: "h", sans: "s", mono: "m" };
const ALIGNS = { left: "l", center: "c", right: "r" };
const HEADS = { none: "n", arrow: "a", triangle: "t", dot: "d", bar: "b" };

const invert = (map) => Object.fromEntries(Object.entries(map).map(([name, code]) => [code, name]));
const TYPE_NAMES = invert(TYPES);
const FILL_NAMES = invert(FILLS);
const STROKE_NAMES = invert(STROKES);
const FONT_NAMES = invert(FONTS);
const ALIGN_NAMES = invert(ALIGNS);
const HEAD_NAMES = invert(HEADS);

export const MAX_POINTS = 6_000;
const MAX_TEXT = 8_000;
const INK = "#1f1d1a";

/* ------------------------------------------------------------- numbers */

const round = (value, decimals) => {
  const factor = 10 ** decimals;
  const rounded = Math.round(value * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
};

const num = (value, fallback, min = -1e7, max = 1e7) =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;

const colour = (value, fallback) =>
  typeof value === "string" && (/^#[0-9a-fA-F]{3,8}$/.test(value) || value === "transparent") ? value : fallback;

const shortId = (value) => (typeof value === "string" && /^[\w-]{1,32}$/.test(value) ? value : null);

/* ------------------------------------------------- varint base64 integers */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const DIGIT = new Map([...ALPHABET].map((char, index) => [char, index]));

/** Signed integers → zigzag varints, 5 data bits per base64url character. */
export const encodeInts = (values) => {
  let out = "";
  for (const value of values) {
    let zig = value >= 0 ? value * 2 : -value * 2 - 1;
    while (zig >= 32) {
      out += ALPHABET[32 | (zig % 32)];
      zig = Math.floor(zig / 32);
    }
    out += ALPHABET[zig];
  }
  return out;
};

export const decodeInts = (text) => {
  const values = [];
  let zig = 0;
  let scale = 1;
  for (const char of text) {
    const digit = DIGIT.get(char);
    if (digit === undefined) return null;
    zig += (digit & 31) * scale;
    if (digit & 32) {
      scale *= 32;
      if (scale > 2 ** 40) return null;
      continue;
    }
    values.push(zig % 2 === 0 ? zig / 2 : -(zig + 1) / 2);
    zig = 0;
    scale = 1;
  }
  return scale === 1 ? values : null;
};

/** Points relative to the element, quantised to 0.5 px and delta-encoded. */
export const encodePoints = (points) => {
  const ints = [];
  let previousX = 0;
  let previousY = 0;
  for (const [px, py] of points) {
    const qx = Math.round(px * 2);
    const qy = Math.round(py * 2);
    ints.push(qx - previousX, qy - previousY);
    previousX = qx;
    previousY = qy;
  }
  return encodeInts(ints);
};

export const decodePoints = (text) => {
  if (typeof text !== "string" || text.length === 0) return [];
  const ints = decodeInts(text);
  if (ints === null || ints.length % 2 !== 0) return [];
  const points = [];
  let x = 0;
  let y = 0;
  for (let index = 0; index < ints.length && points.length < MAX_POINTS; index += 2) {
    x += ints[index];
    y += ints[index + 1];
    points.push([x / 2, y / 2]);
  }
  return points;
};

export const encodePressures = (pressures) =>
  pressures.map((value) => ALPHABET[Math.max(0, Math.min(63, Math.round(value * 63)))]).join("");

export const decodePressures = (text) => {
  if (typeof text !== "string") return [];
  const out = [];
  for (const char of text.slice(0, MAX_POINTS)) {
    const digit = DIGIT.get(char);
    if (digit === undefined) return [];
    out.push(digit / 63);
  }
  return out;
};

/* --------------------------------------------------------------- elements */

/** Element → compact JSON-able record (defaults omitted). */
export const encodeElement = (el) => {
  const out = {
    t: TYPES[el.type],
    x: round(el.x, 2),
    y: round(el.y, 2),
    w: round(el.width, 2),
    h: round(el.height, 2),
    z: el.z,
    s: el.seed,
  };
  const angle = round(((el.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2), 4);
  if (angle !== 0 && angle !== round(Math.PI * 2, 4)) out.a = angle;
  if (el.strokeColor !== INK) out.c = el.strokeColor;
  if (el.fillColor !== "transparent") out.f = el.fillColor;
  if (el.fillStyle !== "hachure") out.fs = FILLS[el.fillStyle];
  if (el.strokeWidth !== 2) out.sw = round(el.strokeWidth, 2);
  if (el.strokeStyle !== "solid") out.ss = STROKES[el.strokeStyle];
  if (el.roughness !== 1) out.r = el.roughness;
  if (el.opacity !== 100) out.o = Math.round(el.opacity);
  if (el.rounded) out.rd = 1;
  if (el.groupIds.length > 0) out.g = el.groupIds.slice(0, 16);
  if (el.locked) out.lk = 1;
  if (el.text.length > 0) out.tx = el.text.slice(0, MAX_TEXT);
  if (el.fontFamily !== "hand") out.ff = FONTS[el.fontFamily];
  if (el.fontSize !== 24) out.fz = round(el.fontSize, 2);
  if (el.textAlign !== (el.type === "text" ? "left" : "center")) out.ta = ALIGNS[el.textAlign];
  if (el.points.length > 0) out.p = encodePoints(el.points.slice(0, MAX_POINTS));
  if (el.pressures.length > 0 && el.pressures.length === el.points.length) {
    out.pr = encodePressures(el.pressures.slice(0, MAX_POINTS));
  }
  if (el.startArrow !== "none") out.sa = HEADS[el.startArrow];
  if (el.endArrow !== "none") out.ea = HEADS[el.endArrow];
  if (el.startBind !== null) out.sb = el.startBind.id;
  if (el.endBind !== null) out.eb = el.endBind.id;
  if (el.fileId.length > 0) out.fi = el.fileId;
  return out;
};

/** Compact record (possibly from another client) → validated element, or null. */
export const decodeElement = (id, raw) => {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const type = TYPE_NAMES[raw.t];
  if (type === undefined || shortId(id) === null) return null;
  const points = decodePoints(raw.p);
  const pressures = decodePressures(raw.pr);
  return {
    id,
    type,
    x: num(raw.x, 0),
    y: num(raw.y, 0),
    width: num(raw.w, 0),
    height: num(raw.h, 0),
    angle: num(raw.a, 0, 0, 7),
    z: typeof raw.z === "string" && isValidOrderKey(raw.z) ? raw.z : "a0",
    seed: Math.floor(num(raw.s, 1, 0, 2 ** 31)),
    strokeColor: colour(raw.c, INK),
    fillColor: colour(raw.f, "transparent"),
    fillStyle: FILL_NAMES[raw.fs] ?? "hachure",
    strokeWidth: num(raw.sw, 2, 0.5, 32),
    strokeStyle: STROKE_NAMES[raw.ss] ?? "solid",
    roughness: raw.r === 0 || raw.r === 2 ? raw.r : 1,
    opacity: Math.round(num(raw.o, 100, 0, 100)),
    rounded: raw.rd === 1,
    groupIds: Array.isArray(raw.g) ? raw.g.map(shortId).filter((group) => group !== null).slice(0, 16) : [],
    locked: raw.lk === 1,
    text: typeof raw.tx === "string" ? raw.tx.slice(0, MAX_TEXT) : "",
    fontFamily: FONT_NAMES[raw.ff] ?? "hand",
    fontSize: num(raw.fz, 24, 4, 512),
    textAlign: ALIGN_NAMES[raw.ta] ?? (type === "text" ? "left" : "center"),
    points,
    pressures: pressures.length === points.length ? pressures : [],
    startArrow: HEAD_NAMES[raw.sa] ?? "none",
    endArrow: HEAD_NAMES[raw.ea] ?? "none",
    startBind: shortId(raw.sb) === null ? null : { id: raw.sb },
    endBind: shortId(raw.eb) === null ? null : { id: raw.eb },
    fileId: shortId(raw.fi) ?? "",
    updated: 0,
  };
};

/** The element exactly as every client will see it after a round trip. */
export const canonical = (el) => decodeElement(el.id, encodeElement(el)) ?? el;

export const elementKey = (id) => ELEMENT_PREFIX + id;
export const isElementKey = (key) => key.length > 1 && key[0] === ELEMENT_PREFIX;

export const encodeMeta = (meta) => ({ n: meta.name.slice(0, 120), b: meta.background });

export const decodeMeta = (raw) => {
  if (typeof raw !== "object" || raw === null) return DEFAULT_META;
  return {
    name: typeof raw.n === "string" ? raw.n.slice(0, 120) : DEFAULT_META.name,
    background: colour(raw.b, DEFAULT_META.background),
  };
};

/* ------------------------------------------------------------------ sizes */

const encoder = new TextEncoder();
export const utf8Bytes = (text) => encoder.encode(text).length;

/** Bytes one top-level entry adds to the state object: "key":value, */
export const entryBytes = (key, valueJson) => utf8Bytes(key) + 4 + utf8Bytes(valueJson);

/* --------------------------------------------------------------- strokes */

/**
 * Ramer–Douglas–Peucker simplification for freehand strokes, keeping
 * pressures aligned. Tolerance in scene units.
 */
export const simplifyStroke = (points, pressures, tolerance = 0.35) => {
  if (points.length <= 2) return { points: points.slice(), pressures: pressures.slice() };
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop();
    const [ax, ay] = points[start];
    const [bx, by] = points[end];
    const dx = bx - ax;
    const dy = by - ay;
    const length = Math.hypot(dx, dy) || 1;
    let worst = -1;
    let worstDistance = 0;
    for (let index = start + 1; index < end; index += 1) {
      const [px, py] = points[index];
      const distance = Math.abs(dy * px - dx * py + bx * ay - by * ax) / length;
      if (distance > worstDistance) {
        worstDistance = distance;
        worst = index;
      }
    }
    if (worst !== -1 && worstDistance > tolerance) {
      keep[worst] = 1;
      stack.push([start, worst], [worst, end]);
    }
  }
  const nextPoints = [];
  const nextPressures = [];
  for (let index = 0; index < points.length; index += 1) {
    if (!keep[index]) continue;
    nextPoints.push(points[index]);
    if (pressures.length === points.length) nextPressures.push(pressures[index]);
  }
  return { points: nextPoints, pressures: nextPressures };
};

/* ------------------------------------------------- full-object sanitiser */

const pick = (value, options, fallback) => (typeof value === "string" && options.includes(value) ? value : fallback);

/**
 * Validates a full element object from a pasted clipboard or an opened file
 * and returns its canonical form (or null for unknown types).
 */
export const sanitizeElement = (id, raw) => {
  if (typeof raw !== "object" || raw === null || TYPES[raw.type] === undefined || shortId(id) === null) return null;
  const points = Array.isArray(raw.points)
    ? raw.points
        .slice(0, MAX_POINTS)
        .filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))
        .map((p) => [p[0], p[1]])
    : [];
  const pressures = Array.isArray(raw.pressures) ? raw.pressures.filter(Number.isFinite).slice(0, MAX_POINTS) : [];
  const binding = (value) => (shortId(value?.id) === null ? null : { id: value.id });
  const el = {
    id,
    type: raw.type,
    x: num(raw.x, 0),
    y: num(raw.y, 0),
    width: num(raw.width, 0),
    height: num(raw.height, 0),
    angle: num(raw.angle, 0, -100, 100),
    z: typeof raw.z === "string" && isValidOrderKey(raw.z) ? raw.z : "a0",
    seed: Math.floor(num(raw.seed, 1, 0, 2 ** 31)),
    strokeColor: colour(raw.strokeColor, INK),
    fillColor: colour(raw.fillColor, "transparent"),
    fillStyle: pick(raw.fillStyle, Object.keys(FILLS), "hachure"),
    strokeWidth: num(raw.strokeWidth, 2, 0.5, 32),
    strokeStyle: pick(raw.strokeStyle, Object.keys(STROKES), "solid"),
    roughness: raw.roughness === 0 || raw.roughness === 2 ? raw.roughness : 1,
    opacity: num(raw.opacity, 100, 0, 100),
    rounded: raw.rounded === true,
    groupIds: Array.isArray(raw.groupIds) ? raw.groupIds.map(shortId).filter((group) => group !== null).slice(0, 16) : [],
    locked: raw.locked === true,
    text: typeof raw.text === "string" ? raw.text.slice(0, MAX_TEXT) : "",
    fontFamily: pick(raw.fontFamily, Object.keys(FONTS), "hand"),
    fontSize: num(raw.fontSize, 24, 4, 512),
    textAlign: pick(raw.textAlign, Object.keys(ALIGNS), raw.type === "text" ? "left" : "center"),
    points,
    pressures: pressures.length === points.length ? pressures : [],
    startArrow: pick(raw.startArrow, Object.keys(HEADS), "none"),
    endArrow: pick(raw.endArrow, Object.keys(HEADS), "none"),
    startBind: binding(raw.startBind),
    endBind: binding(raw.endBind),
    fileId: shortId(raw.fileId) ?? "",
    updated: 0,
  };
  return canonical(el);
};
