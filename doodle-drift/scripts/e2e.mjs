/**
 * End-to-end check of the built activity in the `stellarr dev` simulator (run `pnpm build` first).
 *
 *   pnpm e2e [mode] [players]
 *
 * Opens one tab per player, plays a whole match of the given mode (default: classic, 3 players)
 * from the lobby to the end screen, and saves screenshots to reports/. Exits non-zero on the
 * first failed step or console error.
 */
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { stellarrCli } from "./stellarr.mjs";

const { chromium } = await import(process.env.PLAYWRIGHT ?? "@playwright/test");
const root = resolve(import.meta.dirname, "..");
const reports = join(root, "reports");
mkdirSync(reports, { recursive: true });
const cli = process.env.STELLARR_CLI ?? stellarrCli();
if (!cli) throw new Error("No Stellarr SDK found. Run pnpm install or set STELLARR_SDK.");
const mode = process.argv[2] ?? "classic";
const count = Number(process.argv[3] ?? 3);
const size = { width: Number(process.env.W ?? 1360), height: Number(process.env.H ?? 812) };

const log = (text) => console.log(`· ${text}`);

async function startSimulator() {
  const child = spawn(process.execPath, [cli, "dev", "--dir", process.env.DIST ?? "dist", "--port", "0", "--mode", "voice"], { cwd: root });
  const origin = await new Promise((resolveOrigin, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error(`stellarr dev did not start:\n${output}`)), 15_000);
    const read = (chunk) => {
      output += chunk;
      const match = output.match(/(http:\/\/[^\s/]+)\//);
      if (match) { clearTimeout(timer); resolveOrigin(match[1]); }
    };
    child.stdout.on("data", read);
    child.stderr.on("data", read);
    child.on("exit", () => reject(new Error(`stellarr dev exited:\n${output}`)));
  });
  return { origin, stop: () => child.kill() };
}

const errors = [];

async function player(browser, origin, name) {
  const context = await browser.newContext({ viewport: size });
  const page = await context.newPage();
  page.on("console", (m) => { if (m.type() === "error") errors.push(`${name}: ${m.text()}`); });
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  await page.goto(`${origin}/`);
  const app = page.frameLocator("#activity");
  await app.locator(".side").waitFor({ timeout: 20_000 });
  return { name, page, app };
}

async function shot(who, file) {
  const frame = who.page.locator("#activity");
  await frame.screenshot({ path: join(reports, file) });
}

/** Draw a few strokes, or tap stars, depending on what the board offers. */
async function scribble(who, seed) {
  const input = who.app.locator(".board-input").first();
  const box = await input.boundingBox();
  if (!box) throw new Error(`${who.name}: no canvas`);
  const night = await who.app.locator(".board-night").count();
  if (night) {
    // Tap the brightest spots: approximate star hits by sweeping a grid.
    for (let i = 0; i < 18; i++) {
      await who.page.mouse.click(box.x + box.width * ((i * 0.37 + seed * 0.1) % 1), box.y + box.height * ((i * 0.61 + seed * 0.2) % 1));
    }
    return;
  }
  const clip = await who.app.locator(".guide-clip").count();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const r = Math.min(box.width, box.height) * (clip ? 0.08 : 0.3);
  await who.page.mouse.move(cx - r, cy);
  await who.page.mouse.down();
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    await who.page.mouse.move(cx + Math.cos(a) * r, cy + Math.sin(a * (1 + seed)) * r * 0.7, { steps: 2 });
  }
  await who.page.mouse.up();
}

async function screenOf(who) {
  return who.app.locator("body").evaluate(() => {
    if (document.querySelector(".lobby")) return "lobby";
    if (document.querySelector(".countdown")) return "countdown";
    if (document.querySelector(".seats-panel")) return "waiting";
    if (document.querySelector(".peek-ring")) return "peek";
    if (document.querySelector(".board-input")) return "draw";
    if (document.querySelector(".word-slots")) return "words";
    if (document.querySelector("textarea#answer")) return "text";
    if (document.querySelector(".reveal-foot")) return "reveal";
    if (document.querySelector(".end-grid")) return "end";
    return "other";
  });
}

