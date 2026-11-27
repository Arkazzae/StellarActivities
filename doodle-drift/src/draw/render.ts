import { getStroke } from "perfect-freehand";
import { CANVAS_H, CANVAS_W } from "../game/types.ts";
import type { Rect } from "../game/types.ts";

export type Tool = "pen" | "brush" | "marker" | "eraser" | "fill" | "line" | "rect" | "ellipse";

export interface StrokeOp {
  /** Kaleidoscope copies this op was drawn with. */
  m?: number;
  t: "stroke";
  tool: "pen" | "brush" | "marker" | "eraser";
  color: string;
  size: number;
  /** x, y, pressure triples. */
  points: number[];
  simulate: boolean;
}

export interface ShapeOp {
  /** Kaleidoscope copies this op was drawn with. */
  m?: number;
  t: "shape";
  tool: "line" | "rect" | "ellipse";
  color: string;
  size: number;
  a: [number, number];
  b: [number, number];
}

export interface FillOp {
  /** Kaleidoscope copies this op was drawn with. */
  m?: number;
  t: "fill";
  color: string;
  x: number;
  y: number;
}

export interface StarOp {
  t: "star";
  color: string;
  size: number;
  a: [number, number];
  b: [number, number];
}

export type Op = StrokeOp | ShapeOp | FillOp | StarOp;

export interface RenderOptions {
  clip?: Rect | null;
  mirrors?: number;
  /** Paints background, locked layers and the user layer so far, for the fill tool. */
  composite?: () => CanvasRenderingContext2D;
}

export const SIZES = [4, 9, 18, 30];

const CX = CANVAS_W / 2;
const CY = CANVAS_H / 2;

function triples(points: number[]): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < points.length; i += 3) out.push([points[i], points[i + 1], points[i + 2]]);
  return out;
}

function polygonPath(ctx: CanvasRenderingContext2D, outline: number[][]) {
  if (!outline.length) return;
  ctx.beginPath();
  ctx.moveTo(outline[0][0], outline[0][1]);
  for (let i = 1; i < outline.length; i++) {
    const [x0, y0] = outline[i];
    const [x1, y1] = outline[(i + 1) % outline.length];
    ctx.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
  }
  ctx.closePath();
}

