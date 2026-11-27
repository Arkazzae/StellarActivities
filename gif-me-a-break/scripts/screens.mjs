/**
 * Screenshots of every screen from the canned rooms (`?preview=<phase>`), at the Stellarr frame
 * size, a small frame and a phone. Run `pnpm build` first. Checks that the screen's main button
 * is inside the window. Screenshots go to reports/screens/.
 */
import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dist = join(root, "dist");
const out = join(root, "reports/screens");
mkdirSync(out, { recursive: true });

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".webp": "image/webp", ".png": "image/png", ".woff2": "font/woff2", ".json": "application/json" };
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  try {
    const file = join(dist, path === "/" ? "index.html" : path);
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    res.end(readFileSync(file));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((ok) => server.listen(0, ok));
const origin = `http://127.0.0.1:${server.address().port}`;

const SIZES = [
  { name: "stage", width: 1360, height: 812, langs: ["pl", "en"] },
  { name: "small", width: 1100, height: 650, langs: ["pl"] },
  { name: "phone", width: 390, height: 844, langs: ["pl", "en"] },
];
/** Each screen, and the button that must be in view, in Polish and English. */
const SCREENS = [
  { phase: "lobby", button: ["Zaczynamy", "Let's play"] },
  { phase: "lobby", as: "guest" },
  { phase: "topic" },
  { phase: "search", button: ["Wyślij", "Send"] },
  { phase: "reveal" },
  { phase: "vote", button: ["Głosuj", "Vote"] },
  { phase: "results" },
  { phase: "final", button: ["Jeszcze raz", "Play again"] },
  { phase: "topic", mode: "rezyser" },
  { phase: "search", mode: "rezyser" },
  { phase: "vote", mode: "rezyser", button: ["Wybieram ten", "Pick this one"] },
  { phase: "results", mode: "rezyser" },
  { phase: "topic", mode: "napisy" },
  { phase: "search", mode: "napisy", button: ["Wyślij", "Send"] },
  { phase: "reveal", mode: "napisy" },
  { phase: "vote", mode: "napisy", button: ["Głosuj", "Vote"] },
];

const browser = await chromium.launch();
const problems = [];
let shots = 0;
for (const size of SIZES) {
  for (const lang of size.langs) {
    const page = await browser.newPage({ viewport: { width: size.width, height: size.height } });
    page.on("pageerror", (e) => problems.push(`${size.name}: ${e.message}`));
    for (const screen of SCREENS) {
      const url = `${origin}/?preview=${screen.phase}&lang=${lang}${screen.as ? `&as=${screen.as}` : ""}${screen.mode ? `&mode=${screen.mode}` : ""}`;
      await page.goto(url);
      await page.waitForSelector(".screen");
      await page.waitForTimeout(900);
      const file = `${screen.phase}${screen.as ? `-${screen.as}` : ""}${screen.mode ? `-${screen.mode}` : ""}-${size.name}${lang === "en" ? "-en" : ""}`;
      if (screen.button && size.name !== "phone") {
        const name = screen.button[lang === "pl" ? 0 : 1];
        const button = page.getByRole("button", { name, exact: false }).first();
        const box = await button.boundingBox();
        if (!box || box.y < 0 || box.y + box.height > size.height || box.x + box.width > size.width) {
          problems.push(`${file}: "${name}" is outside the window (${JSON.stringify(box)})`);
        }
      }
      const wide = await page.evaluate(() => document.documentElement.scrollWidth);
      if (wide > size.width) problems.push(`${file}: the page is ${wide} px wide, wider than the window`);
      await page.screenshot({ path: join(out, `${file}.png`), fullPage: size.name === "phone" });
      shots++;
    }
    await page.close();
  }
}
await browser.close();
server.close();
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`screens: ${shots} screenshots in reports/screens`);
