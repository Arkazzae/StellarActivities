import { modeDef } from "./modes.ts";
import { BAND_PEEK, DRAW_DICE, bandRect, clamp, holeRect, rng, secondsFor, shuffled, tileGrid, tileRect } from "./rules.ts";
import { CANVAS_W, DEFAULT_CUSTOM } from "./types.ts";
import type {
  AlbumKind,
  CustomRules,
  AlbumPlan,
  Length,
  MatchPlan,
  MatchSettings,
  RoundPlan,
  RoundRule,
  TaskKind,
  TaskSpec,
} from "./types.ts";

/** The album player `i` works on in round `r` when albums travel one seat per round. */
export const rotate = (i: number, r: number, n: number) => (((i - r) % n) + n) % n;

/** Pages in a sentence-and-drawing chain. */
export function chainRounds(n: number, length: Length): number {
  if (n <= 1) return length === "full" ? 4 : 3;
  return length === "full" ? Math.max(2, n) : Math.max(2, Math.min(n, 4));
}

type TaskBody = Omit<TaskSpec, "kind">;

/**
 * Plan a whole match up front: who works on which album in every round, what they see
 * and what they hand on. The host derives everything else (assignments, reveal order) from it.
 */
export function buildPlan(settings: MatchSettings, players: number, seed: string): MatchPlan {
  const n = Math.max(1, players);
  const mode = modeDef(settings.mode);
  const random = rng(`plan:${seed}`);
  const full = settings.length === "full";
  const albums: AlbumPlan[] = [];
  const rounds: RoundPlan[] = [];
  const sec = (kind: TaskKind) => secondsFor(kind, settings.tempo);

  const openAlbums = (kind: AlbumKind) => {
    for (let i = 0; i < n; i++) albums.push({ owner: i, kind, authors: [], kinds: [], shown: true });
  };

  const round = (kind: TaskKind, make: (i: number) => TaskBody, options: { seconds?: number; rule?: RoundRule | null } = {}) => {
    const tasks: TaskSpec[] = [];
    for (let i = 0; i < n; i++) {
      const task: TaskSpec = { kind, ...make(i) };
      tasks.push(task);
      albums[task.album].authors[task.page] = i;
      albums[task.album].kinds[task.page] = kind;
    }
    rounds.push({ kind, seconds: options.seconds ?? sec(kind), tasks, rule: options.rule ?? null });
  };

  const write = (rule: RoundRule | null = null) =>
    round("write", (i) => ({ album: i, page: 0, output: "text" }), { rule });

  // Rules for the plain chain and the one-round modes.
  const drawRule = (): RoundRule | null => {
    if (mode.rule === "mix") return DRAW_DICE[Math.floor(random() * DRAW_DICE.length)];
    if (mode.rule === "stars" || mode.rule === "oneline" || mode.rule === "kaleido" || mode.rule === "crayons" || mode.rule === "blind") return mode.rule;
    return null;
  };
  const textRule = (first: boolean): RoundRule | null => {
    if (mode.rule === "blind") return "blind";
    if (first) return null;
    if (mode.rule === "telegram") return "telegram";
    if (mode.rule === "mix") return random() < 0.4 ? "telegram" : null;
    return null;
  };

  const chainDraw = (r: number, rule: RoundRule | null = null, seconds?: number) =>
    round("draw", (i) => {
      const a = rotate(i, r, n);
      return { album: a, page: r, prompt: { album: a, page: r - 1 }, output: "flat" };
    }, { rule, seconds });
  const chainDescribe = (r: number, kind: "describe" | "guess" = "describe", rule: RoundRule | null = null, seconds?: number) =>
    round(kind, (i) => {
      const a = rotate(i, r, n);
      return { album: a, page: r, source: { album: a, page: r - 1 }, output: "text" };
    }, { rule, seconds });

  switch (mode.flow) {
    case "custom": {
      const c = sanitizeCustom(settings.custom);
      openAlbums("chain");
      const max = n <= 1 ? 8 : Math.max(2, n);
      const total = c.rounds > 0 ? clamp(c.rounds, 2, max) : chainRounds(n, "full");
      const dRule = (): RoundRule | null => {
        if (c.rule === "mix") return DRAW_DICE[Math.floor(random() * DRAW_DICE.length)];
        if (c.rule === "none" || c.rule === "telegram") return null;
        return c.rule;
      };
      const tRule = (caption: boolean): RoundRule | null => {
        if (c.rule === "blind") return "blind";
        if (!caption) return null;
        if (c.rule === "telegram") return "telegram";
        if (c.rule === "mix") return random() < 0.4 ? "telegram" : null;
        return null;
      };
      const freeDraw = () => round("draw", (i) => ({ album: i, page: 0, output: "flat" }), { seconds: c.draw, rule: dRule() });
      for (let r = 0; r < total; r++) {
        if (c.order === "texts") {
          if (r === 0) round("write", (i) => ({ album: i, page: 0, output: "text" }), { seconds: c.write, rule: tRule(false) });
          else round("continue", (i) => {
            const a = rotate(i, r, n);
            return { album: a, page: r, prompt: { album: a, page: r - 1 }, output: "text" };
          }, { seconds: c.write, rule: tRule(false) });
        } else if (c.order === "drawings") {
          if (r === 0) freeDraw();
          else round("draw", (i) => {
            const a = rotate(i, r, n);
            return { album: a, page: r, source: { album: a, page: r - 1 }, output: "flat" };
          }, { seconds: c.draw, rule: dRule() });
        } else {
          // "write": sentence on even rounds; "draw": a free drawing first, so drawings land on even rounds.
          const sentenceRound = c.order === "write" ? r % 2 === 0 : r % 2 === 1;
          if (r === 0 && c.order === "write") round("write", (i) => ({ album: i, page: 0, output: "text" }), { seconds: c.write, rule: tRule(false) });
          else if (r === 0) freeDraw();
          else if (sentenceRound) chainDescribe(r, "describe", tRule(true), c.write);
          else chainDraw(r, dRule(), c.draw);
        }
      }
      break;
    }
    case "chain": {
      openAlbums("chain");
      const total = chainRounds(n, settings.length);
      for (let r = 0; r < total; r++) {
        if (r === 0) write(textRule(true));
        else if (r % 2 === 1) chainDraw(r, drawRule());
        else chainDescribe(r, "describe", textRule(false));
      }
      break;
    }
    case "story": {
      openAlbums("chain");
      const total = chainRounds(n, settings.length);
      write();
      for (let r = 1; r < total; r++) {
        round("continue", (i) => {
          const a = rotate(i, r, n);
          return { album: a, page: r, prompt: { album: a, page: r - 1 }, output: "text" };
        });
      }
      break;
    }
    case "memory": {
      openAlbums("chain");
      const total = Math.max(3, chainRounds(n, settings.length));
      const peekSeconds = Math.round(secondsFor("copy", settings.tempo) / 7);
      write();
      chainDraw(1);
      for (let r = 2; r < total; r++) {
        const base = sec("copy");
        const seconds = Math.max(Math.round(base * 0.45 / 5) * 5, Math.round((base * (1 - 0.12 * (r - 2))) / 5) * 5);
        round("copy", (i) => {
          const a = rotate(i, r, n);
          return { album: a, page: r, source: { album: a, page: r - 1 }, peekSeconds, output: "flat" };
        }, { seconds });
      }
      break;
    }
    case "sandwich": {
      openAlbums("chain");
      const total = Math.max(3, chainRounds(n, settings.length));
      const peekSeconds = Math.round(secondsFor("copy", settings.tempo) / 7);
      write();
      chainDraw(1);
      for (let r = 2; r < total - 1; r++) {
        round("copy", (i) => {
          const a = rotate(i, r, n);
          return { album: a, page: r, source: { album: a, page: r - 1 }, peekSeconds, output: "flat" };
        });
      }
      chainDescribe(total - 1, "guess");
      break;
    }
    case "missing": {
      openAlbums("chain");
      const total = Math.max(3, chainRounds(n, settings.length));
      write();
      chainDraw(1);
      for (let r = 2; r < total; r++) {
        const step = (r - 2) % 3;
        if (step === 0) {
          round("hole", (i) => {
            const a = rotate(i, r, n);
            const hole = holeRect(`${seed}:${a}:${r}`);
            return { album: a, page: r, base: [{ album: a, page: r - 1 }], hole, clip: hole, output: "flat" };
          });
        } else if (step === 1) chainDescribe(r);
        else chainDraw(r);
      }
      break;
    }
    case "scribble": {
      openAlbums("chain");
      const total = n <= 1 ? 3 : full ? clamp(n, 3, 6) : 3;
      round("scribble", (i) => ({ album: i, page: 0, output: "flat" }));
      for (let r = 1; r < total; r++) {
        round("add", (i) => {
          const a = rotate(i, r, n);
          return { album: a, page: r, base: [{ album: a, page: r - 1 }], output: "flat" };
        });
      }
      break;
    }
    case "masterpiece": {
      openAlbums("exhibit");
      write();
      round("masterpiece", (i) => {
        const a = rotate(i, 1, n);
        return { album: a, page: 1, prompt: { album: a, page: 0 }, output: "flat" };
      });
      break;
    }
    case "same": {
      openAlbums("gallery");
      const questions = n <= 1 ? 1 : full ? n : Math.min(n, 3);
      const order = shuffled([...Array(n).keys()], random).slice(0, questions);
      albums.forEach((album, index) => { album.shown = order.includes(index); });
      write();
      for (const q of order) {
        round("draw", (i) => ({ album: q, page: 1 + i, prompt: { album: q, page: 0 }, output: "flat" }));
      }
      break;
    }
    case "mosaic": {
      openAlbums("mosaic");
      const pictures = n <= 1 ? 1 : full ? Math.min(n, 3) : 1;
      const order = shuffled([...Array(n).keys()], random).slice(0, pictures);
      albums.forEach((album, index) => { album.shown = order.includes(index); });
      const { cols, rows } = tileGrid(n);
      write();
      order.forEach((q, k) => {
        round("tile", (i) => {
          const t = (i + k) % n;
          return { album: q, page: 1 + t, prompt: { album: q, page: 0 }, clip: tileRect(t, cols, rows), tile: { index: t, cols, rows }, output: "layer" };
        });
      });
      break;
    }
    case "corpse": {
      openAlbums("corpse");
      const parts = 3;
      for (let p = 0; p < parts; p++) {
        round("part", (i) => {
          const a = rotate(i, p, n);
          const band = bandRect(p, parts);
          const body: TaskBody = { album: a, page: p, clip: band, part: { index: p, count: parts }, output: "layer" };
          if (p > 0) {
            body.base = [...Array(p).keys()].map((q) => ({ album: a, page: q }));
            body.peek = { x: 0, y: band.y - BAND_PEEK, w: CANVAS_W, h: BAND_PEEK };
          }
          return body;
        });
      }
      break;
    }
    case "flipbook":
    case "relay": {
      openAlbums("animation");
      const frames = mode.flow === "flipbook" ? (full ? 5 : 4) : full ? clamp(n - 1, 4, 8) : 4;
      write();
      for (let f = 1; f <= frames; f++) {
        round("frame", (i) => {
          const a = mode.flow === "flipbook" ? rotate(i, 1, n) : rotate(i, f, n);
          const body: TaskBody = { album: a, page: f, prompt: { album: a, page: 0 }, frame: { index: f - 1, count: frames }, output: "flat" };
          if (f > 1) body.onion = { album: a, page: f - 1 };
          return body;
        });
      }
      break;
    }
    case "background": {
      openAlbums("animation");
      const frames = full ? clamp(n - 2, 3, 6) : 3;
      write();
      round("background", (i) => {
        const a = rotate(i, 1, n);
        return { album: a, page: 1, prompt: { album: a, page: 0 }, output: "flat" };
      });
      for (let f = 0; f < frames; f++) {
        const r = 2 + f;
        round("frame", (i) => {
          const a = rotate(i, r, n);
          const body: TaskBody = {
            album: a,
            page: r,
            prompt: { album: a, page: 0 },
            base: [{ album: a, page: 1 }],
            frame: { index: f, count: frames },
            output: "layer",
          };
          if (f > 0) body.onion = { album: a, page: r - 1 };
          return body;
        });
      }
      break;
    }
  }

  return { mode: mode.id, players: n, seed, albums, rounds, reveal: mode.reveal };
}