function drawStroke(ctx: CanvasRenderingContext2D, op: StrokeOp) {
  const pts = triples(op.points);
  if (!pts.length) return;
  ctx.save();
  if (op.tool === "pen" || op.tool === "brush") {
    const outline = getStroke(pts, {
      size: op.tool === "brush" ? op.size * 1.7 : op.size,
      thinning: op.tool === "brush" ? 0.7 : 0.5,
      smoothing: 0.55,
      streamline: 0.45,
      simulatePressure: op.simulate,
      last: true,
    });
    ctx.fillStyle = op.color;
    if (op.tool === "brush") ctx.globalAlpha = 0.9;
    polygonPath(ctx, outline);
    ctx.fill();
  } else {
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = op.tool === "eraser" ? op.size * 2.2 : op.size * 1.5;
    if (op.tool === "eraser") ctx.globalCompositeOperation = "destination-out";
    else {
      ctx.strokeStyle = op.color;
      ctx.globalAlpha = 0.45;
    }
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    if (pts.length === 1) ctx.lineTo(pts[0][0] + 0.1, pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  }
  ctx.restore();
}

function drawShape(ctx: CanvasRenderingContext2D, op: ShapeOp | StarOp) {
  const [ax, ay] = op.a;
  const [bx, by] = op.b;
  ctx.save();
  ctx.strokeStyle = op.color;
  ctx.lineWidth = op.size;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  if (op.t === "star" || op.tool === "line") {
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
  } else if (op.tool === "rect") {
    ctx.rect(Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay));
  } else {
    ctx.ellipse((ax + bx) / 2, (ay + by) / 2, Math.abs(bx - ax) / 2, Math.abs(by - ay) / 2, 0, 0, Math.PI * 2);
  }
  ctx.stroke();
  ctx.restore();
}

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Flood the region under (x, y) on the composite and paint it into the user layer. */
function fillRegion(ctx: CanvasRenderingContext2D, op: FillOp, options: RenderOptions, points: [number, number][]) {
  const composite = options.composite?.();
  if (!composite) return;
  const w = CANVAS_W;
  const h = CANVAS_H;
  const src = composite.getImageData(0, 0, w, h).data;
  const out = ctx.getImageData(0, 0, w, h);
  const dst = out.data;
  const [r, g, b] = parseHex(op.color);
  const clip = options.clip;
  const minX = clip ? Math.max(0, Math.floor(clip.x)) : 0;
  const minY = clip ? Math.max(0, Math.floor(clip.y)) : 0;
  const maxX = clip ? Math.min(w, Math.ceil(clip.x + clip.w)) : w;
  const maxY = clip ? Math.min(h, Math.ceil(clip.y + clip.h)) : h;
  const seen = new Uint8Array(w * h);
  for (const [sx, sy] of points) {
    const x0 = Math.round(sx);
    const y0 = Math.round(sy);
    if (x0 < minX || y0 < minY || x0 >= maxX || y0 >= maxY) continue;
    const start = (y0 * w + x0) * 4;
    const tr = src[start], tg = src[start + 1], tb = src[start + 2], ta = src[start + 3];
    const close = (i: number) =>
      Math.abs(src[i] - tr) + Math.abs(src[i + 1] - tg) + Math.abs(src[i + 2] - tb) + Math.abs(src[i + 3] - ta) < 90;
    const stack = [x0, y0];
    while (stack.length) {
      const y = stack.pop()!;
      const x = stack.pop()!;
      if (x < minX || y < minY || x >= maxX || y >= maxY) continue;
      const p = y * w + x;
      if (seen[p]) continue;
      const i = p * 4;
      if (!close(i)) continue;
      seen[p] = 1;
      dst[i] = r; dst[i + 1] = g; dst[i + 2] = b; dst[i + 3] = 255;
      stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
    }
  }
  // Grow the fill by one pixel so it tucks under anti-aliased edges.
  for (let y = minY + 1; y < maxY - 1; y++) {
    for (let x = minX + 1; x < maxX - 1; x++) {
      const p = y * w + x;
      if (seen[p]) continue;
      if (seen[p - 1] || seen[p + 1] || seen[p - w] || seen[p + w]) {
        const i = p * 4;
        if (dst[i + 3] === 0) { dst[i] = r; dst[i + 1] = g; dst[i + 2] = b; dst[i + 3] = 255; }
      }
    }
  }
  ctx.putImageData(out, 0, 0);
}

function rotatePoint(x: number, y: number, angle: number): [number, number] {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [CX + (x - CX) * cos - (y - CY) * sin, CY + (x - CX) * sin + (y - CY) * cos];
}

/** Draw one op into the user layer, repeated around the centre for the kaleidoscope. */
export function renderOp(ctx: CanvasRenderingContext2D, op: Op, options: RenderOptions = {}) {
  const copies = Math.max(1, ("m" in op && op.m) || options.mirrors || 1);
  if (op.t === "fill") {
    const points: [number, number][] = [];
    for (let k = 0; k < copies; k++) points.push(rotatePoint(op.x, op.y, (k * Math.PI * 2) / copies));
    fillRegion(ctx, op, options, points);
    return;
  }
  ctx.save();
  if (options.clip) {
    ctx.beginPath();
    ctx.rect(options.clip.x, options.clip.y, options.clip.w, options.clip.h);
    ctx.clip();
  }
  for (let k = 0; k < copies; k++) {
    ctx.save();
    if (k > 0) {
      ctx.translate(CX, CY);
      ctx.rotate((k * Math.PI * 2) / copies);
      ctx.translate(-CX, -CY);
    }
    if (op.t === "stroke") drawStroke(ctx, op);
    else drawShape(ctx, op);
    ctx.restore();
  }
  ctx.restore();
}

export function renderAll(ctx: CanvasRenderingContext2D, ops: Op[], options: RenderOptions = {}) {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  for (const op of ops) renderOp(ctx, op, options);
}

export function makeCanvas(w = CANVAS_W, h = CANVAS_H): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  return canvas;
}
