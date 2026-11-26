import { HANDLE_SIZE, midpoints } from "../editor/handles.js";
import { boxesIntersect, elementBounds, expandBox, shapeOutline, toWorld } from "../model/geometry.js";
import { canHoldLabel, isLinear } from "../model/types.js";
import { deepen, paintColor, withAlpha } from "./color.js";
import { forEachOp } from "./rough.js";
import { buildDrawable } from "./shapes.js";
import { fontString, labelLayout, LINE_HEIGHT } from "./text.js";
/** Laser trails use the brand's tomato red; selection uses the accent. */
const LASER = "#e8452c";
export const visibleBox = (viewport) => ({
  minX: -viewport.scrollX,
  minY: -viewport.scrollY,
  maxX: -viewport.scrollX + viewport.width / viewport.zoom,
  maxY: -viewport.scrollY + viewport.height / viewport.zoom,
});
export const toPath2D = (data) => {
  const path = new Path2D();
  forEachOp(data, {
    move: (x, y) => path.moveTo(x, y),
    line: (x, y) => path.lineTo(x, y),
    cubic: (x1, y1, x2, y2, x, y) => path.bezierCurveTo(x1, y1, x2, y2, x, y),
    close: () => path.closePath(),
  });
  return path;
};
const metricsCache = new Map();
/** Baseline offset inside a CSS line box, so canvas text matches the textarea. */
export const baselineOffset = (ctx, font, size) => {
  let metrics = metricsCache.get(font);
  if (metrics === undefined) {
    ctx.font = font;
    const measured = ctx.measureText("Mgłąy");
    const ascent = measured.fontBoundingBoxAscent ?? size * 0.8;
    const descent = measured.fontBoundingBoxDescent ?? size * 0.2;
    metrics = { ascent, descent };
    if (Number.isFinite(ascent) && ascent > 0) metricsCache.set(font, metrics);
  }
  const lineHeight = size * LINE_HEIGHT;
  return (lineHeight - (metrics.ascent + metrics.descent)) / 2 + metrics.ascent;
};
export const clearMetricsCache = () => metricsCache.clear();
export class Renderer {
  #store;
  #images;
  #cache = new Map();
  constructor(store, images) {
    this.#store = store;
    this.#images = images;
  }
  /** Drops cache entries of deleted elements. */
  prune() {
    for (const id of this.#cache.keys()) if (!this.#store.has(id)) this.#cache.delete(id);
  }
  #entry(el, draft) {
    const rev = draft ? -1 : this.#store.rev(el.id);
    const cached = this.#cache.get(el.id);
    if (!draft && cached !== undefined && cached.rev === rev) return cached;
    const drawable = buildDrawable(el);
    const entry = { rev, drawable, paths: drawable.paths.map((path) => toPath2D(path.data)) };
    if (!draft) this.#cache.set(el.id, entry);
    return entry;
  }
  drawScene(ctx, viewport, options) {
    const { dpr, zoom } = viewport;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const width = viewport.width * dpr;
    const height = viewport.height * dpr;
    if (options.background === null) {
      ctx.clearRect(0, 0, width, height);
    } else {
      ctx.fillStyle = paintColor(options.background, options.dark);
      ctx.fillRect(0, 0, width, height);
    }
    if (options.grid) this.#drawGrid(ctx, viewport, options.dark);
    ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, dpr * zoom * viewport.scrollX, dpr * zoom * viewport.scrollY);
    const visible = expandBox(visibleBox(viewport), 40 / zoom);
    for (const base of this.#store.ordered()) {
      // Someone is dragging this element right now: draw their live preview.
      const override = options.overrides?.get(base.id);
      const el = override ?? base;
      if (!boxesIntersect(elementBounds(el), visible)) continue;
      this.drawElement(ctx, el, options.dark, {
        faded: options.fadedIds.has(el.id),
        hideText: options.hiddenTextId === el.id,
        draft: override !== undefined,
      });
    }
    for (const draft of options.drafts) {
      this.drawElement(ctx, draft, options.dark, { faded: false, hideText: false, draft: true });
    }
  }
  #drawGrid(ctx, viewport, dark) {
    const { zoom, dpr } = viewport;
    let step = 20;
    while (step * zoom < 12) step *= 5;
    const major = step * 5;
    const box = visibleBox(viewport);
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = 1;
    const minor = dark ? "rgba(255,255,255,0.05)" : "rgba(31,29,26,0.06)";
    const strong = dark ? "rgba(255,255,255,0.1)" : "rgba(31,29,26,0.11)";
    for (let pass = 0; pass < 2; pass += 1) {
      ctx.beginPath();
      for (let x = Math.floor(box.minX / step) * step; x <= box.maxX; x += step) {
        const isMajor = Math.abs(x % major) < 0.001;
        if ((pass === 1) !== isMajor) continue;
        const sx = Math.round((x + viewport.scrollX) * zoom) + 0.5;
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, viewport.height);
      }
      for (let y = Math.floor(box.minY / step) * step; y <= box.maxY; y += step) {
        const isMajor = Math.abs(y % major) < 0.001;
        if ((pass === 1) !== isMajor) continue;
        const sy = Math.round((y + viewport.scrollY) * zoom) + 0.5;
        ctx.moveTo(0, sy);
        ctx.lineTo(viewport.width, sy);
      }
      ctx.strokeStyle = pass === 0 ? minor : strong;
      ctx.stroke();
    }
    ctx.restore();
  }
  drawElement(ctx, el, dark, flags) {
    ctx.save();
    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;
    ctx.translate(cx, cy);
    if (el.angle !== 0) ctx.rotate(el.angle);
    ctx.translate(-el.width / 2, -el.height / 2);
    ctx.globalAlpha = (el.opacity / 100) * (flags.faded ? 0.28 : 1);
    if (el.type === "image") {
      this.#drawImage(ctx, el, dark);
    } else {
      const entry = this.#entry(el, flags.draft);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      entry.drawable.paths.forEach((path, index) => {
        const color = paintColor(
          path.paint === "stroke" ? el.strokeColor : path.paint === "hatch" ? deepen(el.fillColor) : el.fillColor,
          dark,
        );
        const path2d = entry.paths[index];
        if (path.kind === "fill") {
          ctx.fillStyle = color;
          ctx.fill(path2d);
        } else {
          ctx.strokeStyle = color;
          ctx.lineWidth = path.width;
          ctx.setLineDash(path.dash ?? []);
          ctx.stroke(path2d);
        }
      });
      ctx.setLineDash([]);
    }
    if (!flags.hideText && el.text.length > 0) {
      if (el.type === "text") this.#drawText(ctx, el, dark);
      else if (canHoldLabel(el)) this.#drawLabel(ctx, el, dark);
    }
    ctx.restore();
  }
  #drawImage(ctx, el, dark) {
    const image = this.#images.get(el.fileId);
    if (image !== null) {
      ctx.drawImage(image, 0, 0, el.width, el.height);
      return;
    }
    ctx.fillStyle = dark ? "#2b2925" : "#ebe6da";
    ctx.fillRect(0, 0, el.width, el.height);
    ctx.strokeStyle = dark ? "#57524a" : "#b9b1a1";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 6]);
    ctx.strokeRect(0, 0, el.width, el.height);
    ctx.setLineDash([]);
  }
  #drawText(ctx, el, dark) {
    const font = fontString(el.fontFamily, el.fontSize);
    ctx.font = font;
    ctx.fillStyle = paintColor(el.strokeColor, dark);
    ctx.textBaseline = "alphabetic";
    const lineHeight = el.fontSize * LINE_HEIGHT;
    const baseline = baselineOffset(ctx, font, el.fontSize);
    ctx.font = font;
    const x = el.textAlign === "left" ? 0 : el.textAlign === "center" ? el.width / 2 : el.width;
    ctx.textAlign = el.textAlign;
    el.text.split("\n").forEach((line, index) => {
      ctx.fillText(line, x, index * lineHeight + baseline);
    });
  }
  #drawLabel(ctx, el, dark) {
    const font = fontString(el.fontFamily, el.fontSize);
    const box = labelLayout(el);
    const lines = box.lines;
    const lineHeight = el.fontSize * LINE_HEIGHT;
    const top = box.y;
    const baseline = baselineOffset(ctx, font, el.fontSize);
    ctx.font = font;
    ctx.fillStyle = paintColor(el.strokeColor, dark);
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = el.textAlign;
    const x = el.textAlign === "left" ? box.x : el.textAlign === "center" ? box.x + box.width / 2 : box.x + box.width;
    lines.forEach((line, index) => ctx.fillText(line, x, top + index * lineHeight + baseline));
  }
  /* --------------------------------------------------------------- overlay */
  drawOverlay(ctx, viewport, state) {
    const { dpr, zoom } = viewport;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, viewport.width * dpr, viewport.height * dpr);
    ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, dpr * zoom * viewport.scrollX, dpr * zoom * viewport.scrollY);
    const px = 1 / zoom;
    // Remote selections.
    for (const peer of state.peers) {
      for (const el of peer.selected) {
        this.#outlineElement(ctx, el, peer.color, 1.5 * px, [5 * px, 4 * px], 4 * px);
      }
    }
    if (state.bindTarget !== null) {
      ctx.save();
      ctx.globalAlpha = 0.35;
      this.#outlineShape(ctx, state.bindTarget, state.accent, 5 * px);
      ctx.restore();
    }
    // Own selection.
    if (state.selection.length > 1) {
      for (const el of state.selection) this.#outlineElement(ctx, el, withAlpha(state.accent, 0.55), px, null, 3 * px);
    }
    if (state.frame !== null && state.pointHandles === null) {
      this.#drawFrame(ctx, state.frame, state.accent, zoom);
    }
    if (state.handles !== null) {
      for (const [id, position] of state.handles) this.#drawHandle(ctx, id, position, state, zoom);
    }
    if (state.pointHandles !== null) this.#drawPointHandles(ctx, state.pointHandles, state, zoom);
    if (state.marquee !== null) {
      const box = state.marquee;
      ctx.fillStyle = withAlpha(state.accent, 0.07);
      ctx.fillRect(box.minX, box.minY, box.maxX - box.minX, box.maxY - box.minY);
      ctx.strokeStyle = withAlpha(state.accent, 0.8);
      ctx.lineWidth = px;
      ctx.strokeRect(box.minX, box.minY, box.maxX - box.minX, box.maxY - box.minY);
    }
    this.#drawTrail(ctx, state.eraserTrail, "rgba(120,116,108,0.5)", 7 * px, state.now, 260);
    this.#drawTrail(ctx, state.laserTrail, LASER, 4 * px, state.now, 900, true);
    for (const peer of state.peers) {
      if (peer.trail.length > 0) this.#drawTrail(ctx, peer.trail, peer.color, 4 * px, state.now, 900, true);
    }
    // Remote cursors in screen space.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const peer of state.peers) {
      if (peer.cursor === null) continue;
      const sx = (peer.cursor.x + viewport.scrollX) * zoom;
      const sy = (peer.cursor.y + viewport.scrollY) * zoom;
      if (sx < -40 || sy < -40 || sx > viewport.width + 40 || sy > viewport.height + 40) continue;
      this.#drawCursor(ctx, sx, sy, peer);
    }
  }
  #outlineShape(ctx, el, color, width) {
    const outline = shapeOutline(el);
    if (outline === null) return;
    ctx.beginPath();
    outline.forEach(([lx, ly], index) => {
      const p = toWorld(el, lx, ly);
      if (index === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.closePath();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }
  #outlineElement(ctx, el, color, width, dash, pad) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dash ?? []);
    if (isLinear(el) || el.type === "freedraw") {
      const box = elementBounds(el);
      ctx.strokeRect(box.minX - pad, box.minY - pad, box.maxX - box.minX + pad * 2, box.maxY - box.minY + pad * 2);
    } else {
      const corners = [
        [-pad, -pad],
        [el.width + pad, -pad],
        [el.width + pad, el.height + pad],
        [-pad, el.height + pad],
      ];
      ctx.beginPath();
      corners.forEach(([lx, ly], index) => {
        const p = toWorld(el, lx, ly);
        if (index === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();
  }
  #drawFrame(ctx, frame, accent, zoom) {
    const pad = 6 / zoom;
    ctx.save();
    ctx.translate(frame.cx, frame.cy);
    ctx.rotate(frame.angle);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5 / zoom;
    ctx.strokeRect(-frame.width / 2 - pad, -frame.height / 2 - pad, frame.width + pad * 2, frame.height + pad * 2);
    ctx.restore();
  }
  #drawHandle(ctx, id, position, state, zoom) {
    const size = HANDLE_SIZE / zoom;
    ctx.save();
    ctx.translate(position.x, position.y);
    ctx.rotate(state.frame?.angle ?? 0);
    ctx.lineWidth = 1.5 / zoom;
    ctx.strokeStyle = state.accent;
    ctx.fillStyle = "#ffffff";
    if (id === "rotate") {
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      const isEdge = id.length === 1;
      const w = isEdge ? (id === "n" || id === "s" ? size * 1.5 : size * 0.6) : size;
      const h = isEdge ? (id === "e" || id === "w" ? size * 1.5 : size * 0.6) : size;
      ctx.beginPath();
      ctx.roundRect(-w / 2, -h / 2, w, h, 2 / zoom);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }
  #drawPointHandles(ctx, el, state, zoom) {
    ctx.save();
    ctx.lineWidth = 1.5 / zoom;
    const radius = 5.5 / zoom;
    // Midpoints (add a point by dragging).
    const mids = midpoints(el.points);
    ctx.fillStyle = withAlpha(state.accent, 0.35);
    mids.forEach(([lx, ly], index) => {
      const a = el.points[index];
      const b = el.points[index + 1];
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) * zoom < 36) return;
      const p = toWorld(el, lx, ly);
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius * 0.6, 0, Math.PI * 2);
      ctx.fill();
    });
    el.points.forEach(([lx, ly], index) => {
      const p = toWorld(el, lx, ly);
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = state.activePoint === index ? state.accent : "#ffffff";
      ctx.strokeStyle = state.accent;
      ctx.fill();
      ctx.stroke();
    });
    ctx.restore();
  }
  #drawTrail(ctx, trail, color, width, now, life, glow = false) {
    if (trail.length < 2) return;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = color;
    if (glow) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
    }
    for (let index = 1; index < trail.length; index += 1) {
      const a = trail[index - 1];
      const b = trail[index];
      const age = (now - b.t) / life;
      if (age >= 1) continue;
      ctx.globalAlpha = Math.max(0, 1 - age);
      ctx.lineWidth = width * (0.35 + 0.65 * (index / trail.length)) * (1 - age * 0.5);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.restore();
  }
  #drawCursor(ctx, x, y, peer) {
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    if (peer.laser) {
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fillStyle = peer.color;
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, 15);
      ctx.lineTo(4, 11.5);
      ctx.lineTo(7, 18);
      ctx.lineTo(9.6, 16.8);
      ctx.lineTo(6.7, 10.6);
      ctx.lineTo(11.5, 10.4);
      ctx.closePath();
      ctx.fillStyle = peer.color;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.lineJoin = "round";
      ctx.stroke();
      ctx.fill();
      if (peer.down) {
        ctx.beginPath();
        ctx.arc(0, 0, 9, 0, Math.PI * 2);
        ctx.strokeStyle = peer.color;
        ctx.globalAlpha = 0.5;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    ctx.font = '600 12px "Bricolage Grotesque", system-ui, sans-serif';
    const label = peer.name.length > 22 ? `${peer.name.slice(0, 21)}…` : peer.name;
    const width = ctx.measureText(label).width + 14;
    ctx.fillStyle = peer.color;
    ctx.beginPath();
    ctx.roundRect(12, 18, width, 20, 6);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.textBaseline = "middle";
    ctx.fillText(label, 19, 28.5);
    ctx.restore();
  }
}