/** Kinds whose page is a sentence. */
export const TEXT_KINDS: ReadonlySet<TaskKind> = new Set(["write", "continue", "describe", "guess"]);

export const isTextKind = (kind: TaskKind) => TEXT_KINDS.has(kind);

const CUSTOM_ORDERS = ["write", "draw", "drawings", "texts"] as const;
const CUSTOM_RULES = ["none", "mix", "stars", "oneline", "kaleido", "crayons", "blind", "telegram"] as const;

/** Custom rules come from shared state: keep them inside sane bounds. */
export function sanitizeCustom(input: Partial<CustomRules> | undefined): CustomRules {
  const c = { ...DEFAULT_CUSTOM, ...(input ?? {}) };
  return {
    order: (CUSTOM_ORDERS as readonly string[]).includes(c.order) ? c.order : DEFAULT_CUSTOM.order,
    rounds: Number.isFinite(c.rounds) ? clamp(Math.round(c.rounds), 0, 14) : 0,
    write: Number.isFinite(c.write) ? clamp(Math.round(c.write), 10, 180) : DEFAULT_CUSTOM.write,
    draw: Number.isFinite(c.draw) ? clamp(Math.round(c.draw), 20, 300) : DEFAULT_CUSTOM.draw,
    rule: (CUSTOM_RULES as readonly string[]).includes(c.rule) ? c.rule : "none",
  };
}
