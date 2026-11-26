import { commonBounds } from "../model/geometry.js";
import { canHoldLabel } from "../model/types.js";
import { deepen, paintColor } from "./color.js";
import { baselineOffset } from "./renderer.js";
import { forEachOp } from "./rough.js";
import { buildDrawable } from "./shapes.js";
import { FONT_STACK, fontString, labelLayout, LINE_HEIGHT } from "./text.js";
export const exportBounds = (elements, padding) => {
  const box = commonBounds(elements);
  if (box === null) return null;
  return { minX: box.minX - padding, minY: box.minY - padding, maxX: box.maxX + padding, maxY: box.maxY + padding };
};
const MAX_EXPORT_PIXELS = 16_000_000;
export const renderToCanvas = (renderer, elements, options) => {
  const box = exportBounds(elements, options.padding) ?? { minX: 0, minY: 0, maxX: 200, maxY: 120 };
  const width = box.maxX - box.minX;
  const height = box.maxY - box.minY;
  let scale = options.scale;
  if (width * height * scale * scale > MAX_EXPORT_PIXELS) scale = Math.sqrt(MAX_EXPORT_PIXELS / (width * height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(width * scale));
  canvas.height = Math.max(1, Math.ceil(height * scale));
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error("Canvas 2D niedostępny.");
  if (options.background !== null) {
    ctx.fillStyle = paintColor(options.background, options.dark);
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.setTransform(scale, 0, 0, scale, -box.minX * scale, -box.minY * scale);
  for (const el of elements)
    renderer.drawElement(ctx, el, options.dark, { faded: false, hideText: false, draft: false });
  return canvas;
};
export const exportPng = async (renderer, elements, options) => {
  const canvas = renderToCanvas(renderer, elements, options);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob === null ? reject(new Error("Nie udało się zapisać PNG.")) : resolve(blob)),
      "image/png",
    );
  });
};
/* ---------------------------------------------------------------------- svg */
const escapeXml = (value) =>
  value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const round = (value) => (Math.round(value * 100) / 100).toString();
const pathString = (data) => {
  const parts = [];
  forEachOp(data, {
    move: (x, y) => parts.push(`M${round(x)} ${round(y)}`),
    line: (x, y) => parts.push(`L${round(x)} ${round(y)}`),
    cubic: (x1, y1, x2, y2, x, y) =>
      parts.push(`C${round(x1)} ${round(y1)} ${round(x2)} ${round(y2)} ${round(x)} ${round(y)}`),
    close: () => parts.push("Z"),
  });
  return parts.join("");
};
const FONT_FILES = {
  hand: { family: "Shantell Sans", files: ["ShantellSans-latin.woff2", "ShantellSans-latin-ext.woff2"] },
  sans: { family: "Bricolage Grotesque", files: ["Bricolage-latin.woff2", "Bricolage-latin-ext.woff2"] },
  mono: { family: "JetBrains Mono", files: ["JetBrainsMono-latin.woff2", "JetBrainsMono-latin-ext.woff2"] },
};
const fontDataUrl = async (file) => {
  try {
    const response = await fetch(new URL(`./assets/fonts/${file}`, window.location.href));
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
};
const fontFaces = async (elements) => {
  const used = new Set();
  for (const el of elements) if (el.text.length > 0) used.add(el.fontFamily);
  const rules = [];
  for (const family of used) {
    const entry = FONT_FILES[family];
    for (const file of entry.files) {
      const data = await fontDataUrl(file);
      if (data !== null) rules.push(`@font-face{font-family:"${entry.family}";src:url(${data}) format("woff2");}`);
    }
  }
  return rules.join("");
};
let svgMeasure = null;
export const exportSvg = async (elements, resolveFile, options) => {
  const box = exportBounds(elements, options.padding) ?? { minX: 0, minY: 0, maxX: 200, maxY: 120 };
  const width = box.maxX - box.minX;
  const height = box.maxY - box.minY;
  const out = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${round(box.minX)} ${round(box.minY)} ${round(width)} ${round(height)}" width="${round(width * options.scale)}" height="${round(height * options.scale)}">`,
  );
  const faces = await fontFaces(elements);
  if (faces.length > 0) out.push(`<defs><style>${faces}</style></defs>`);
  if (options.background !== null) {
    out.push(
      `<rect x="${round(box.minX)}" y="${round(box.minY)}" width="${round(width)}" height="${round(height)}" fill="${paintColor(options.background, options.dark)}"/>`,
    );
  }
  svgMeasure ??= document.createElement("canvas").getContext("2d");
  for (const el of elements) {
    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;
    const transform = `translate(${round(cx)} ${round(cy)}) rotate(${round((el.angle * 180) / Math.PI)}) translate(${round(-el.width / 2)} ${round(-el.height / 2)})`;
    const opacity = el.opacity < 100 ? ` opacity="${round(el.opacity / 100)}"` : "";
    out.push(`<g transform="${transform}"${opacity}>`);
    if (el.type === "image") {
      const data = resolveFile(el.fileId);
      if (data !== undefined) {
        out.push(
          `<image href="${escapeXml(data)}" width="${round(el.width)}" height="${round(el.height)}" preserveAspectRatio="none"/>`,
        );
      }
    } else {
      for (const path of buildDrawable(el).paths) {
        const color = paintColor(
          path.paint === "stroke" ? el.strokeColor : path.paint === "hatch" ? deepen(el.fillColor) : el.fillColor,
          options.dark,
        );
        const d = pathString(path.data);
        if (path.kind === "fill") {
          out.push(`<path d="${d}" fill="${color}"/>`);
        } else {
          const dash = path.dash === null ? "" : ` stroke-dasharray="${path.dash.map(round).join(" ")}"`;
          out.push(
            `<path d="${d}" fill="none" stroke="${color}" stroke-width="${round(path.width)}" stroke-linecap="round" stroke-linejoin="round"${dash}/>`,
          );
        }
      }
    }
    if (el.text.length > 0 && (el.type === "text" || canHoldLabel(el)) && svgMeasure !== null) {
      const font = fontString(el.fontFamily, el.fontSize);
      const baseline = baselineOffset(svgMeasure, font, el.fontSize);
      const lineHeight = el.fontSize * LINE_HEIGHT;
      const anchor = el.textAlign === "left" ? "start" : el.textAlign === "center" ? "middle" : "end";
      let lines;
      let x;
      let top;
      if (el.type === "text") {
        lines = el.text.split("\n");
        x = el.textAlign === "left" ? 0 : el.textAlign === "center" ? el.width / 2 : el.width;
        top = 0;
      } else {
        const inner = labelLayout(el);
        lines = [...inner.lines];
        x =
          el.textAlign === "left"
            ? inner.x
            : el.textAlign === "center"
              ? inner.x + inner.width / 2
              : inner.x + inner.width;
        top = inner.y;
      }
      const family = escapeXml(FONT_STACK[el.fontFamily]);
      const fill = paintColor(el.strokeColor, options.dark);
      out.push(
        `<text font-family="${family}" font-size="${round(el.fontSize)}" fill="${fill}" text-anchor="${anchor}" xml:space="preserve">`,
      );
      lines.forEach((line, index) => {
        out.push(`<tspan x="${round(x)}" y="${round(top + index * lineHeight + baseline)}">${escapeXml(line)}</tspan>`);
      });
      out.push("</text>");
    }
    out.push("</g>");
  }
  out.push("</svg>");
  return out.join("");
};
