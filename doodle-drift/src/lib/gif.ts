import { encode } from "modern-gif";
import type { AlbumPlan, MatchPlan } from "../game/types.ts";
import { bitmapOf } from "../net/image.ts";
import type { Bits } from "../net/image.ts";
import { pageKey } from "../net/protocol.ts";
import type { Player } from "../net/protocol.ts";

const W = 720;
const PIC_H = 540;
const FOOT = 64;
const H = PIC_H + FOOT;
const FONT = '"National Park", "Nunito", system-ui, sans-serif';

export interface GifSource {
  plan: MatchPlan;
  players: Player[];
  texts: Record<string, string>;
  picture: (key: string) => Bits | undefined;
  album: number;
  pageMs: number;
  drawingsOnly: boolean;
  title: string;
}

function canvas() {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  return c;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > max && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function footer(ctx: CanvasRenderingContext2D, left: string) {
  ctx.fillStyle = "#162a46";
  ctx.fillRect(0, PIC_H, W, FOOT);
  ctx.font = `700 26px ${FONT}`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillStyle = "#fff5df";
  ctx.fillText(left, 24, PIC_H + FOOT / 2);
  ctx.textAlign = "right";
  ctx.fillStyle = "#b5cf3b";
  ctx.font = `700 22px ${FONT}`;
  ctx.fillText("Doodle Drift", W - 24, PIC_H + FOOT / 2);
}

function textFrame(text: string, caption: string) {
  const c = canvas();
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#f7e8c9";
  ctx.fillRect(0, 0, W, PIC_H);
  ctx.fillStyle = "#162a46";
  ctx.font = `750 44px ${FONT}`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  const lines = wrap(ctx, text || "…", W - 120);
  const lineH = 56;
  lines.slice(0, 7).forEach((line, i) => ctx.fillText(line, W / 2, PIC_H / 2 + (i - (lines.length - 1) / 2) * lineH));
  footer(ctx, caption);
  return c;
}

async function pictureFrame(pictures: (Bits | undefined)[], caption: string) {
  const c = canvas();
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, PIC_H);
  for (const bits of pictures) {
    if (!bits) continue;
    try {
      ctx.drawImage(await bitmapOf(bits), 0, 0, W, PIC_H);
    } catch { /* a missing picture leaves the page blank */ }
  }
  footer(ctx, caption);
  return c;
}

const name = (players: Player[], index: number) => players[index]?.name ?? "";

/** Every frame of one album, in reveal order. */
export async function albumFrames(source: GifSource): Promise<{ data: HTMLCanvasElement; delay: number }[]> {
  const { plan, players, texts, picture, album, pageMs, drawingsOnly, title } = source;
  const a: AlbumPlan = plan.albums[album];
  const key = (page: number) => pageKey({ album, page });
  const isText = (page: number) => ["write", "continue", "describe", "guess"].includes(a.kinds[page]);
  const frames: { data: HTMLCanvasElement; delay: number }[] = [];
  if (!drawingsOnly) frames.push({ data: textFrame(title, name(players, a.owner)), delay: Math.max(1200, pageMs * 0.7) });

  if (a.kind === "animation") {
    const pages = a.kinds.map((_, p) => p).filter((p) => !isText(p));
    const backdrop = plan.mode === "background" ? picture(key(1)) : undefined;
    const framePages = plan.mode === "background" ? pages.filter((p) => p !== 1) : pages;
    if (!drawingsOnly && isText(0)) frames.push({ data: textFrame(texts[key(0)] ?? "", name(players, a.authors[0])), delay: pageMs });
    for (let loop = 0; loop < 3; loop++) {
      for (const p of framePages) frames.push({ data: await pictureFrame([backdrop, picture(key(p))], name(players, a.authors[p])), delay: 240 });
    }
    return frames;
  }
  if (a.kind === "corpse" || a.kind === "mosaic") {
    const pages = a.kinds.map((_, p) => p).filter((p) => !isText(p));
    if (!drawingsOnly && isText(0)) frames.push({ data: textFrame(texts[key(0)] ?? "", name(players, a.authors[0])), delay: pageMs });
    if (a.kind === "corpse") {
      for (let upTo = 1; upTo <= pages.length; upTo++) {
        frames.push({ data: await pictureFrame(pages.slice(0, upTo).map((p) => picture(key(p))), pages.slice(0, upTo).map((p) => name(players, a.authors[p])).join(" · ")), delay: pageMs });
      }
    } else {
      frames.push({ data: await pictureFrame(pages.map((p) => picture(key(p))), pages.map((p) => name(players, a.authors[p])).join(" · ")), delay: pageMs * 2 });
    }
    return frames;
  }
  for (let p = 0; p < a.kinds.length; p++) {
    if (isText(p)) {
      if (!drawingsOnly) frames.push({ data: textFrame(texts[key(p)] ?? "", name(players, a.authors[p])), delay: pageMs });
    } else {
      frames.push({ data: await pictureFrame([picture(key(p))], name(players, a.authors[p])), delay: pageMs });
    }
  }
  return frames;
}

export async function makeGif(source: GifSource): Promise<Blob> {
  await document.fonts?.load(`750 44px ${FONT}`).catch(() => undefined);
  const frames = await albumFrames(source);
  const buffer = await encode({ width: W, height: H, frames });
  return new Blob([buffer], { type: "image/gif" });
}

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Page keys an album's GIF needs. */
export function albumPictureKeys(plan: MatchPlan, album: number): string[] {
  const a = plan.albums[album];
  return a.kinds.map((kind, p) => ({ kind, p })).filter(({ kind }) => !["write", "continue", "describe", "guess"].includes(kind)).map(({ p }) => pageKey({ album, page: p }));
}
