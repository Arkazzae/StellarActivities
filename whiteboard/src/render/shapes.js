import {
  cornerRadius,
  diamondVertices,
  ellipsePoints,
  linearPath,
  rectVertices,
  roundedPolygon,
} from "../model/geometry.js";
import {
  hatchSegments,
  inkOutline,
  PathData,
  Rng,
  roughCurve,
  roughEllipse,
  roughLine,
  roughRoundedPolygon,
  smoothClosedPath,
} from "./rough.js";
const EMPTY = { paths: [] };
const HATCH_ANGLE = (-41 * Math.PI) / 180;
export const dashPattern = (el) => {
  const width = el.strokeWidth;
  if (el.strokeStyle === "dashed") return [width * 3 + 6, width * 2 + 6];
  if (el.strokeStyle === "dotted") return [0.01, width * 2.5 + 4];
  return null;
};
const sizeScale = (size) => Math.max(0.3, Math.min(1, size / 42));
export const inkSize = (strokeWidth) => strokeWidth * 2.6 + 1.4;
export const arrowheadLength = (el, total) => Math.min(Math.max(10, el.strokeWidth * 4 + 9), total * 0.45);
/** Converts an element into resolution-independent paths in local space. */
export const buildDrawable = (el) => {
  const rng = new Rng(el.seed);
  const dash = dashPattern(el);
  const passes = el.roughness > 0 && dash === null ? 2 : 1;
  const roughness = dash === null ? el.roughness : el.roughness * 0.5;
  const paths = [];
  const stroke = (data, width = el.strokeWidth, lineDash = dash) => {
    if (!data.empty) paths.push({ kind: "stroke", paint: "stroke", width, dash: lineDash, data: data.data });
  };
  switch (el.type) {
    case "rectangle":
    case "diamond": {
      const width = el.width;
      const height = el.height;
      if (Math.abs(width) < 0.5 && Math.abs(height) < 0.5) return EMPTY;
      const options = { roughness, scale: sizeScale(Math.min(Math.abs(width), Math.abs(height))), rng };
      const vertices = el.type === "rectangle" ? rectVertices(width, height) : diamondVertices(width, height);
      const radius = el.rounded ? cornerRadius(width, height) * (el.type === "diamond" ? 0.8 : 1) : 0;
      const outline = radius > 0 ? roundedPolygon(vertices, radius) : vertices;
      if (radius > 0 && el.fillColor !== "transparent" && el.fillStyle === "solid") {
        const data = new PathData();
        roughRoundedPolygon(data, vertices, radius, { ...options, roughness: options.roughness * 0.5 }, 1, true);
        paths.push({ kind: "fill", paint: "fill", width: 0, dash: null, data: data.data });
      } else {
        fillPolygon(paths, el, outline, options, radius > 0);
      }
      for (let pass = 0; pass < passes; pass += 1) {
        const data = new PathData();
        if (radius > 0) {
          roughRoundedPolygon(data, vertices, radius, options, pass);
        } else {
          for (let index = 0; index < vertices.length; index += 1) {
            const a = vertices[index];
            const b = vertices[(index + 1) % vertices.length];
            roughLine(data, a[0], a[1], b[0], b[1], options, pass);
          }
        }
        stroke(data);
      }
      return { paths };
    }
    case "ellipse": {
      if (Math.abs(el.width) < 0.5 && Math.abs(el.height) < 0.5) return EMPTY;
      const options = { roughness, scale: sizeScale(Math.min(Math.abs(el.width), Math.abs(el.height))), rng };
      if (el.fillColor !== "transparent") {
        if (el.fillStyle === "solid") {
          const data = new PathData();
          roughEllipse(data, el.width, el.height, { ...options, roughness: options.roughness * 0.5 }, 1);
          paths.push({ kind: "fill", paint: "fill", width: 0, dash: null, data: data.data });
        } else {
          hatch(paths, el, ellipsePoints(el.width, el.height, 40), options);
        }
      }
      for (let pass = 0; pass < passes; pass += 1) {
        const data = new PathData();
        roughEllipse(data, el.width, el.height, options, pass);
        stroke(data);
      }
      return { paths };
    }
    case "line":
    case "arrow": {
      const points = el.points;
      if (points.length < 2) return EMPTY;
      const path = linearPath(el);
      const total = polylineLength(path);
      const options = { roughness, scale: sizeScale(total), rng };
      const closed =
        el.type === "line" &&
        points.length >= 3 &&
        Math.hypot(points[0][0] - points[points.length - 1][0], points[0][1] - points[points.length - 1][1]) < 1;
      if (closed) fillPolygon(paths, el, path, options, el.rounded);
      for (let pass = 0; pass < passes; pass += 1) {
        const data = new PathData();
        if (el.rounded && points.length >= 3) {
          roughCurve(data, points, options, pass, false);
        } else {
          for (let index = 0; index < points.length - 1; index += 1) {
            const a = points[index];
            const b = points[index + 1];
            roughLine(data, a[0], a[1], b[0], b[1], options, pass);
          }
        }
        stroke(data);
      }
      if (el.type === "arrow") {
        const headLength = arrowheadLength(el, total);
        arrowhead(paths, el, el.endArrow, path, false, headLength, options, passes);
        arrowhead(paths, el, el.startArrow, path, true, headLength, options, passes);
      }
      return { paths };
    }
    case "freedraw": {
      if (el.points.length === 0) return EMPTY;
      const outline = inkOutline(el.points, el.pressures, {
        size: inkSize(el.strokeWidth),
        thinning: 0.62,
        simulatePressure: el.pressures.length === 0,
      });
      const data = new PathData();
      smoothClosedPath(data, outline);
      paths.push({ kind: "fill", paint: "stroke", width: 0, dash: null, data: data.data });
      return { paths };
    }
    default:
      return EMPTY;
  }
};
const fillPolygon = (paths, el, outline, options, smooth) => {
  if (el.fillColor === "transparent") return;
  if (el.fillStyle === "solid") {
    const data = new PathData();
    if (smooth) {
      roughCurve(data, outline, { ...options, roughness: options.roughness * 0.4 }, 1, true);
    } else {
      const wobble = options.roughness * options.scale * 0.8;
      outline.forEach(([px, py], index) => {
        const x = px + options.rng.jitter(wobble);
        const y = py + options.rng.jitter(wobble);
        if (index === 0) data.move(x, y);
        else data.line(x, y);
      });
      data.close();
    }
    paths.push({ kind: "fill", paint: "fill", width: 0, dash: null, data: data.data });
    return;
  }
  hatch(paths, el, outline, options);
};
const hatch = (paths, el, outline, options) => {
  const gap = Math.max(5, el.strokeWidth * 4.5);
  const lineOptions = { ...options, roughness: options.roughness * 0.7 };
  const angles = el.fillStyle === "cross" ? [HATCH_ANGLE, HATCH_ANGLE + Math.PI / 2] : [HATCH_ANGLE];
  for (const angle of angles) {
    const data = new PathData();
    for (const [from, to] of hatchSegments(outline, gap, angle)) {
      roughLine(data, from[0], from[1], to[0], to[1], lineOptions, 1);
    }
    if (!data.empty) {
      paths.push({
        kind: "stroke",
        paint: "hatch",
        width: Math.max(1.25, el.strokeWidth * 0.6),
        dash: null,
        data: data.data,
      });
    }
  }
};
const polylineLength = (points) => {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1];
    const b = points[index];
    total += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return total;
};
/** Direction at an end of a path, sampled a little way back for curves. */
const endDirection = (path, atStart, reach) => {
  const ordered = atStart ? path.slice().reverse() : path;
  const tip = ordered[ordered.length - 1];
  let back = ordered[ordered.length - 2];
  let travelled = 0;
  for (let index = ordered.length - 2; index >= 0; index -= 1) {
    const point = ordered[index];
    const next = ordered[index + 1];
    travelled += Math.hypot(next[0] - point[0], next[1] - point[1]);
    back = point;
    if (travelled >= reach) break;
  }
  return { tip, angle: Math.atan2(tip[1] - back[1], tip[0] - back[0]) };
};
const arrowhead = (paths, el, kind, path, atStart, length, options, passes) => {
  if (kind === "none" || path.length < 2) return;
  const { tip, angle } = endDirection(path, atStart, length * 0.6);
  const spread = kind === "triangle" ? 0.42 : 0.5;
  const wing = (side) => [
    tip[0] - Math.cos(angle + side * spread) * length,
    tip[1] - Math.sin(angle + side * spread) * length,
  ];
  const headOptions = { ...options, roughness: options.roughness * 0.6, scale: Math.min(options.scale, 0.6) };
  switch (kind) {
    case "arrow": {
      for (let pass = 0; pass < passes; pass += 1) {
        const data = new PathData();
        const left = wing(1);
        const right = wing(-1);
        roughLine(data, left[0], left[1], tip[0], tip[1], headOptions, pass);
        roughLine(data, right[0], right[1], tip[0], tip[1], headOptions, pass);
        paths.push({ kind: "stroke", paint: "stroke", width: el.strokeWidth, dash: null, data: data.data });
      }
      return;
    }
    case "triangle": {
      const left = wing(1);
      const right = wing(-1);
      const data = new PathData().move(tip[0], tip[1]).line(left[0], left[1]).line(right[0], right[1]).close();
      paths.push({ kind: "fill", paint: "stroke", width: 0, dash: null, data: data.data });
      paths.push({ kind: "stroke", paint: "stroke", width: el.strokeWidth, dash: null, data: data.data });
      return;
    }
    case "dot": {
      const radius = Math.max(3, length * 0.28);
      const cx = tip[0] - Math.cos(angle) * radius * 0.6;
      const cy = tip[1] - Math.sin(angle) * radius * 0.6;
      const data = new PathData();
      const points = [];
      for (let step = 0; step < 14; step += 1) {
        const a = (step / 14) * Math.PI * 2;
        points.push([cx + Math.cos(a) * radius, cy + Math.sin(a) * radius]);
      }
      smoothClosedPath(data, points);
      paths.push({ kind: "fill", paint: "stroke", width: 0, dash: null, data: data.data });
      return;
    }
    case "bar": {
      const half = length * 0.55;
      const nx = -Math.sin(angle);
      const ny = Math.cos(angle);
      for (let pass = 0; pass < passes; pass += 1) {
        const data = new PathData();
        roughLine(
          data,
          tip[0] + nx * half,
          tip[1] + ny * half,
          tip[0] - nx * half,
          tip[1] - ny * half,
          headOptions,
          pass,
        );
        paths.push({ kind: "stroke", paint: "stroke", width: el.strokeWidth, dash: null, data: data.data });
      }
      return;
    }
  }
};