/** Every listed control that is on screen sits fully inside the activity frame. */
async function assertInView(who, where) {
  const bad = await who.app.locator("body").evaluate((_, selectors) => {
    const out = [];
    for (const selector of selectors) {
      for (const el of document.querySelectorAll(selector)) {
        const style = getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden" || !el.getClientRects().length) continue;
        const r = el.getBoundingClientRect();
        if (r.top < -1 || r.left < -1 || r.bottom > innerHeight + 1 || r.right > innerWidth + 1) out.push(`${selector} ${Math.round(r.top)}-${Math.round(r.bottom)} / ${innerHeight}`);
      }
    }
    return out;
  }, [".launch .btn", ".mode-choice", ".mode-detail .btn", ".modes-confirm .btn", ".aside-end .btn", ".rail > .tool", ".compact-tools > .btn", ".host-ctl .btn", ".end-actions .btn", ".submit-row .btn", ".duo-side > .btn", ".bar .icon-btn"]);
  if (bad.length) throw new Error(`${who.name}: controls out of view on ${where}: ${bad.join("; ")}`);
}

async function doTask(who, round) {
  const deadline = Date.now() + 30_000;
  for (;;) {
    const screen = await screenOf(who);
    if (screen === "text") {
      await who.app.locator("textarea#answer").fill(`${who.name} round ${round} kot na rowerze`);
      await who.app.locator("textarea#answer").press("Enter");
      return screen;
    }
    if (screen === "words") {
      const slots = who.app.locator(".word-slots input");
      for (let i = 0; i < 3; i++) await slots.nth(i).fill(["kot", "jedzie", "rowerem"][i]);
      await slots.nth(0).press("Enter");
      return screen;
    }
    if (screen === "peek") {
      await who.app.getByRole("button", { name: /Zaczynam|Start drawing/ }).click();
      continue;
    }
    if (screen === "draw") {
      await scribble(who, round);
      const done = who.app.locator(".aside .btn:visible, .compact-tools .btn:visible").first();
      if (await done.count()) {
        if (await done.isEnabled()) await done.click();
      }
      return screen;
    }
    if (screen === "waiting" || screen === "reveal" || screen === "end") return screen;
    if (Date.now() > deadline) throw new Error(`${who.name}: stuck on ${screen} in round ${round}`);
    await new Promise((r) => setTimeout(r, 300));
  }
}

