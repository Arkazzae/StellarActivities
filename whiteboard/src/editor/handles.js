import { centerOf, commonBounds, linearPath, rotate } from "../model/geometry.js";
import { isLinear } from "../model/types.js";
export const FRAME_PADDING = 6; // screen px
export const HANDLE_SIZE = 9; // screen px
export const ROTATE_OFFSET = 24; // screen px
export const selectionFrame = (elements) => {
  if (elements.length === 0) return null;
  if (elements.length === 1) {
    const el = elements[0];
    if (isLinear(el) || el.type === "freedraw") {
      // Frame around the points, in the element's rotated frame.
      const path = isLinear(el) ? linearPath(el) : el.points;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const [px, py] of path) {
        minX = Math.min(minX, px);
        minY = Math.min(minY, py);
        maxX = Math.max(maxX, px);
        maxY = Math.max(maxY, py);
      }
      const c = centerOf(el);
      const local = rotate(el.x + (minX + maxX) / 2, el.y + (minY + maxY) / 2, c.x, c.y, el.angle);
      return { cx: local.x, cy: local.y, width: maxX - minX, height: maxY - minY, angle: el.angle };
    }
    return {
      cx: el.x + el.width / 2,
      cy: el.y + el.height / 2,
      width: Math.abs(el.width),
      height: Math.abs(el.height),
      angle: el.angle,
    };
  }
  const box = commonBounds(elements);
  if (box === null) return null;
  return {
    cx: (box.minX + box.maxX) / 2,
    cy: (box.minY + box.maxY) / 2,
    width: box.maxX - box.minX,
    height: box.maxY - box.minY,
    angle: 0,
  };
};
/** Corner of the padded frame in scene space. sx/sy ∈ {-1, 0, 1}. */
export const framePoint = (frame, sx, sy, zoom, extraY = 0) => {
  const pad = FRAME_PADDING / zoom;
  const x = frame.cx + sx * (frame.width / 2 + pad);
  const y = frame.cy + sy * (frame.height / 2 + pad) + extraY;
  return rotate(x, y, frame.cx, frame.cy, frame.angle);
};
const HANDLE_SIGNS = {
  nw: [-1, -1],
  n: [0, -1],
  ne: [1, -1],
  e: [1, 0],
  se: [1, 1],
  s: [0, 1],
  sw: [-1, 1],
  w: [-1, 0],
};
export const handleSigns = (handle) => HANDLE_SIGNS[handle];
export const handlePositions = (frame, zoom, options) => {
  const out = new Map();
  const screenWidth = frame.width * zoom;
  const screenHeight = frame.height * zoom;
  const roomForEdges = screenWidth > 36 && screenHeight > 36;
  for (const [id, [sx, sy]] of Object.entries(HANDLE_SIGNS)) {
    const isEdge = sx === 0 || sy === 0;
    if (isEdge && (!options.edges || !roomForEdges)) continue;
    if (!isEdge && !options.corners) continue;
    if (isEdge && sx === 0 && screenWidth < 20) continue;
    if (isEdge && sy === 0 && screenHeight < 20) continue;
    out.set(id, framePoint(frame, sx, sy, zoom));
  }
  if (options.rotate) out.set("rotate", framePoint(frame, 0, -1, zoom, -ROTATE_OFFSET / zoom));
  return out;
};
export const handleOptionsFor = (elements) => {
  if (elements.length === 1) {
    const el = elements[0];
    if (isLinear(el)) return { edges: false, corners: false, rotate: false };
    if (el.type === "text") return { edges: false, corners: true, rotate: true };
    return { edges: true, corners: true, rotate: true };
  }
  return { edges: true, corners: true, rotate: true };
};
export const cursorForHandle = (handle, angle) => {
  if (handle === "rotate") return "grab";
  const base = { e: 0, se: 45, s: 90, sw: 135, w: 180, nw: 225, n: 270, ne: 315 };
  const degrees = (((base[handle] + (angle * 180) / Math.PI) % 180) + 180) % 180;
  const index = Math.round(degrees / 45) % 4;
  return ["ew-resize", "nwse-resize", "ns-resize", "nesw-resize"][index];
};
/** Midpoints between consecutive points of a linear element (local). */
export const midpoints = (points) => {
  const out = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    out.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
  }
  return out;
};
