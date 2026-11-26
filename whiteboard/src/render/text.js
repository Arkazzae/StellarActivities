export const FONT_STACK = {
  hand: '"Shantell Sans", "Comic Sans MS", "Segoe Print", cursive',
  sans: '"Bricolage Grotesque", ui-sans-serif, system-ui, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, "SFMono-Regular", Menlo, monospace',
};
export const LINE_HEIGHT = 1.3;
export const LABEL_PADDING = 10;
export const fontString = (family, size) => `${size}px ${FONT_STACK[family]}`;
let measureContext = null;
const context = () => {
  if (measureContext !== null) return measureContext;
  const canvas = typeof OffscreenCanvas === "function" ? new OffscreenCanvas(8, 8) : document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error("Canvas 2D niedostępny");
  measureContext = ctx;
  return ctx;
};
export const measureLine = (line, family, size) => {
  const ctx = context();
  ctx.font = fontString(family, size);
  return ctx.measureText(line).width;
};
export const measureText = (text, family, size) => {
  const lines = text.split("\n");
  let width = 0;
  for (const line of lines) width = Math.max(width, measureLine(line, family, size));
  return { width: Math.ceil(width) + 2, height: Math.ceil(lines.length * size * LINE_HEIGHT), lines };
};
/** Greedy word wrap; words longer than the line are broken by character. */
export const wrapText = (text, family, size, maxWidth) => {
  const out = [];
  if (maxWidth <= size) return text.split("\n");
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/(\s+)/);
    let line = "";
    for (const word of words) {
      const candidate = line + word;
      if (measureLine(candidate, family, size) <= maxWidth || line.length === 0) {
        if (measureLine(candidate, family, size) > maxWidth && line.length === 0) {
          // Break a single long word.
          let chunk = "";
          for (const char of word) {
            if (measureLine(chunk + char, family, size) > maxWidth && chunk.length > 0) {
              out.push(chunk);
              chunk = char;
            } else {
              chunk += char;
            }
          }
          line = chunk;
        } else {
          line = candidate;
        }
      } else {
        out.push(line.trimEnd());
        line = word.trimStart();
      }
    }
    out.push(line.trimEnd());
  }
  return out;
};
/** Width available for a label of `textHeight` inside the shape. */
const innerWidth = (el, textHeight) => {
  const width = Math.abs(el.width);
  const height = Math.max(1, Math.abs(el.height));
  const ratio = Math.min(1, textHeight / height);
  if (el.type === "ellipse") return width * Math.sqrt(Math.max(0, 1 - ratio * ratio)) - LABEL_PADDING * 2;
  if (el.type === "diamond") return width * (1 - ratio) - LABEL_PADDING * 2;
  return width - LABEL_PADDING * 2;
};
/**
 * Wraps a container label. Ellipses and diamonds are narrower away from the
 * middle, so the usable width depends on how many lines the label takes.
 */
export const labelLayout = (el) => {
  const lineHeight = el.fontSize * LINE_HEIGHT;
  const text = el.text.length === 0 ? " " : el.text;
  let count = 1;
  let lines = [text];
  let width = Math.max(8, innerWidth(el, lineHeight));
  for (let attempt = 0; attempt < 4; attempt += 1) {
    width = Math.max(8, innerWidth(el, count * lineHeight));
    lines = wrapText(text, el.fontFamily, el.fontSize, width);
    if (lines.length <= count) break;
    count = lines.length;
  }
  const height = lines.length * lineHeight;
  return {
    lines,
    x: (Math.abs(el.width) - width) / 2,
    y: (Math.abs(el.height) - height) / 2,
    width,
    height,
  };
};
/**
 * Minimum container height that fits the label, or null when it already fits.
 */
export const requiredContainerHeight = (el) => {
  if (el.text.length === 0) return null;
  const { height: textHeight } = labelLayout(el);
  const factor = el.type === "ellipse" ? 1 / 0.7071 : el.type === "diamond" ? 2 : 1;
  const needed = Math.ceil(textHeight * factor + LABEL_PADDING * 2);
  return needed > Math.abs(el.height) + 0.5 ? needed : null;
};
/** Primary family per font, loaded explicitly (both unicode-range subsets). */
export const FONT_FAMILY_NAME = {
  hand: "Shantell Sans",
  sans: "Bricolage Grotesque",
  mono: "JetBrains Mono",
};
let fontsReady = null;
/**
 * Loads every face (both unicode-range subsets). Call after the stylesheet is
 * in the document — in dev Vite injects @font-face rules when styles.css is
 * imported, so this must not run at module evaluation time.
 */
export const loadFonts = () => {
  fontsReady ??= (async () => {
    if (typeof document === "undefined" || !("fonts" in document)) return;
    await Promise.allSettled(
      Object.values(FONT_FAMILY_NAME).map((family) => document.fonts.load(`24px "${family}"`, "Aa Ąę Żółw Łódź")),
    );
  })();
  return fontsReady;
};