const sim = await startSimulator();
const browser = await chromium.launch();
try {
  log(`simulator at ${sim.origin}, mode ${mode}, ${count} players, ${size.width}×${size.height}`);
  const people = [];
  for (let i = 0; i < count; i++) people.push(await player(browser, sim.origin, `P${i + 1}`));
  let host = people[0];
  await shot(host, `${mode}-lobby-host.png`);
  await shot(people[1] ?? host, `${mode}-lobby-guest.png`);

  await assertInView(host, "lobby");
  if (process.env.TEMPO === "fast") await host.app.locator(".setting .seg").first().locator("button").first().click();
  if (mode !== "classic") {
    await host.app.locator(".mode-choice").click();
    await host.app.locator(".mode-card", { hasText: new RegExp(process.env.MODE_LABEL ?? ".", "i") }).first().waitFor();
    await shot(host, `${mode}-modes.png`);
    const index = await host.app.locator("body").evaluate((_, id) => {
      const order = ["classic", "mix", "story", "custom", "stars", "oneline", "kaleido", "crayons", "blind", "telegram", "memory", "sandwich", "same", "scribble", "score", "missing", "masterpiece", "flipbook", "relay", "background", "corpse", "mosaic"];
      return order.indexOf(id);
    }, mode);
    await host.app.locator(".mode-card").nth(index).click();
    await assertInView(host, "mode picker");
    await host.app.locator(".mode-detail .btn:visible, .modes-confirm .btn:visible").first().click();
    if (mode === "custom") {
      const sheet = host.app.locator(".custom-modal");
      await sheet.waitFor();
      if (process.env.ORDER) await sheet.locator(".seg.wrap button").nth(Number(process.env.ORDER)).click();
      if (process.env.RULE) await sheet.locator(".chips button").nth(Number(process.env.RULE)).click();
      await new Promise((r) => setTimeout(r, 500));
      await shot(host, `${mode}-sheet.png`);
      await assertInView(host, "custom sheet");
      await sheet.locator("footer .btn").click();
    }
  }

  await host.app.locator(".launch .btn").click();
  log("match started");
  let round = 0;
  for (;;) {
    // Wait for every tab to leave the countdown.
    await Promise.all(people.map(async (who) => {
      const deadline = Date.now() + 15_000;
      while ((await screenOf(who)) === "countdown" && Date.now() < deadline) await new Promise((r) => setTimeout(r, 200));
    }));
    const screen = await screenOf(host);
    if (screen === "reveal" || screen === "end") break;
    if (round === 0) await shot(host, `${mode}-round0-${screen}.png`);
    if (round > 0 && round < 4) {
      await new Promise((r) => setTimeout(r, 900));
      await shot(people[people.length - 1], `${mode}-round${round}-task.png`).catch(() => {});
    }
    if (process.env.RELOAD && round === 1 && people[1]) {
      log("guest reloads mid-round");
      await people[1].page.reload();
      await people[1].app.locator(".screen").first().waitFor({ timeout: 20_000 });
      await new Promise((r) => setTimeout(r, 1500));
    }
    let kinds;
    const idler = process.env.IDLE ? people[people.length - 1] : null;
    if (round > 0 && round < 4) {
      const screenNow = await screenOf(people[people.length - 1]);
      if (screenNow === "draw" || screenNow === "text" || screenNow === "peek") await assertInView(people[people.length - 1], `round ${round} (${screenNow})`);
    }
    if (idler && round <= 3) {
      if (round === 2) {
        log(`${idler.name} stays but never hands in`);
        await idler.app.locator("body").evaluate(() => {
          const game = window.doodleDrift;
          game.submitText = async () => {};
          game.submitPicture = async () => {};
        });
      }
      if (round === 3) {
        log(`${idler.name} closes the tab`);
        await idler.page.context().close();
        people.pop();
      } else log(`${idler.name} idles through round ${round}`);
      const busy = round === 3 ? people : people.filter((who) => who !== idler);
      kinds = await Promise.all(busy.map((who) => doTask(who, round)));
    } else if (process.env.CLOSE && round === 1 && people.length > 2) {
      kinds = [await doTask(host, round)];
      await new Promise((r) => setTimeout(r, 1500));
      log("host closes the tab");
      await host.page.context().close();
      people.shift();
      host = people[0];
      kinds.push(...(await Promise.all(people.map((who) => doTask(who, round)))));
    } else {
      kinds = await Promise.all(people.map((who) => doTask(who, round)));
    }
    if (process.env.RELOAD && round === 1) {
      log("host reloads after handing in");
      await host.page.reload();
      await host.app.locator(".screen").first().waitFor({ timeout: 20_000 });
    }
    if (round < 4) await shot(host, `${mode}-round${round}-${kinds[0]}-done.png`).catch(() => {});
    log(`round ${round}: ${kinds.join(", ")}`);
    // Wait until the round changes for everyone.
    const deadline = Date.now() + (process.env.CLOSE || process.env.IDLE ? 150_000 : 60_000);
    for (;;) {
      const screens = await Promise.all(people.map(screenOf));
      if (screens.every((s) => s === "countdown" || s === "reveal" || s === "end" || s === "text" || s === "draw" || s === "words" || s === "peek")) break;
      if (Date.now() > deadline) throw new Error(`round ${round} never ended: ${screens.join(", ")}`);
      await new Promise((r) => setTimeout(r, 300));
    }
    round++;
    if (round > 20) throw new Error("too many rounds");
  }
  log(`reveal after ${round} rounds`);
  await new Promise((r) => setTimeout(r, 1500));
  await shot(host, `${mode}-reveal-1.png`);
  await assertInView(host, "reveal");
  await shot(people[1] ?? host, `${mode}-reveal-guest.png`);
  let steps = 0;
  let blanks = 0;
  while ((await screenOf(host)) === "reveal") {
    await new Promise((r) => setTimeout(r, 700));
    blanks += await people[people.length - 1].app.locator(".missing:not(:has(.spinner)), .text-page.empty").count();
    await host.app.locator(".host-ctl .btn").click();
    steps++;
    await new Promise((r) => setTimeout(r, 250));
    if (steps === 2) await shot(host, `${mode}-reveal-2.png`);
    if (steps > 200) throw new Error("reveal never ended");
  }
  log(`end after ${steps} reveal steps, ${blanks} blank pages seen by the last player`);
  await new Promise((r) => setTimeout(r, 2500));
  await shot(host, `${mode}-end.png`);
  await assertInView(host, "end");
  if (process.env.GIF) {
    await host.app.locator(".end-actions .ghost").click();
    await host.app.locator(".modal").waitFor();
    await new Promise((r) => setTimeout(r, 1500));
    await shot(host, `${mode}-gif.png`);
    const [download] = await Promise.all([
      host.page.waitForEvent("download", { timeout: 30_000 }),
      host.app.locator(".modal .btn").click(),
    ]);
    const file = join(reports, `${mode}.gif`);
    await download.saveAs(file);
    log(`gif downloaded: ${download.suggestedFilename()}`);
  }
  if (errors.length) throw new Error(`console errors:\n${errors.join("\n")}`);
  log("ok");
} catch (error) {
  console.error(error);
  if (errors.length) console.error(errors.join("\n"));
  process.exitCode = 1;
} finally {
  await browser.close();
  sim.stop();
}
