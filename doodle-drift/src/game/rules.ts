import { CANVAS_H, CANVAS_W } from "./types.ts";
import type { DrawRule, Rect, TaskKind, Tempo } from "./types.ts";

/** Deterministic random numbers, so every client derives the same stars, holes and palettes. */
export function rng(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** The 12 crayons of the drawing palette. Names live in i18n under `color.<key>`. */
export const PALETTE = [
  { key: "navy", hex: "#162a46" },
  { key: "coral", hex: "#ff6847" },
  { key: "mustard", hex: "#f2b84b" },
  { key: "lime", hex: "#b5cf3b" },
  { key: "green", hex: "#4f9d69" },
  { key: "sky", hex: "#8fb8e8" },
  { key: "blue", hex: "#2f6fd6" },
  { key: "lilac", hex: "#c9b0ec" },
  { key: "pink", hex: "#f4a3b4" },
  { key: "brown", hex: "#8a5a3c" },
  { key: "grey", hex: "#8b9099" },
  { key: "white", hex: "#ffffff" },
] as const;

export type PaletteKey = (typeof PALETTE)[number]["key"];

/** Three random crayons for one player in one round (Trzy kredki). */
export function crayons(seed: string): PaletteKey[] {
  const pool = PALETTE.filter((item) => item.key !== "white").map((item) => item.key);
  return shuffled(pool, rng(seed)).slice(0, 3);
}

export interface Star {
  x: number;
  y: number;
  r: number;
}

/** The shared night sky for Gwiazdozbiór: the same stars for everyone in a match. */
export function starField(seed: string, count = 64): Star[] {
  const random = rng(`stars:${seed}`);
  const stars: Star[] = [];
  let guard = 0;
  while (stars.length < count && guard++ < 4000) {
    const x = 40 + random() * (CANVAS_W - 80);
    const y = 40 + random() * (CANVAS_H - 80);
    if (stars.some((s) => (s.x - x) ** 2 + (s.y - y) ** 2 < 62 ** 2)) continue;
    stars.push({ x: Math.round(x), y: Math.round(y), r: 5 + Math.round(random() * 4) });
  }
  return stars;
}

/** The piece cut out of a drawing in Brakujący kawałek. */
export function holeRect(seed: string): Rect {
  const random = rng(`hole:${seed}`);
  const w = Math.round(300 + random() * 120);
  const h = Math.round(220 + random() * 100);
  const x = Math.round(60 + random() * (CANVAS_W - w - 120));
  const y = Math.round(50 + random() * (CANVAS_H - h - 100));
  return { x, y, w, h };
}

/** Columns and rows for a shared picture of `n` tiles on a 4:3 canvas. */
export function tileGrid(n: number): { cols: number; rows: number } {
  if (n <= 1) return { cols: 1, rows: 1 };
  let best = { cols: n, rows: 1, cost: Infinity };
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const aspect = CANVAS_W / cols / (CANVAS_H / rows);
    const cost = Math.abs(Math.log(aspect)) + (cols * rows - n) * 0.35;
    if (cost < best.cost) best = { cols, rows, cost };
  }
  return { cols: best.cols, rows: best.rows };
}

export function tileRect(index: number, cols: number, rows: number): Rect {
  const w = CANVAS_W / cols;
  const h = CANVAS_H / rows;
  const col = index % cols;
  const row = Math.floor(index / cols);
  return { x: Math.round(col * w), y: Math.round(row * h), w: Math.round(w), h: Math.round(h) };
}

/** One horizontal band of a creature (head, body, legs). */
export function bandRect(index: number, count: number): Rect {
  const h = CANVAS_H / count;
  return { x: 0, y: Math.round(index * h), w: CANVAS_W, h: Math.round(h) };
}

/** How much of the previous band the next artist sees. */
export const BAND_PEEK = 30;

export const DRAW_DICE: DrawRule[] = ["stars", "oneline", "kaleido", "crayons", "blind"];

const BASE_SECONDS: Record<TaskKind, number> = {
  write: 40,
  continue: 40,
  describe: 40,
  guess: 45,
  draw: 80,
  copy: 70,
  scribble: 15,
  add: 60,
  hole: 60,
  frame: 40,
  background: 70,
  part: 70,
  tile: 80,
  masterpiece: 200,
};

const TEMPO_FACTOR: Record<Tempo, number> = { fast: 0.75, normal: 1, slow: 1.5 };

export function secondsFor(kind: TaskKind, tempo: Tempo): number {
  return Math.round((BASE_SECONDS[kind] * TEMPO_FACTOR[tempo]) / 5) * 5;
}

/** The fixed reveal delay before a round turns interactive (3, 2, 1, start). */
export const COUNTDOWN_MS = 3600;
/** Late submissions the host still waits for after the deadline. */
export const LATE_GRACE_MS = 4000;
