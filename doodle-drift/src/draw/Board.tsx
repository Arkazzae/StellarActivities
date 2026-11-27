import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { Star } from "../game/rules.ts";
import { CANVAS_H, CANVAS_W } from "../game/types.ts";
import type { Rect } from "../game/types.ts";
import { bitmapOf } from "../net/image.ts";
import type { Bits } from "../net/image.ts";
import { makeCanvas, renderAll, renderOp } from "./render.ts";
import type { Op, Tool } from "./render.ts";

export interface BoardHandle {
  undo(): void;
  redo(): void;
  clear(): void;
  /** Flattened picture (background, locked layers, ink) or just the ink layer. */
  exportCanvas(output: "flat" | "layer"): HTMLCanvasElement;
  count(): number;
  /** Stars: start a new line from the next star tapped. */
  breakLine(): void;
}

export interface Strip {
  bits: Bits;
  /** Where the neighbour's tile sits on the canvas. */
  rect: Rect;
}

export interface BoardInfo {
  count: number;
  canUndo: boolean;
  canRedo: boolean;
  drawing: boolean;
}

interface BoardProps {
  tool: Tool;
  color: string;
  size: number;
  label: string;
  base?: Bits[];
  hole?: Rect | null;
  /** Only this region of the locked layers shows; the rest of the canvas outside `clip` is covered. */
  peek?: Rect | null;
  cover?: boolean;
  onion?: Bits | null;
  showOnion?: boolean;
  clip?: Rect | null;
  mirrors?: number;
  oneLine?: boolean;
  blind?: boolean;
  /** Text on the cover shown while drawing blind. */
  veil?: string;
  stars?: Star[] | null;
  strips?: Strip[];
  disabled?: boolean;
  onChange?: (info: BoardInfo) => void;
  onStrokeEnd?: () => void;
  onFirstTouch?: () => void;
}

const PAPER = "#e8d6b2";
const NIGHT = "#0b1a33";
const STRIP = 26;

function stripsFor(mine: Rect, other: Rect): Rect[] {
  const out: Rect[] = [];
  const overlapY = [Math.max(mine.y, other.y), Math.min(mine.y + mine.h, other.y + other.h)];
  const overlapX = [Math.max(mine.x, other.x), Math.min(mine.x + mine.w, other.x + other.w)];
  if (Math.abs(other.x + other.w - mine.x) < 2 && overlapY[1] > overlapY[0]) out.push({ x: mine.x - STRIP, y: overlapY[0], w: STRIP, h: overlapY[1] - overlapY[0] });
  if (Math.abs(mine.x + mine.w - other.x) < 2 && overlapY[1] > overlapY[0]) out.push({ x: other.x, y: overlapY[0], w: STRIP, h: overlapY[1] - overlapY[0] });
  if (Math.abs(other.y + other.h - mine.y) < 2 && overlapX[1] > overlapX[0]) out.push({ x: overlapX[0], y: mine.y - STRIP, w: overlapX[1] - overlapX[0], h: STRIP });
  if (Math.abs(mine.y + mine.h - other.y) < 2 && overlapX[1] > overlapX[0]) out.push({ x: overlapX[0], y: other.y, w: overlapX[1] - overlapX[0], h: STRIP });
  return out;
}

