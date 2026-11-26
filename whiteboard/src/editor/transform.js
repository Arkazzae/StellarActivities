import { centerOf, normalizeAngle, rotate } from "../model/geometry.js";
import { isLinear } from "../model/types.js";
import { handleSigns } from "./handles.js";
const MIN_SIZE = 1;
const scalePoints = (points, fromWidth, fromHeight, toWidth, toHeight, flipX, flipY) => {
  const sx = fromWidth === 0 ? 1 : toWidth / fromWidth;
  const sy = fromHeight === 0 ? 1 : toHeight / fromHeight;
  return points.map(([px, py]) => [flipX ? toWidth - px * sx : px * sx, flipY ? toHeight - py * sy : py * sy]);
};
/** Resize one (possibly rotated) element by dragging `handle` to `pointer`. */
export const resizeElement = (el, handle, pointer, options) => {
  const [sx, sy] = handleSigns(handle);
  const center = centerOf(el);
  const width = Math.abs(el.width);
  const height = Math.abs(el.height);
  const localPointer = rotate(pointer.x, pointer.y, center.x, center.y, -el.angle);
  const qx = localPointer.x - center.x;
  const qy = localPointer.y - center.y;
  const keepAspect = options.keepAspect || el.type === "text" || (el.type === "image" && sx !== 0 && sy !== 0);
  // Anchor = fixed side (or centre) in local coordinates.
  const ax = options.fromCenter ? 0 : -sx * (width / 2);
  const ay = options.fromCenter ? 0 : -sy * (height / 2);
  let x1 = -width / 2;
  let x2 = width / 2;
  let y1 = -height / 2;
  let y2 = height / 2;
  if (sx !== 0) {
    if (options.fromCenter) {
      x1 = -Math.abs(qx);
      x2 = Math.abs(qx);
    } else {
      x1 = ax;
      x2 = qx;
    }
  }
  if (sy !== 0) {
    if (options.fromCenter) {
      y1 = -Math.abs(qy);
      y2 = Math.abs(qy);
    } else {
      y1 = ay;
      y2 = qy;
    }
  }
  let newWidth = Math.abs(x2 - x1);
  let newHeight = Math.abs(y2 - y1);
  const flipX = sx !== 0 && !options.fromCenter && Math.sign(x2 - x1) !== sx && x2 !== x1;
  const flipY = sy !== 0 && !options.fromCenter && Math.sign(y2 - y1) !== sy && y2 !== y1;
  if (keepAspect && width > 0 && height > 0) {
    let scale;
    if (sx !== 0 && sy !== 0) scale = Math.max(newWidth / width, newHeight / height);
    else if (sx !== 0) scale = newWidth / width;
    else scale = newHeight / height;
    newWidth = width * scale;
    newHeight = height * scale;
    const dirX = flipX ? -sx : sx;
    const dirY = flipY ? -sy : sy;
    if (options.fromCenter) {
      x1 = -newWidth / 2;
      x2 = newWidth / 2;
      y1 = -newHeight / 2;
      y2 = newHeight / 2;
    } else {
      if (sx !== 0) {
        x1 = ax;
        x2 = ax + dirX * newWidth;
      } else {
        x1 = -newWidth / 2;
        x2 = newWidth / 2;
      }
      if (sy !== 0) {
        y1 = ay;
        y2 = ay + dirY * newHeight;
      } else {
        y1 = -newHeight / 2;
        y2 = newHeight / 2;
      }
    }
  }
  newWidth = Math.max(MIN_SIZE, Math.abs(x2 - x1));
  newHeight = Math.max(MIN_SIZE, Math.abs(y2 - y1));
  const localCenterX = (x1 + x2) / 2;
  const localCenterY = (y1 + y2) / 2;
  const worldCenter = rotate(center.x + localCenterX, center.y + localCenterY, center.x, center.y, el.angle);
  const patch = {
    x: worldCenter.x - newWidth / 2,
    y: worldCenter.y - newHeight / 2,
    width: newWidth,
    height: newHeight,
  };
  if (isLinear(el) || el.type === "freedraw") {
    patch.points = scalePoints(
      el.points,
      width,
      height,
      el.width === 0 ? width : newWidth,
      el.height === 0 ? height : newHeight,
      flipX,
      flipY,
    );
    if (el.width === 0) patch.width = 0;
    if (el.height === 0) patch.height = 0;
  }
  if (el.type === "text" && height > 0) {
    patch.fontSize = Math.max(4, Math.min(512, el.fontSize * (newHeight / height)));
  }
  return patch;
};
/** Resize a multi-selection: maps the old common box onto the new one. */
export const resizeMany = (originals, frame, handle, pointer, options) => {
  const [sx, sy] = handleSigns(handle);
  const box = {
    minX: frame.cx - frame.width / 2,
    minY: frame.cy - frame.height / 2,
    maxX: frame.cx + frame.width / 2,
    maxY: frame.cy + frame.height / 2,
  };
  const width = Math.max(1e-6, frame.width);
  const height = Math.max(1e-6, frame.height);
  const anchorX = options.fromCenter ? frame.cx : sx > 0 ? box.minX : box.maxX;
  const anchorY = options.fromCenter ? frame.cy : sy > 0 ? box.minY : box.maxY;
  let fx = 1;
  let fy = 1;
  if (sx !== 0) fx = ((pointer.x - anchorX) * (options.fromCenter ? 2 : 1) * sx) / width;
  if (sy !== 0) fy = ((pointer.y - anchorY) * (options.fromCenter ? 2 : 1) * sy) / height;
  if (options.fromCenter) {
    fx = Math.abs(fx);
    fy = Math.abs(fy);
  }
  const keepAspect = options.keepAspect || originals.some((el) => el.type === "text" || el.type === "image");
  if (keepAspect) {
    const magnitude =
      sx !== 0 && sy !== 0 ? Math.max(Math.abs(fx), Math.abs(fy)) : sx !== 0 ? Math.abs(fx) : Math.abs(fy);
    fx = Math.sign(fx || 1) * magnitude;
    fy = Math.sign(fy || 1) * magnitude;
    if (sx === 0) fx = Math.abs(fy);
    if (sy === 0) fy = Math.abs(fx);
  }
  if (Math.abs(fx) < 0.01) fx = 0.01 * Math.sign(fx || 1);
  if (Math.abs(fy) < 0.01) fy = 0.01 * Math.sign(fy || 1);
  const mapX = (x) => anchorX + (x - anchorX) * fx;
  const mapY = (y) => anchorY + (y - anchorY) * fy;
  const patches = new Map();
  for (const el of originals) {
    const c = centerOf(el);
    const newWidth = Math.abs(el.width * fx);
    const newHeight = Math.abs(el.height * fy);
    const ncx = mapX(c.x);
    const ncy = mapY(c.y);
    const patch = {
      x: ncx - newWidth / 2,
      y: ncy - newHeight / 2,
      width: newWidth,
      height: newHeight,
    };
    const flipX = fx < 0;
    const flipY = fy < 0;
    if (isLinear(el) || el.type === "freedraw") {
      patch.points = scalePoints(el.points, el.width, el.height, newWidth, newHeight, flipX, flipY);
    }
    if (flipX !== flipY && el.angle !== 0) patch.angle = normalizeAngle(-el.angle);
    if (el.type === "text") {
      const scale = Math.min(Math.abs(fx), Math.abs(fy));
      patch.fontSize = Math.max(4, Math.min(512, el.fontSize * scale));
      patch.width = el.width * scale;
      patch.height = el.height * scale;
      patch.x = ncx - (el.width * scale) / 2;
      patch.y = ncy - (el.height * scale) / 2;
    } else if (el.text.length > 0) {
      const scale = Math.min(Math.abs(fx), Math.abs(fy));
      patch.fontSize = Math.max(4, Math.min(512, el.fontSize * scale));
    }
    patches.set(el.id, patch);
  }
  return patches;
};
/** Rotate elements around `pivot` by `delta` radians. */
export const rotateMany = (originals, pivot, delta) => {
  const patches = new Map();
  for (const el of originals) {
    const c = centerOf(el);
    const moved = rotate(c.x, c.y, pivot.x, pivot.y, delta);
    patches.set(el.id, {
      x: moved.x - el.width / 2,
      y: moved.y - el.height / 2,
      angle: normalizeAngle(el.angle + delta),
    });
  }
  return patches;
};
export const snapToGrid = (value, grid) => Math.round(value / grid) * grid;
