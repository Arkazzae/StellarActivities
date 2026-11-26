/**
 * Dark mode keeps the stored colours and maps them at paint time, the same
 * way a CSS `invert(93%) hue-rotate(180deg)` would — but per colour, so images
 * are left untouched.
 */
const cache = new Map();
const clamp = (value) => Math.max(0, Math.min(1, value));
export const parseHex = (hex) => {
  const match = /^#([0-9a-f]{3,8})$/i.exec(hex);
  if (match === null) return null;
  let digits = match[1];
  if (digits.length === 3 || digits.length === 4) digits = [...digits].map((char) => char + char).join("");
  if (digits.length !== 6 && digits.length !== 8) return null;
  const r = Number.parseInt(digits.slice(0, 2), 16) / 255;
  const g = Number.parseInt(digits.slice(2, 4), 16) / 255;
  const b = Number.parseInt(digits.slice(4, 6), 16) / 255;
  const a = digits.length === 8 ? Number.parseInt(digits.slice(6, 8), 16) / 255 : 1;
  return [r, g, b, a];
};
const toHex = (r, g, b, a) => {
  const part = (value) =>
    Math.round(clamp(value) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}${a < 1 ? part(a) : ""}`;
};
export const darkColor = (color) => {
  if (color === "transparent") return color;
  const cached = cache.get(color);
  if (cached !== undefined) return cached;
  const rgba = parseHex(color);
  if (rgba === null) return color;
  const [r0, g0, b0, a] = rgba;
  const r1 = 0.93 - 0.86 * r0;
  const g1 = 0.93 - 0.86 * g0;
  const b1 = 0.93 - 0.86 * b0;
  // hue-rotate(180deg) matrix
  const r = -0.574 * r1 + 1.43 * g1 + 0.144 * b1;
  const g = 0.426 * r1 + 0.43 * g1 + 0.144 * b1;
  const b = 0.426 * r1 + 1.43 * g1 - 0.856 * b1;
  const mapped = toHex(r, g, b, a);
  cache.set(color, mapped);
  return mapped;
};
export const paintColor = (color, dark) => (dark ? darkColor(color) : color);
export const withAlpha = (hex, alpha) => {
  const rgba = parseHex(hex);
  if (rgba === null) return hex;
  return toHex(rgba[0], rgba[1], rgba[2], alpha);
};
/** Relative luminance, used to pick readable label colours. */
export const luminance = (hex) => {
  const rgba = parseHex(hex);
  if (rgba === null) return 0.5;
  const channel = (value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channel(rgba[0]) + 0.7152 * channel(rgba[1]) + 0.0722 * channel(rgba[2]);
};
const deepCache = new Map();
/**
 * Hatch lines are thin, so pastel fills would vanish; they are painted in a
 * deeper, more saturated tone of the same hue.
 */
export const deepen = (hex) => {
  const cached = deepCache.get(hex);
  if (cached !== undefined) return cached;
  const rgba = parseHex(hex);
  if (rgba === null) return hex;
  const [r, g, b, a] = rgba;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let hue = 0;
  const delta = max - min;
  if (delta > 0) {
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  let light = (max + min) / 2;
  let sat = delta === 0 ? 0 : delta / (1 - Math.abs(2 * light - 1));
  if (light > 0.6) {
    light = Math.max(0.5, light - 0.2);
    sat = Math.min(1, sat * 1.05 + (sat > 0.05 ? 0.12 : 0));
  }
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = light - c / 2;
  const [r1, g1, b1] =
    hue < 60
      ? [c, x, 0]
      : hue < 120
        ? [x, c, 0]
        : hue < 180
          ? [0, c, x]
          : hue < 240
            ? [0, x, c]
            : hue < 300
              ? [x, 0, c]
              : [c, 0, x];
  const out = toHex(r1 + m, g1 + m, b1 + m, a);
  deepCache.set(hex, out);
  return out;
};
