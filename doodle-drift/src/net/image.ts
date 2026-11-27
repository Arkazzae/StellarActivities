import { MAX_IMAGE_BYTES } from "./codec.ts";

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function scaled(source: HTMLCanvasElement, factor: number, opaque: boolean): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = Math.round(source.width * factor);
  out.height = Math.round(source.height * factor);
  const ctx = out.getContext("2d")!;
  if (opaque) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, out.width, out.height);
  }
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, out.width, out.height);
  return out;
}

/**
 * Encode a picture small enough for one Stellarr message. WebP first (with alpha for
 * layers); browsers that can't write WebP hand back PNG, so the loop checks what it got
 * and falls back to JPEG for opaque pictures, then to smaller sizes.
 */
export async function encodePicture(canvas: HTMLCanvasElement, layer: boolean): Promise<{ bytes: Uint8Array; mime: string }> {
  for (const factor of [1, 0.8, 0.64, 0.5, 0.4]) {
    const source = factor === 1 && layer ? canvas : scaled(canvas, factor, !layer);
    for (const quality of [0.86, 0.72, 0.58, 0.44]) {
      let blob = await toBlob(source, "image/webp", quality);
      if (!blob || blob.type !== "image/webp") {
        blob = layer ? await toBlob(source, "image/png") : await toBlob(source, "image/jpeg", quality);
      }
      if (blob && blob.size <= MAX_IMAGE_BYTES) return { bytes: new Uint8Array(await blob.arrayBuffer()), mime: blob.type };
      if (blob && blob.type === "image/png") break; // quality does nothing for PNG: shrink instead
    }
  }
  throw new Error("The drawing could not be made small enough to send.");
}

/** What it takes to show a stored picture. */
export interface Bits {
  hash: string;
  mime: string;
  bytes: Uint8Array;
}

const bitmaps = new Map<string, Promise<ImageBitmap>>();

/**
 * Decode a picture without a URL. The activity frame's Content-Security-Policy may refuse
 * `blob:` and `data:` images, but decoding bytes into a bitmap and painting it is always allowed.
 */
export function bitmapOf(bits: Bits): Promise<ImageBitmap> {
  let pending = bitmaps.get(bits.hash);
  if (!pending) {
    pending = createImageBitmap(new Blob([bits.bytes as BlobPart], { type: bits.mime }));
    bitmaps.set(bits.hash, pending);
    pending.catch(() => bitmaps.delete(bits.hash));
  }
  return pending;
}

const images = new Map<string, Promise<HTMLImageElement>>();

/** Load one of the activity's own files (same origin, always allowed). */
export function loadImage(url: string): Promise<HTMLImageElement> {
  let pending = images.get(url);
  if (!pending) {
    pending = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
    images.set(url, pending);
  }
  return pending;
}
