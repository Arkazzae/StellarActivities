import { isLinear } from "./types.js";
export const EMPTY_BOX = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
export const boxWidth = (box) => box.maxX - box.minX;
export const boxHeight = (box) => box.maxY - box.minY;
export const rotate = (px, py, cx, cy, angle) => {
  if (angle === 0) return { x: px, y: py };
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = px - cx;
  const dy = py - cy;
  return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
};
export const centerOf = (el) => ({
  x: el.x + el.width / 2,
  y: el.y + el.height / 2,
});
/** World point → element-local point (relative to el.x/el.y, rotation removed). */
export const toLocal = (el, px, py) => {
  const c = centerOf(el);
  const p = rotate(px, py, c.x, c.y, -el.angle);
  return { x: p.x - el.x, y: p.y - el.y };
};
/** Element-local point → world point. */
export const toWorld = (el, lx, ly) => {
  const c = centerOf(el);
  return rotate(el.x + lx, el.y + ly, c.x, c.y, el.angle);
};
export const distance = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
export const distanceToSegment = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};
export const distanceToPolyline = (px, py, points, closed = false) => {
  if (points.length === 0) return Infinity;
  if (points.length === 1) {
    const only = points[0];
    return Math.hypot(px - only[0], py - only[1]);
  }
  let best = Infinity;
  const count = closed ? points.length : points.length - 1;
  for (let index = 0; index < count; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    best = Math.min(best, distanceToSegment(px, py, a[0], a[1], b[0], b[1]));
  }
  return best;
};
export const pointInPolygon = (px, py, polygon) => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i];
    const b = polygon[j];
    if (a[1] > py !== b[1] > py && px < ((b[0] - a[0]) * (py - a[1])) / (b[1] - a[1]) + a[0]) {
      inside = !inside;
    }
  }
  return inside;
};
/** Catmull-Rom spline through `points` expressed as cubic Bézier segments. */
export const catmullRomSegments = (points) => {
  const segments = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[index - 1] ?? points[index];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[index + 2] ?? p2;
    segments.push({
      from: p1,
      c1: [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6],
      c2: [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6],
      to: p2,
    });
  }
  return segments;
};
export const cubicAt = (segment, t) => {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return [
    a * segment.from[0] + b * segment.c1[0] + c * segment.c2[0] + d * segment.to[0],
    a * segment.from[1] + b * segment.c1[1] + c * segment.c2[1] + d * segment.to[1],
  ];
};
/** Sampled polyline of a linear element in local coordinates. */
export const linearPath = (el) => {
  if (!el.rounded || el.points.length < 3) return el.points.slice();
  const sampled = [];
  for (const segment of catmullRomSegments(el.points)) {
    const length = Math.hypot(segment.to[0] - segment.from[0], segment.to[1] - segment.from[1]);
    const steps = Math.max(4, Math.min(32, Math.ceil(length / 12)));
    if (sampled.length === 0) sampled.push(segment.from);
    for (let step = 1; step <= steps; step += 1) sampled.push(cubicAt(segment, step / steps));
  }
  return sampled;
};
/* --------------------------------------------------------------- outlines */
export const cornerRadius = (width, height) => Math.min(32, Math.min(Math.abs(width), Math.abs(height)) * 0.25);
/** Polygon with quadratic rounded corners, sampled to points. */
export const roundedPolygon = (vertices, radius, steps = 6) => {
  if (radius <= 0.5) return vertices.slice();
  const out = [];
  const count = vertices.length;
  for (let index = 0; index < count; index += 1) {
    const prev = vertices[(index - 1 + count) % count];
    const current = vertices[index];
    const next = vertices[(index + 1) % count];
    const toPrev = Math.hypot(prev[0] - current[0], prev[1] - current[1]);
    const toNext = Math.hypot(next[0] - current[0], next[1] - current[1]);
    const r = Math.min(radius, toPrev / 2, toNext / 2);
    const start = [
      current[0] + ((prev[0] - current[0]) / toPrev) * r,
      current[1] + ((prev[1] - current[1]) / toPrev) * r,
    ];
    const end = [
      current[0] + ((next[0] - current[0]) / toNext) * r,
      current[1] + ((next[1] - current[1]) / toNext) * r,
    ];
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      const mt = 1 - t;
      out.push([
        mt * mt * start[0] + 2 * mt * t * current[0] + t * t * end[0],
        mt * mt * start[1] + 2 * mt * t * current[1] + t * t * end[1],
      ]);
    }
  }
  return out;
};
export const diamondVertices = (width, height) => [
  [width / 2, 0],
  [width, height / 2],
  [width / 2, height],
  [0, height / 2],
];
export const rectVertices = (width, height) => [
  [0, 0],
  [width, 0],
  [width, height],
  [0, height],
];
export const ellipsePoints = (width, height, steps = 48) => {
  const points = [];
  const rx = width / 2;
  const ry = height / 2;
  for (let step = 0; step < steps; step += 1) {
    const t = (step / steps) * Math.PI * 2;
    points.push([rx + Math.cos(t) * rx, ry + Math.sin(t) * ry]);
  }
  return points;
};
/** Closed outline in local coordinates, or null for open/ink elements. */
export const shapeOutline = (el) => {
  switch (el.type) {
    case "rectangle":
      return el.rounded
        ? roundedPolygon(rectVertices(el.width, el.height), cornerRadius(el.width, el.height))
        : rectVertices(el.width, el.height);
    case "diamond":
      return el.rounded
        ? roundedPolygon(diamondVertices(el.width, el.height), cornerRadius(el.width, el.height) * 0.8)
        : diamondVertices(el.width, el.height);
    case "ellipse":
      return ellipsePoints(el.width, el.height);
    case "text":
    case "image":
      return rectVertices(el.width, el.height);
    default:
      return null;
  }
};
/* ----------------------------------------------------------------- bounds */
export const pointsBox = (points) => {
  const box = { ...EMPTY_BOX };
  for (const [px, py] of points) {
    box.minX = Math.min(box.minX, px);
    box.minY = Math.min(box.minY, py);
    box.maxX = Math.max(box.maxX, px);
    box.maxY = Math.max(box.maxY, py);
  }
  if (points.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return box;
};
/** Axis-aligned world bounds of an element including rotation. */
export const elementBounds = (el) => {
  if ((isLinear(el) || el.type === "freedraw") && el.points.length > 0) {
    const path = isLinear(el) ? linearPath(el) : el.points;
    const world = path.map(([px, py]) => {
      const p = toWorld(el, px, py);
      return [p.x, p.y];
    });
    return pointsBox(world);
  }
  if (el.type === "ellipse" && el.angle !== 0) {
    const c = centerOf(el);
    const rx = el.width / 2;
    const ry = el.height / 2;
    const cos = Math.cos(el.angle);
    const sin = Math.sin(el.angle);
    const halfW = Math.sqrt(rx * rx * cos * cos + ry * ry * sin * sin);
    const halfH = Math.sqrt(rx * rx * sin * sin + ry * ry * cos * cos);
    return { minX: c.x - halfW, minY: c.y - halfH, maxX: c.x + halfW, maxY: c.y + halfH };
  }
  const corners = [
    toWorld(el, 0, 0),
    toWorld(el, el.width, 0),
    toWorld(el, el.width, el.height),
    toWorld(el, 0, el.height),
  ];
  return pointsBox(corners.map((corner) => [corner.x, corner.y]));
};
export const unionBox = (a, b) => ({
  minX: Math.min(a.minX, b.minX),
  minY: Math.min(a.minY, b.minY),
  maxX: Math.max(a.maxX, b.maxX),
  maxY: Math.max(a.maxY, b.maxY),
});
export const commonBounds = (elements) => {
  let box = null;
  for (const el of elements) {
    const bounds = elementBounds(el);
    box = box === null ? bounds : unionBox(box, bounds);
  }
  return box;
};
export const boxesIntersect = (a, b) => a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
export const boxContains = (outer, inner) =>
  inner.minX >= outer.minX && inner.maxX <= outer.maxX && inner.minY >= outer.minY && inner.maxY <= outer.maxY;
export const expandBox = (box, amount) => ({
  minX: box.minX - amount,
  minY: box.minY - amount,
  maxX: box.maxX + amount,
  maxY: box.maxY + amount,
});
/* ---------------------------------------------------------------- hit test */
const isFilled = (el) => el.fillColor !== "transparent";
/**
 * Does a world point touch the element? `tolerance` is in scene units.
 * Unfilled shapes only respond near their outline, unless `insideCounts`.
 */
export const hitElement = (el, px, py, tolerance, insideCounts = false) => {
  const local = toLocal(el, px, py);
  const stroke = tolerance + el.strokeWidth / 2;
  switch (el.type) {
    case "text":
    case "image":
      return (
        local.x >= -tolerance &&
        local.y >= -tolerance &&
        local.x <= el.width + tolerance &&
        local.y <= el.height + tolerance
      );
    case "line":
    case "arrow":
      return distanceToPolyline(local.x, local.y, linearPath(el)) <= stroke;
    case "freedraw":
      return distanceToPolyline(local.x, local.y, el.points) <= stroke + el.strokeWidth;
    default: {
      const outline = shapeOutline(el);
      if (outline === null) return false;
      if ((isFilled(el) || insideCounts || el.text.length > 0) && pointInPolygon(local.x, local.y, outline)) {
        return true;
      }
      return distanceToPolyline(local.x, local.y, outline, true) <= stroke;
    }
  }
};
/** Point inside the (rotated) bounding box of the element. */
export const insideElementBox = (el, px, py, pad = 0) => {
  const local = toLocal(el, px, py);
  if (isLinear(el) || el.type === "freedraw") {
    const box = pointsBox(el.points);
    return (
      local.x >= box.minX - pad && local.x <= box.maxX + pad && local.y >= box.minY - pad && local.y <= box.maxY + pad
    );
  }
  return local.x >= -pad && local.y >= -pad && local.x <= el.width + pad && local.y <= el.height + pad;
};
/* ----------------------------------------------------------- intersections */
export const segmentIntersection = (a1, a2, b1, b2) => {
  const rX = a2[0] - a1[0];
  const rY = a2[1] - a1[1];
  const sX = b2[0] - b1[0];
  const sY = b2[1] - b1[1];
  const denominator = rX * sY - rY * sX;
  if (Math.abs(denominator) < 1e-9) return null;
  const qpX = b1[0] - a1[0];
  const qpY = b1[1] - a1[1];
  const t = (qpX * sY - qpY * sX) / denominator;
  const u = (qpX * rY - qpY * rX) / denominator;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { point: [a1[0] + t * rX, a1[1] + t * rY], t };
};
/**
 * Where an arrow coming from `from` toward the centre of `target` meets the
 * target's outline, pushed back by `gap`. Returns world coordinates.
 */
export const bindingPoint = (target, from, gap) => {
  const outline = shapeOutline(target);
  const c = centerOf(target);
  if (outline === null) return c;
  const localFrom = toLocal(target, from.x, from.y);
  const localCenter = [target.width / 2, target.height / 2];
  const fromPoint = [localFrom.x, localFrom.y];
  let best = null;
  for (let index = 0; index < outline.length; index += 1) {
    const hit = segmentIntersection(fromPoint, localCenter, outline[index], outline[(index + 1) % outline.length]);
    if (hit !== null && (best === null || hit.t < best.t)) best = hit;
  }
  if (best === null) return c;
  const dx = localCenter[0] - fromPoint[0];
  const dy = localCenter[1] - fromPoint[1];
  const length = Math.hypot(dx, dy) || 1;
  const pushed = [best.point[0] - (dx / length) * gap, best.point[1] - (dy / length) * gap];
  return toWorld(target, pushed[0], pushed[1]);
};
/* ------------------------------------------------------------------- misc */
export const snapAngle = (dx, dy, step = Math.PI / 12) => {
  const length = Math.hypot(dx, dy);
  const angle = Math.round(Math.atan2(dy, dx) / step) * step;
  return { x: Math.cos(angle) * length, y: Math.sin(angle) * length };
};
export const normalizeAngle = (angle) => {
  const full = Math.PI * 2;
  return ((angle % full) + full) % full;
};
/**
 * Re-bases points so the bounding box starts at 0,0 and returns the new
 * element origin and size, keeping the world position of every point.
 * Only valid for angle 0; rotated linear elements keep their box (the caller
 * compensates for the centre shift).
 */
export const normalizePoints = (x, y, points) => {
  const box = pointsBox(points);
  return {
    x: x + box.minX,
    y: y + box.minY,
    width: box.maxX - box.minX,
    height: box.maxY - box.minY,
    points: points.map(([px, py]) => [px - box.minX, py - box.minY]),
  };
};
/**
 * Same as normalizePoints but valid for rotated elements: the element box is
 * recomputed and x/y shifted so that every point keeps its world position.
 */
export const rebaseLinear = (el, points) => {
  const box = pointsBox(points);
  const width = box.maxX - box.minX;
  const height = box.maxY - box.minY;
  const local = points.map(([px, py]) => [px - box.minX, py - box.minY]);
  if (el.angle === 0) {
    return { x: el.x + box.minX, y: el.y + box.minY, width, height, points: local };
  }
  // World position of the first point under the old frame.
  const first = points[0] ?? [0, 0];
  const worldFirst = toWorld(el, first[0], first[1]);
  // In the new frame (centre = x + w/2), the first point sits at local[0].
  // Solve for x, y: world = rotate(x + lx, y + ly, x + w/2, y + h/2, angle).
  const lx = local[0][0];
  const ly = local[0][1];
  const offset = rotate(lx, ly, width / 2, height / 2, el.angle);
  return { x: worldFirst.x - offset.x, y: worldFirst.y - offset.y, width, height, points: local };
};
