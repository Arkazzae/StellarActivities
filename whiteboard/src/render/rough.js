import { catmullRomSegments } from "../model/geometry.js";
/** Deterministic PRNG (mulberry32) so every client draws the same wobble. */
export class Rng {
  #state;
  constructor(seed) {
    this.#state = seed >>> 0 || 0x9e3779b9;
  }
  next() {
    this.#state = (this.#state + 0x6d2b79f5) >>> 0;
    let t = this.#state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  /** Uniform in [-amount, amount]. */
  jitter(amount) {
    return (this.next() * 2 - 1) * amount;
  }
  range(min, max) {
    return min + this.next() * (max - min);
  }
}
/* --------------------------------------------------------------- path data */
export const OP_MOVE = 0;
export const OP_LINE = 1;
export const OP_CUBIC = 2;
export const OP_CLOSE = 3;
/** Compact path encoding shared by the canvas and SVG back-ends. */
export class PathData {
  data = [];
  move(x, y) {
    this.data.push(OP_MOVE, x, y);
    return this;
  }
  line(x, y) {
    this.data.push(OP_LINE, x, y);
    return this;
  }
  cubic(x1, y1, x2, y2, x, y) {
    this.data.push(OP_CUBIC, x1, y1, x2, y2, x, y);
    return this;
  }
  close() {
    this.data.push(OP_CLOSE);
    return this;
  }
  get empty() {
    return this.data.length === 0;
  }
}
export const forEachOp = (data, visit) => {
  let index = 0;
  while (index < data.length) {
    const op = data[index];
    if (op === OP_MOVE) {
      visit.move(data[index + 1], data[index + 2]);
      index += 3;
    } else if (op === OP_LINE) {
      visit.line(data[index + 1], data[index + 2]);
      index += 3;
    } else if (op === OP_CUBIC) {
      visit.cubic(data[index + 1], data[index + 2], data[index + 3], data[index + 4], data[index + 5], data[index + 6]);
      index += 7;
    } else {
      visit.close();
      index += 1;
    }
  }
};
const lengthGain = (length) => {
  if (length < 200) return 1;
  if (length > 500) return 0.45;
  return 1 - (length - 200) * 0.00183;
};
/**
 * One hand-drawn line: endpoints wander a little and the middle bows sideways,
 * expressed as a single cubic. `pass` 0 is the bold first stroke, 1 the lighter
 * retrace.
 */
export const roughLine = (path, x1, y1, x2, y2, options, pass, continueFrom = false) => {
  const { rng } = options;
  const length = Math.hypot(x2 - x1, y2 - y1);
  const amount = options.roughness * options.scale * lengthGain(length);
  if (amount <= 0) {
    if (!continueFrom) path.move(x1, y1);
    path.line(x2, y2);
    return;
  }
  const wander = Math.min(pass === 0 ? 1.6 : 0.8, length / 10) * amount;
  const bow = (length / 220) * amount;
  const normalX = length === 0 ? 0 : -(y2 - y1) / length;
  const normalY = length === 0 ? 0 : (x2 - x1) / length;
  const bend = rng.jitter(bow) * (1.2 + length * 0.004);
  const split = rng.range(0.25, 0.42);
  const sx = x1 + rng.jitter(wander);
  const sy = y1 + rng.jitter(wander);
  const ex = x2 + rng.jitter(wander);
  const ey = y2 + rng.jitter(wander);
  const c1x = x1 + (x2 - x1) * split + normalX * bend + rng.jitter(wander * 0.6);
  const c1y = y1 + (y2 - y1) * split + normalY * bend + rng.jitter(wander * 0.6);
  const c2x = x1 + (x2 - x1) * (1 - split * 0.9) + normalX * bend + rng.jitter(wander * 0.6);
  const c2y = y1 + (y2 - y1) * (1 - split * 0.9) + normalY * bend + rng.jitter(wander * 0.6);
  if (continueFrom) path.line(sx, sy);
  else path.move(sx, sy);
  path.cubic(c1x, c1y, c2x, c2y, ex, ey);
};
/** Open or closed smooth curve through points (Catmull-Rom), with wobble. */
export const roughCurve = (path, points, options, pass, closed) => {
  if (points.length < 2) return;
  const amount = options.roughness * options.scale * (pass === 0 ? 1 : 0.6);
  const { rng } = options;
  const jittered = points.map(([px, py]) => [px + rng.jitter(amount), py + rng.jitter(amount)]);
  if (closed) {
    // Repeat the head so the curve closes smoothly, with a slight overshoot
    // when rough, the way a pen overlaps where it started.
    const overshoot = amount > 0 ? 1 + Math.floor(rng.range(0, 2)) : 1;
    for (let index = 0; index < overshoot; index += 1) {
      const point = jittered[index];
      jittered.push([point[0] + rng.jitter(amount), point[1] + rng.jitter(amount)]);
    }
  }
  const segments = catmullRomSegments(jittered);
  const first = segments[0];
  if (first === undefined) return;
  path.move(first.from[0], first.from[1]);
  for (const segment of segments) {
    path.cubic(segment.c1[0], segment.c1[1], segment.c2[0], segment.c2[1], segment.to[0], segment.to[1]);
  }
  if (closed && amount === 0) path.close();
};
/**
 * Polygon with rounded corners drawn as one continuous stroke per pass:
 * straight edges bow slightly, corners are quadratic arcs, and a rough pass
 * runs a little past its starting point like a real pen.
 */
export const roughRoundedPolygon = (path, vertices, radius, options, pass, closeForFill = false) => {
  const count = vertices.length;
  if (count < 3) return;
  const { rng } = options;
  const amount = options.roughness * options.scale * (pass === 0 ? 1 : 0.65);
  const corners = vertices.map((vertex, index) => {
    const prev = vertices[(index - 1 + count) % count];
    const next = vertices[(index + 1) % count];
    const toPrev = Math.hypot(prev[0] - vertex[0], prev[1] - vertex[1]) || 1;
    const toNext = Math.hypot(next[0] - vertex[0], next[1] - vertex[1]) || 1;
    const r = Math.min(radius, toPrev / 2, toNext / 2);
    const wobble = () => rng.jitter(amount * 0.9);
    return {
      start: [
        vertex[0] + ((prev[0] - vertex[0]) / toPrev) * r + wobble(),
        vertex[1] + ((prev[1] - vertex[1]) / toPrev) * r + wobble(),
      ],
      vertex: [vertex[0] + wobble() * 0.6, vertex[1] + wobble() * 0.6],
      end: [
        vertex[0] + ((next[0] - vertex[0]) / toNext) * r + wobble(),
        vertex[1] + ((next[1] - vertex[1]) / toNext) * r + wobble(),
      ],
    };
  });
  const edge = (from, to, fraction = 1) => {
    const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const nx = length === 0 ? 0 : -(to[1] - from[1]) / length;
    const ny = length === 0 ? 0 : (to[0] - from[0]) / length;
    const bend = amount === 0 ? 0 : rng.jitter((length / 220) * amount * lengthGain(length)) * (1.2 + length * 0.004);
    const ex = from[0] + (to[0] - from[0]) * fraction;
    const ey = from[1] + (to[1] - from[1]) * fraction;
    path.cubic(
      from[0] + (ex - from[0]) / 3 + nx * bend,
      from[1] + (ey - from[1]) / 3 + ny * bend,
      from[0] + ((ex - from[0]) * 2) / 3 + nx * bend,
      from[1] + ((ey - from[1]) * 2) / 3 + ny * bend,
      ex,
      ey,
    );
  };
  const corner = (index) => {
    const c = corners[index % count];
    path.cubic(
      c.start[0] + (2 / 3) * (c.vertex[0] - c.start[0]),
      c.start[1] + (2 / 3) * (c.vertex[1] - c.start[1]),
      c.end[0] + (2 / 3) * (c.vertex[0] - c.end[0]),
      c.end[1] + (2 / 3) * (c.vertex[1] - c.end[1]),
      c.end[0],
      c.end[1],
    );
  };
  const first = corners[0];
  path.move(first.end[0], first.end[1]);
  for (let index = 1; index <= count; index += 1) {
    const previous = corners[(index - 1) % count];
    const current = corners[index % count];
    edge(previous.end, current.start);
    corner(index);
  }
  if (closeForFill || amount === 0) {
    path.close();
    return;
  }
  // Overshoot: continue a short way along the first edge.
  const next = corners[1];
  edge(first.end, next.start, rng.range(0.06, 0.16));
};
/** Hand-drawn ellipse: wobbly radii, random start and a short overlap. */
export const roughEllipse = (path, width, height, options, pass) => {
  const rx = width / 2;
  const ry = height / 2;
  const { rng } = options;
  const amount = options.roughness * options.scale;
  if (amount <= 0) {
    // Four-arc cubic approximation of an exact ellipse.
    const k = 0.5522847498;
    path
      .move(rx * 2, ry)
      .cubic(rx * 2, ry + ry * k, rx + rx * k, ry * 2, rx, ry * 2)
      .cubic(rx - rx * k, ry * 2, 0, ry + ry * k, 0, ry)
      .cubic(0, ry - ry * k, rx - rx * k, 0, rx, 0)
      .cubic(rx + rx * k, 0, rx * 2, ry - ry * k, rx * 2, ry)
      .close();
    return;
  }
  const perimeter = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
  const steps = Math.max(9, Math.min(36, Math.ceil(perimeter / 32)));
  const increment = (Math.PI * 2) / steps;
  const radiusX = rx * (1 + rng.jitter(0.035 * amount));
  const radiusY = ry * (1 + rng.jitter(0.035 * amount));
  const start = rng.range(0, Math.PI * 2);
  const overlap = pass === 0 ? increment * rng.range(0.2, 0.7) : increment * rng.range(0.05, 0.3);
  const wobble = Math.min(2.2, Math.max(0.6, Math.min(rx, ry) * 0.04)) * amount * (pass === 0 ? 1 : 0.6);
  const points = [];
  for (let angle = start; angle < start + Math.PI * 2 + overlap; angle += increment) {
    points.push([
      rx + Math.cos(angle) * radiusX + rng.jitter(wobble),
      ry + Math.sin(angle) * radiusY + rng.jitter(wobble),
    ]);
  }
  const segments = catmullRomSegments(points);
  const first = segments[0];
  if (first === undefined) return;
  path.move(first.from[0], first.from[1]);
  for (const segment of segments) {
    path.cubic(segment.c1[0], segment.c1[1], segment.c2[0], segment.c2[1], segment.to[0], segment.to[1]);
  }
};
/* ------------------------------------------------------------------ fills */
/**
 * Scanline hatching clipped to a polygon. Lines run at `angle` (radians),
 * spaced by `gap`. Returns segments in polygon coordinates.
 */
export const hatchSegments = (polygon, gap, angle) => {
  if (polygon.length < 3 || gap <= 0) return [];
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  const rotated = polygon.map(([px, py]) => [px * cos - py * sin, px * sin + py * cos]);
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, py] of rotated) {
    minY = Math.min(minY, py);
    maxY = Math.max(maxY, py);
  }
  const segments = [];
  const back = (px, py) => [px * cos + py * sin, -px * sin + py * cos];
  const lines = Math.floor((maxY - minY) / gap);
  if (lines > 4000) return [];
  const offset = (maxY - minY - lines * gap) / 2;
  for (let y = minY + offset + gap / 2; y < maxY; y += gap) {
    const crossings = [];
    for (let i = 0, j = rotated.length - 1; i < rotated.length; j = i, i += 1) {
      const a = rotated[i];
      const b = rotated[j];
      if (a[1] > y !== b[1] > y) {
        crossings.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
      }
    }
    crossings.sort((left, right) => left - right);
    for (let index = 0; index + 1 < crossings.length; index += 2) {
      const from = crossings[index];
      const to = crossings[index + 1];
      if (to - from < 1) continue;
      segments.push([back(from, y), back(to, y)]);
    }
  }
  return segments;
};
/**
 * Outline polygon of a pressure-sensitive ink stroke. Points are smoothed,
 * the width follows real or simulated (speed-based) pressure, both ends taper
 * and caps are round.
 */