export const Board = forwardRef<BoardHandle, BoardProps>(function Board(props, ref) {
  const { tool, color, size, label, base = [], hole, peek, cover, onion, showOnion = true, clip, mirrors = 1, oneLine, blind, veil, stars, strips = [], disabled } = props;
  const baseRef = useRef<HTMLCanvasElement>(null);
  const userRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const ops = useRef<Op[]>([]);
  const redo = useRef<Op[]>([]);
  const live = useRef<Op | null>(null);
  const lastStar = useRef<Star | null>(null);
  const touched = useRef(false);
  const baseImages = useRef<ImageBitmap[]>([]);
  const onionRef = useRef<HTMLCanvasElement>(null);
  const [focusStar, setFocusStar] = useState<Star | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const callbacks = useRef(props);
  callbacks.current = props;

  const options = useCallback(() => ({
    clip: clip ?? null,
    mirrors,
    composite: () => {
      const canvas = makeCanvas();
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      if (baseRef.current) ctx.drawImage(baseRef.current, 0, 0);
      if (userRef.current) ctx.drawImage(userRef.current, 0, 0);
      return ctx;
    },
  }), [clip, mirrors]);

  const report = useCallback((drawing = false) => {
    callbacks.current.onChange?.({ count: ops.current.length, canUndo: ops.current.length > 0, canRedo: redo.current.length > 0, drawing });
  }, []);

  const redraw = useCallback(() => {
    const ctx = userRef.current?.getContext("2d", { willReadFrequently: true });
    if (ctx) renderAll(ctx, ops.current, options());
  }, [options]);

  // Paint the background, locked layers, covers and neighbour strips.
  const paintBase = useCallback(() => {
    const ctx = baseRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.save();
    ctx.fillStyle = stars ? NIGHT : "#ffffff";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    if (peek) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(peek.x, peek.y, peek.w, peek.h);
      ctx.clip();
      for (const img of baseImages.current) ctx.drawImage(img, 0, 0, CANVAS_W, CANVAS_H);
      ctx.restore();
    } else {
      for (const img of baseImages.current) ctx.drawImage(img, 0, 0, CANVAS_W, CANVAS_H);
    }
    if (hole) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(hole.x, hole.y, hole.w, hole.h);
    }
    if (cover && clip) {
      ctx.fillStyle = PAPER;
      ctx.beginPath();
      ctx.rect(0, 0, CANVAS_W, CANVAS_H);
      ctx.rect(clip.x, clip.y + clip.h, clip.w, -clip.h);
      if (peek) ctx.rect(peek.x, peek.y + peek.h, peek.w, -peek.h);
      ctx.fill("evenodd");
    }
    if (stars) {
      ctx.fillStyle = "#fff5df";
      for (const star of stars) {
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }, [stars, peek, hole, cover, clip]);

  useEffect(() => {
    let cancelled = false;
    Promise.all(base.map((bits) => bitmapOf(bits).catch(() => null))).then((images) => {
      if (cancelled) return;
      baseImages.current = images.filter((img): img is ImageBitmap => !!img);
      paintBase();
    });
    paintBase();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base.map((b) => b.hash).join("|"), paintBase]);

  useEffect(() => {
    const canvas = onionRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    if (!onion) return;
    let cancelled = false;
    bitmapOf(onion).then((bitmap) => { if (!cancelled) ctx.drawImage(bitmap, 0, 0, CANVAS_W, CANVAS_H); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [onion]);

  // Neighbour strips (mosaic) are painted onto the base each time a snapshot arrives.
  useEffect(() => {
    if (!strips.length || !clip) return;
    let cancelled = false;
    Promise.all(strips.map((strip) => bitmapOf(strip.bits).then((img) => ({ img, rect: strip.rect })).catch(() => null))).then((loaded) => {
      if (cancelled) return;
      paintBase();
      const ctx = baseRef.current?.getContext("2d");
      if (!ctx) return;
      for (const item of loaded) {
        if (!item) continue;
        for (const strip of stripsFor(clip, item.rect)) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(strip.x, strip.y, strip.w, strip.h);
          ctx.clip();
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(strip.x, strip.y, strip.w, strip.h);
          ctx.drawImage(item.img, item.rect.x, item.rect.y, item.rect.w, item.rect.h);
          ctx.restore();
        }
      }
    });
    return () => { cancelled = true; };
  }, [strips, clip, paintBase]);

  useImperativeHandle(ref, () => ({
    undo() {
      const op = ops.current.pop();
      if (!op) return;
      redo.current.push(op);
      lastStar.current = null;
      redraw();
      report();
    },
    redo() {
      const op = redo.current.pop();
      if (!op) return;
      ops.current.push(op);
      redraw();
      report();
    },
    clear() {
      ops.current = [];
      redo.current = [];
      lastStar.current = null;
      setFocusStar(null);
      redraw();
      report();
    },
    exportCanvas(output) {
      const canvas = makeCanvas();
      const ctx = canvas.getContext("2d")!;
      if (output === "flat") {
        ctx.fillStyle = stars ? NIGHT : "#ffffff";
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        for (const img of baseImages.current) ctx.drawImage(img, 0, 0, CANVAS_W, CANVAS_H);
        if (hole) {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(hole.x, hole.y, hole.w, hole.h);
        }
        if (stars) {
          ctx.fillStyle = "#fff5df";
          for (const star of stars) {
            ctx.beginPath();
            ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      if (userRef.current) ctx.drawImage(userRef.current, 0, 0);
      return canvas;
    },
    count: () => ops.current.length,
    breakLine() {
      lastStar.current = null;
      setFocusStar(null);
    },
  }), [redraw, report, stars, hole]);

  const toCanvas = (event: ReactPointerEvent) => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * CANVAS_W,
      y: ((event.clientY - rect.top) / rect.height) * CANVAS_H,
      p: event.pointerType === "pen" ? event.pressure || 0.5 : 0.5,
    };
  };

  const commit = (op: Op) => {
    if (op.t !== "star") op.m = mirrors;
    ops.current.push(op);
    redo.current = [];
    const ctx = userRef.current?.getContext("2d", { willReadFrequently: true });
    if (ctx) renderOp(ctx, op, options());
    report();
  };

  const showPreview = () => {
    const ctx = previewRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    if (live.current) renderOp(ctx, live.current, { clip: clip ?? null, mirrors });
  };

  const onPointerDown = (event: ReactPointerEvent) => {
    if (disabled || event.button > 0) return;
    if (oneLine && ops.current.length > 0) return;
    const { x, y, p } = toCanvas(event);
    if (!touched.current) {
      touched.current = true;
      callbacks.current.onFirstTouch?.();
    }
    if (stars) {
      const hit = stars.reduce<{ star: Star | null; d: number }>((best, star) => {
        const d = Math.hypot(star.x - x, star.y - y);
        return d < best.d ? { star, d } : best;
      }, { star: null, d: 40 }).star;
      if (!hit) return;
      if (lastStar.current && lastStar.current !== hit) {
        commit({ t: "star", color, size: size >= 9 ? 9 : 5, a: [lastStar.current.x, lastStar.current.y], b: [hit.x, hit.y] });
      }
      lastStar.current = hit;
      setFocusStar(hit);
      return;
    }
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    if (tool === "fill") {
      commit({ t: "fill", color, x, y });
      callbacks.current.onStrokeEnd?.();
      return;
    }
    if (tool === "line" || tool === "rect" || tool === "ellipse") {
      live.current = { t: "shape", tool, color, size, a: [x, y], b: [x, y] };
    } else {
      live.current = { t: "stroke", tool, color, size, points: [x, y, p], simulate: event.pointerType !== "pen" };
    }
    showPreview();
    report(true);
  };

  const onPointerMove = (event: ReactPointerEvent) => {
    const point = toCanvas(event);
    setCursor({ x: point.x, y: point.y });
    const op = live.current;
    if (!op) return;
    if (op.t === "shape") {
      let { x, y } = point;
      if (event.shiftKey && op.tool !== "line") {
        const d = Math.max(Math.abs(x - op.a[0]), Math.abs(y - op.a[1]));
        x = op.a[0] + Math.sign(x - op.a[0]) * d;
        y = op.a[1] + Math.sign(y - op.a[1]) * d;
      }
      op.b = [x, y];
    } else if (op.t === "stroke") {
      const events = (event.nativeEvent as PointerEvent).getCoalescedEvents?.() ?? [];
      if (events.length > 1) {
        const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
        for (const e of events) op.points.push(((e.clientX - rect.left) / rect.width) * CANVAS_W, ((e.clientY - rect.top) / rect.height) * CANVAS_H, point.p);
      } else op.points.push(point.x, point.y, point.p);
    }
    showPreview();
  };

  const onPointerUp = () => {
    const op = live.current;
    if (!op) return;
    live.current = null;
    showPreview();
    commit(op);
    callbacks.current.onStrokeEnd?.();
  };

  const axes = mirrors > 1 ? [...Array(mirrors).keys()].map((k) => (k * 360) / mirrors) : [];

  return (
    <div className={`board${stars ? " board-night" : ""}${disabled ? " is-disabled" : ""}`}>
      <canvas ref={baseRef} width={CANVAS_W} height={CANVAS_H} className="board-layer" aria-hidden="true" />
      <canvas ref={onionRef} width={CANVAS_W} height={CANVAS_H} className="board-layer board-onion" style={{ visibility: onion && showOnion ? "visible" : "hidden" }} aria-hidden="true" />
      <canvas ref={userRef} width={CANVAS_W} height={CANVAS_H} className="board-layer" style={blind ? { visibility: "hidden" } : undefined} aria-hidden="true" />
      <canvas ref={previewRef} width={CANVAS_W} height={CANVAS_H} className="board-layer" style={blind ? { visibility: "hidden" } : undefined} aria-hidden="true" />
      {blind ? (
        <div className="board-veil" aria-hidden="true">
          <div>
            <svg viewBox="0 0 24 24" width="46" height="46" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3l18 18" /><path d="M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.2 6.3C3.6 8 2 12 2 12s3.5 7 10 7a9.6 9.6 0 0 0 4.3-1" /></svg>
            <div>{veil}</div>
          </div>
        </div>
      ) : null}
      <svg className="board-layer board-guides" viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`} aria-hidden="true">
        {axes.map((angle) => (
          <line key={angle} x1={CANVAS_W / 2} y1={CANVAS_H / 2} x2={CANVAS_W / 2} y2={-400} transform={`rotate(${angle} ${CANVAS_W / 2} ${CANVAS_H / 2})`} className="guide-axis" />
        ))}
        {clip && (cover || hole) ? <rect x={clip.x} y={clip.y} width={clip.w} height={clip.h} className="guide-clip" /> : null}
        {focusStar ? <circle cx={focusStar.x} cy={focusStar.y} r={20} className="guide-star" /> : null}
        {focusStar ? <circle cx={focusStar.x} cy={focusStar.y} r={9} className="guide-star-dot" /> : null}
        {blind && cursor ? <circle cx={cursor.x} cy={cursor.y} r={8} className="guide-blind" /> : null}
      </svg>
      <div
        className="board-input"
        role="img"
        aria-label={label}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => setCursor(null)}
        onContextMenu={(event) => event.preventDefault()}
      />
    </div>
  );
});
