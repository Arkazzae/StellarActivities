import { keysBetween } from "../model/order.js";
import { newId, newSeed } from "../model/types.js";
import { sanitizeElement } from "../model/codec.js";
export const CLIPBOARD_TYPE = "whiteboard/clipboard";
export const FILE_TYPE = "whiteboard/board";
/** Boards saved by the earlier standalone prototype load too. */
const LEGACY_TYPES = new Set(["kreska/clipboard", "kreska/board"]);
export const FILE_EXTENSION = ".whiteboard";
const collectFiles = (elements, resolve) => {
  const files = {};
  for (const el of elements) {
    if (el.type !== "image" || el.fileId.length === 0) continue;
    const data = resolve(el.fileId);
    if (data !== undefined) files[el.fileId] = data;
  }
  return files;
};
export const serializeClipboard = (elements, resolve) =>
  JSON.stringify({ type: CLIPBOARD_TYPE, version: 1, elements, files: collectFiles(elements, resolve) });
export const serializeBoard = (meta, elements, resolve) =>
  JSON.stringify({ type: FILE_TYPE, version: 1, meta, elements, files: collectFiles(elements, resolve) }, null, 1);
const parseFiles = (raw) => {
  const files = {};
  if (typeof raw !== "object" || raw === null) return files;
  for (const [id, value] of Object.entries(raw)) {
    if (typeof value === "string" && value.startsWith("data:image/") && id.length <= 64) files[id] = value;
  }
  return files;
};
const parseElements = (raw) => {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw.slice(0, 20_000)) {
    if (typeof item !== "object" || item === null) continue;
    const id = item.id;
    if (typeof id !== "string" || id.length === 0 || id.length > 64) continue;
    const el = sanitizeElement(id, item);
    if (el !== null) out.push(el);
  }
  return out;
};
export const parseClipboard = (text) => {
  try {
    const data = JSON.parse(text);
    if (data.type !== CLIPBOARD_TYPE && data.type !== FILE_TYPE && !LEGACY_TYPES.has(data.type)) return null;
    return { elements: parseElements(data.elements), files: parseFiles(data.files) };
  } catch {
    return null;
  }
};
export const parseBoardFile = (text) => {
  try {
    const data = JSON.parse(text);
    if (data.type !== FILE_TYPE && data.type !== "kreska/board") return null;
    const meta = typeof data.meta === "object" && data.meta !== null ? data.meta : {};
    return {
      elements: parseElements(data.elements),
      files: parseFiles(data.files),
      meta: {
        ...(typeof meta.name === "string" ? { name: meta.name.slice(0, 120) } : {}),
        ...(typeof meta.background === "string" && /^#[0-9a-f]{3,8}$/i.test(meta.background)
          ? { background: meta.background }
          : {}),
      },
    };
  } catch {
    return null;
  }
};
/**
 * Gives pasted elements fresh ids, groups, seeds and order keys above `top`,
 * keeps bindings that point inside the pasted set, and shifts by (dx, dy).
 */
export const cloneForInsert = (elements, top, dx, dy) => {
  const sorted = [...elements].sort((a, b) => (a.z < b.z ? -1 : a.z > b.z ? 1 : 0));
  const ids = new Map();
  const groups = new Map();
  for (const el of sorted) ids.set(el.id, newId());
  const keys = keysBetween(top, null, sorted.length);
  const now = Date.now();
  return sorted.map((el, index) => ({
    ...el,
    id: ids.get(el.id),
    x: el.x + dx,
    y: el.y + dy,
    z: keys[index],
    seed: newSeed(),
    locked: false,
    updated: now,
    groupIds: el.groupIds.map((group) => {
      const existing = groups.get(group);
      if (existing !== undefined) return existing;
      const next = newId();
      groups.set(group, next);
      return next;
    }),
    startBind: el.startBind !== null && ids.has(el.startBind.id) ? { id: ids.get(el.startBind.id) } : null,
    endBind: el.endBind !== null && ids.has(el.endBind.id) ? { id: ids.get(el.endBind.id) } : null,
  }));
};
