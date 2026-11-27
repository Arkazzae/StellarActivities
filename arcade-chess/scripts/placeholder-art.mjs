/**
 * Placeholder icon (512 × 512 PNG) and cover (1536 × 864 WebP) until the generated artwork arrives
 * (see ARTWORK.md). The icon is drawn from the game's own board colours and pieces; the cover is the
 * built app's menu, opened offline in a headless browser. Needs `pnpm build` first and `cwebp` on PATH.
 */

import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const root = resolve(import.meta.dirname, "..");
const dist = join(root, "dist");
const king = readFileSync(join(root, "public/pieces/wk.svg"), "utf8");
const queen = readFileSync(join(root, "public/pieces/bq.svg"), "utf8");
const inline = (svg) => `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

const icon = `<!doctype html><html><body style="margin:0;background:transparent">
<div style="width:512px;height:512px;border-radius:112px;overflow:hidden;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;background:#302e2b">
  <div style="background:#ebecd0"></div><div style="background:#739552;display:grid;place-items:center"><img src="${inline(queen)}" style="width:210px"></div>
  <div style="background:#739552;display:grid;place-items:center"><img src="${inline(king)}" style="width:210px"></div><div style="background:#ebecd0"></div>
</div></body></html>`;

const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".wav": "audio/wav", ".woff2": "font/woff2", ".woff": "font/woff" };
const server = createServer((req, res) => {
  const path = join(dist, decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/\/$/, "/index.html"));
  let body;
  try {
    body = readFileSync(path);
  } catch {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { "content-type": types[extname(path)] ?? "application/octet-stream" }).end(body);
}).listen(0);
const port = server.address().port;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
  await page.setContent(icon);
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(root, "public/icon.png"), omitBackground: true });

  const cover = await browser.newPage({ viewport: { width: 1536, height: 864 } });
  await cover.goto(`http://localhost:${port}/`);
  await cover.waitForSelector(".home");
  await cover.waitForTimeout(600);
  const png = join(mkdtempSync(join(tmpdir(), "arcade-chess-")), "cover.png");
  await cover.screenshot({ path: png });
  execFileSync("cwebp", ["-quiet", "-q", "82", png, "-o", join(root, "public/cover.webp")]);
} finally {
  await browser.close();
  server.close();
}
console.log("public/icon.png and public/cover.webp written");
