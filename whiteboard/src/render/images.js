/**
 * Decoded images for image elements, loaded lazily from the shared file map.
 *
 * Images are decoded with createImageBitmap from in-memory bytes rather than
 * an <img src="data:…">, because an activity's CSP may not allow data: URLs.
 */
export const dataUrlToBlob = (dataUrl) => {
  const comma = dataUrl.indexOf(",");
  const type = /^data:([^;,]+)/.exec(dataUrl)?.[1] ?? "image/png";
  const binary = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type });
};

export class ImageStore {
  #images = new Map();
  #pending = new Set();
  #failed = new Set();
  #resolve;
  #onLoad;

  constructor(resolve, onLoad) {
    this.#resolve = resolve;
    this.#onLoad = onLoad;
  }

  /** Returns a decoded image or null while it is still loading or missing. */
  get(fileId) {
    const existing = this.#images.get(fileId);
    if (existing !== undefined) return existing;
    if (this.#failed.has(fileId) || this.#pending.has(fileId)) return null;
    const source = this.#resolve(fileId);
    if (source === undefined || !source.startsWith("data:image/")) return null;
    this.#pending.add(fileId);
    createImageBitmap(dataUrlToBlob(source))
      .then((bitmap) => {
        this.#images.set(fileId, bitmap);
        this.#onLoad();
      })
      .catch(() => this.#failed.add(fileId))
      .finally(() => this.#pending.delete(fileId));
    return null;
  }

  /** Called when the file map changes: retry files that were missing. */
  refresh() {
    this.#failed.clear();
    this.#onLoad();
  }
}