export const inkOutline = (points, pressures, options) => {
  if (points.length === 0) return [];
  const radiusBase = options.size / 2;
  if (points.length === 1 || (points.length === 2 && samePoint(points[0], points[1]))) {
    const [cx, cy] = points[0];
    const circle = [];
    for (let step = 0; step < 16; step += 1) {
      const angle = (step / 16) * Math.PI * 2;
      circle.push([cx + Math.cos(angle) * radiusBase, cy + Math.sin(angle) * radiusBase]);
    }
    return circle;
  }
  // 1. Streamline: chase the input point to smooth jitter.
  const smooth = [points[0]];
  for (let index = 1; index < points.length; index += 1) {
    const previous = smooth[smooth.length - 1];
    const point = points[index];
    const factor = index === points.length - 1 ? 1 : 0.55;
    const next = [previous[0] + (point[0] - previous[0]) * factor, previous[1] + (point[1] - previous[1]) * factor];
    if (Math.hypot(next[0] - previous[0], next[1] - previous[1]) > 0.35) smooth.push(next);
  }
  if (smooth.length === 1) smooth.push(points[points.length - 1]);
  // 2. Distances and pressure.
  const count = smooth.length;
  const running = [0];
  for (let index = 1; index < count; index += 1) {
    const a = smooth[index - 1];
    const b = smooth[index];
    running.push(running[index - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = running[count - 1];
  const pressure = [];
  if (!options.simulatePressure && pressures.length === points.length) {
    // Resample real pressure onto smoothed points by index ratio.
    for (let index = 0; index < count; index += 1) {
      const source = Math.round((index / Math.max(1, count - 1)) * (pressures.length - 1));
      pressure.push(Math.max(0.05, Math.min(1, pressures[source] ?? 0.5)));
    }
  } else {
    let current = 0.5;
    for (let index = 0; index < count; index += 1) {
      const step = index === 0 ? 0 : running[index] - running[index - 1];
      const speed = Math.min(1, step / (options.size * 1.6));
      const target = 1 - speed * 0.9;
      current += (target - current) * 0.28;
      pressure.push(current);
    }
  }
  // 3. Radius per point with tapered ends.
  const taper = Math.min(total * 0.18, options.size * 2.5);
  const radius = [];
  for (let index = 0; index < count; index += 1) {
    const p = pressure[index];
    let r = radiusBase * (1 - options.thinning + options.thinning * p * 1.25);
    const fromStart = running[index];
    const fromEnd = total - fromStart;
    if (taper > 0) {
      const startEase = Math.min(1, fromStart / taper);
      const endEase = Math.min(1, fromEnd / taper);
      r *= 0.45 + 0.55 * Math.min(easeOut(startEase), easeOut(endEase));
    }
    radius.push(Math.max(0.4, r));
  }
  // 4. Offset both sides along the normal.
  const left = [];
  const right = [];
  for (let index = 0; index < count; index += 1) {
    const previous = smooth[Math.max(0, index - 1)];
    const next = smooth[Math.min(count - 1, index + 1)];
    let dx = next[0] - previous[0];
    let dy = next[1] - previous[1];
    const length = Math.hypot(dx, dy) || 1;
    dx /= length;
    dy /= length;
    const point = smooth[index];
    const r = radius[index];
    left.push([point[0] - dy * r, point[1] + dx * r]);
    right.push([point[0] + dy * r, point[1] - dx * r]);
  }
  // 5. Round caps.
  const cap = (center, from, r, reverse) => {
    const start = Math.atan2(from[1] - center[1], from[0] - center[0]);
    const out = [];
    for (let step = 1; step < 8; step += 1) {
      const angle = start + (reverse ? -1 : 1) * (step / 8) * Math.PI;
      out.push([center[0] + Math.cos(angle) * r, center[1] + Math.sin(angle) * r]);
    }
    return out;
  };
  const endCenter = smooth[count - 1];
  const startCenter = smooth[0];
  const endCap = cap(endCenter, left[count - 1], radius[count - 1], true);
  const startCap = cap(startCenter, right[0], radius[0], true);
  return [...left, ...endCap, ...right.reverse(), ...startCap];
};
const samePoint = (a, b) => Math.abs(a[0] - b[0]) < 0.01 && Math.abs(a[1] - b[1]) < 0.01;
const easeOut = (t) => 1 - (1 - t) * (1 - t);
/** Closed smooth path through outline points using midpoint quadratics (as cubics). */
export const smoothClosedPath = (path, outline) => {
  if (outline.length < 3) return;
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const first = mid(outline[outline.length - 1], outline[0]);
  path.move(first[0], first[1]);
  for (let index = 0; index < outline.length; index += 1) {
    const control = outline[index];
    const to = mid(control, outline[(index + 1) % outline.length]);
    const from = index === 0 ? first : mid(outline[index - 1], control);
    // Quadratic (from, control, to) as cubic.
    path.cubic(
      from[0] + (2 / 3) * (control[0] - from[0]),
      from[1] + (2 / 3) * (control[1] - from[1]),
      to[0] + (2 / 3) * (control[0] - to[0]),
      to[1] + (2 / 3) * (control[1] - to[1]),
      to[0],
      to[1],
    );
  }
  path.close();
};
