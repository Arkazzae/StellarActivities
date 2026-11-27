/**
 * Start a Stockfish worker (public/stockfish.js) wherever the activity runs.
 *
 * - Stellarr with a dedicated activity domain, `stellarr dev` and a plain browser: the script's own
 *   URL. `stellarr dev`'s policy has no `worker-src blob:`, so a blob worker would be refused there.
 * - Stellarr's default frame has an opaque origin: no script URL counts as same-origin and the
 *   constructor throws, but its policy allows `worker-src blob:`, so a blob that imports the
 *   script takes over.
 */
export function startStockfishWorker(): Worker {
  const url = new URL("./stockfish.js", document.baseURI).href;
  try {
    return new Worker(url);
  } catch {
    const blobUrl = URL.createObjectURL(new Blob([`importScripts(${JSON.stringify(url)});`], { type: "text/javascript" }));
    try {
      return new Worker(blobUrl);
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  }
}
