/**
 * End-to-end check of the built activity (run `pnpm build` first).
 *
 * 1. In the `stellarr dev` simulator, as a voice-channel room: Ala hosts a table, Bob joins it,
 *    they play; Ala (the referee) reloads mid-game and carries on; Cyd watches and cannot move;
 *    Bob offers a draw, Ala accepts. Then Cyd plays a bot on the same page: Stockfish answers.
 *    Cyd then challenges and Bob accepts, while Ala keeps reviewing her finished game. Bob plays a
 *    puzzle; the ladder ranks the three by Stellarr Elo with both results; Ala watches two bots,
 *    and a fourth person checks the menu, the board and the ladder on a phone.
 * 2. Inside a sandboxed frame without `allow-same-origin`, served with the Content-Security-Policy
 *    Stellarr sends for installed activities (api/.../activities/live.rs): the app starts without
 *    browser storage, its fonts, tables and sounds load, and a bot still answers a move.
 *
 * Screenshots go to reports/. Exits non-zero on the first failed step.
 */

import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";
import { stellarrCli } from "../../scripts/stellarr.mjs";

const root = resolve(import.meta.dirname, "..");
const dist = join(root, "dist");
const reports = join(root, "reports");
mkdirSync(reports, { recursive: true });

function step(name) {
  console.log(`· ${name}`);
}

async function startSimulator() {
  const child = spawn(process.execPath, [stellarrCli(), "dev", "--dir", "dist", "--port", "0", "--mode", "voice"], { cwd: root });
  const origin = await new Promise((resolveOrigin, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error(`stellarr dev did not start:\n${output}`)), 15_000);
    const read = (chunk) => {
      output += chunk;
      const match = output.match(/(http:\/\/[^\s/]+)\//);
      if (match) {
        clearTimeout(timer);
        resolveOrigin(match[1]);
      }
    };
    child.stdout.on("data", read);
    child.stderr.on("data", read);
    child.on("exit", () => reject(new Error(`stellarr dev exited:\n${output}`)));
  });
  return { origin, stop: () => child.kill() };
}

/** A player tab in the simulator: its own token, the activity in the #activity frame. */
async function player(context, origin, name) {
  const page = await context.newPage();
  const errors = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(`${name}: ${message.text()}`); });
  page.on("pageerror", (error) => errors.push(`${name}: ${error.message}`));
  await page.goto(`${origin}/`);
  const app = page.frameLocator("#activity");
  await app.locator(".stats").waitFor({ timeout: 20_000 });
  return { name, page, app, errors };
}

/** Open the sidebar's Play menu and pick an entry. */
async function menu(app, entry) {
  await app.locator(".sidebar__play > button").click();
  await app.getByRole("menuitem", { name: entry }).click();
}

/** The Play button at the foot of the bot screen. */
const playButton = (app) => app.locator(".bot-select__footer button");

async function move(app, from, to) {
  await app.locator(`[data-square="${from}"]`).click();
  await app.locator(`[data-square="${to}"]`).click();
}

const FIGURINES = { "♔": "K", "♕": "Q", "♖": "R", "♗": "B", "♘": "N", "♚": "K", "♛": "Q", "♜": "R", "♝": "B", "♞": "N" };

/** The move list as plain SAN (the table shows piece letters as figurines). */
async function sanList(who) {
  const text = await who.app.locator(".move-table").innerText();
  return text.replace(/[♔♕♖♗♘♚♛♜♝♞]/g, (figure) => FIGURINES[figure]);
}

/** Half-moves in a move list's text. */
function plies(text) {
  return text.split(/\s+/).filter((token) => /^[a-hKQRBNO♔♕♖♗♘♚♛♜♝♞]/.test(token)).length;
}

async function waitForText(who, text, timeout = 15_000) {
  await who.app.getByText(text, { exact: false }).first().waitFor({ timeout });
}

async function waitForMoves(who, needle) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if ((await sanList(who)).includes(needle)) return;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`${who.name} never saw ${needle}; move list: ${await sanList(who)}`);
}

/** Whether an element sits fully inside the side panel and the window (nothing pushed out of view). */
async function inPanel(app, selector) {
  return app.locator("body").evaluate((_, sel) => {
    const element = document.querySelector(sel);
    const panel = document.querySelector(".right-panel");
    if (!element || !panel) return false;
    const box = element.getBoundingClientRect();
    const frame = panel.getBoundingClientRect();
    return box.top >= frame.top - 1 && box.bottom <= frame.bottom + 1 && box.bottom <= window.innerHeight + 1;
  }, selector);
}

/** Moves for White that stay legal whatever a bot answers early on (tried in order). */
const QUIET = ["g1f3", "b1c3", "h1g1", "a1b1", "g1h1", "b1a1", "e2e3", "d2d3", "a2a3", "h2h3", "f3g1", "c3b1"];

/** Chaos against Iskra: four moves, the draft, a card played (with its square if it asks), the bot's card, play on. */
async function chaosGame(who) {
  const { app, page } = who;
  await app.locator(".sidebar__nav").getByRole("button", { name: "Chaos Chess", exact: true }).click();
  // The Chaos menu: its own opponents; Iskra, who reaches for Arcane cards.
  await app.locator(".chaos-page").waitFor();
  await page.screenshot({ path: join(reports, "chaos-menu.png") });
  await app.locator(".chaos-rival", { hasText: "Iskra" }).click();
  await app.locator(".chaos-setup").getByRole("radio", { name: "White", exact: true }).click();
  await app.locator(".chaos-setup__play").click();
  await app.locator(".chaos-panel__head").waitFor();
  const tab = (name) => app.locator(".chaos-panel__tabs").getByRole("tab", { name }).click();
  // The moves are a tab away from the cards in play.
  await tab(/Moves/);
  const deadline = Date.now() + 90_000;
  while (!(await app.locator(".draft").count())) {
    if (Date.now() > deadline) throw new Error(`No Chaos draft; moves: ${await sanList(who)}`);
    const before = plies(await sanList(who));
    const myTurn = before % 2 === 0;
    if (myTurn) {
      for (const uci of QUIET) {
        await move(app, uci.slice(0, 2), uci.slice(2));
        await new Promise((r) => setTimeout(r, 150));
        if (plies(await sanList(who)) > before || (await app.locator(".draft").count())) break;
        await app.locator("body").press("Escape").catch(() => undefined);
      }
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  await app.locator(".chaos-card").first().waitFor();
  await page.screenshot({ path: join(reports, "chaos-draft.png") });
  await app.locator(".draft__play").click();
  // A targeted card waits for its square on the board.
  if (await app.locator(".target-banner").count()) {
    for (let step = 0; step < 2 && (await app.locator(".target-banner").count()); step++) {
      await app.locator(".square--target").first().click();
    }
  }
  await app.locator(".draft").waitFor({ state: "detached", timeout: 15_000 });
  await tab(/Effects/);
  await app.locator(".chronicle__row").first().waitFor();
  const pickedRound = await app.locator(".chronicle__row.is-draft").first().innerText();
  if (!/Iskra/.test(pickedRound)) throw new Error(`The bot did not draw its card: ${pickedRound}`);
  await page.screenshot({ path: join(reports, "chaos-effects.png") });
  if (!(await inPanel(app, ".game-tab__controls"))) throw new Error("The Chaos panel pushed the game controls out of view.");
  await tab(/Moves/);
  // The game goes on after the draft: the next move is played.
  const afterDraft = plies(await sanList(who));
  const resume = Date.now() + 20_000;
  while (plies(await sanList(who)) === afterDraft) {
    if (Date.now() > resume) throw new Error("The game did not go on after the draft.");
    if (afterDraft % 2 === 0) {
      for (const uci of QUIET) {
        await move(app, uci.slice(0, 2), uci.slice(2));
        await new Promise((r) => setTimeout(r, 150));
        if (plies(await sanList(who)) > afterDraft) break;
      }
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  await page.screenshot({ path: join(reports, "chaos-game.png") });
  // The game ends; the cards changed the board, yet the game is recorded, without an engine review.
  await app.getByRole("button", { name: "Resign" }).first().click();
  await waitForText(who, "by resignation");
  await app.locator(".sidebar__nav").getByRole("button", { name: "Statistics", exact: true }).click();
  const row = app.locator(".stats-recent li").first();
  await row.getByText("Chaos Chess").waitFor();
  if (await row.locator(".link").count()) throw new Error("A Chaos game offers an engine review.");
  await page.screenshot({ path: join(reports, "stats-after-chaos.png") });
}

async function simulatorRun(browser) {
  const { origin, stop } = await startSimulator();
  step(`simulator at ${origin}`);
  const context = await browser.newContext({ viewport: { width: 1360, height: 860 }, locale: "en-US" });
  const everyone = [];
  try {
    const ala = await player(context, origin, "Ala");
    const bob = await player(context, origin, "Bob");
    const cyd = await player(context, origin, "Cyd");
    everyone.push(ala, bob, cyd);

    step("Ala hosts a table in Multiplayer as White, 3 | 2");
    await ala.app.locator(".sidebar__nav").getByRole("button", { name: "Multiplayer" }).click();
    await ala.app.getByRole("radio", { name: "3 | 2" }).click();
    await ala.app.locator(".side-pick").getByRole("radio", { name: "White", exact: true }).click();
    await ala.app.getByRole("button", { name: "Host a table" }).click();
    await waitForText(ala, "waiting for someone to join");

    step("Bob sees the table in the Play menu and joins it");
    await bob.app.locator(".sidebar__play > button").click();
    await waitForText(bob, "is hosting a table");
    await bob.page.screenshot({ path: join(reports, "flyout.png") });
    await bob.app.getByRole("menuitem", { name: /Multiplayer/ }).click();
    await bob.app.locator(".mp-table").getByRole("button", { name: "Join", exact: true }).first().click();
    await ala.app.locator(".room-strip").waitFor();
    await bob.app.locator(".room-strip").waitFor();

    step("They play 1. e4 e5 2. Nf3");
    await move(ala.app, "e2", "e4");
    await waitForMoves(bob, "e4");
    await move(bob.app, "e7", "e5");
    await waitForMoves(ala, "e5");

    step("Ala reloads mid-game and gets her game back");
    await ala.page.reload();
    await ala.app.locator(".room-strip").waitFor({ timeout: 20_000 });
    await waitForMoves(ala, "e5");
    await move(ala.app, "g1", "f3");
    await waitForMoves(bob, "Nf3");

    step("Cyd picks the game from the tables, watches, and cannot move a piece");
    await cyd.app.locator(".sidebar__nav").getByRole("button", { name: "Multiplayer" }).click();
    await cyd.app.locator(".mp-table").getByRole("button", { name: "Watch", exact: true }).first().click();
    await cyd.app.locator(".room-strip").waitFor();
    await waitForMoves(cyd, "Nf3");
    await move(cyd.app, "b8", "c6");
    if ((await sanList(cyd)).includes("Nc6")) throw new Error("A watcher could move.");
    await cyd.page.screenshot({ path: join(reports, "watcher.png") });

    step("Bob offers a draw, Ala accepts");
    await bob.app.getByRole("button", { name: "Offer a draw" }).first().click();
    await waitForText(ala, "offers a draw");
    await ala.page.screenshot({ path: join(reports, "draw-offer.png") });
    await ala.app.getByRole("button", { name: "Accept", exact: true }).click();
    await waitForText(bob, "by agreement");
    await waitForText(cyd, "by agreement");
    await bob.page.screenshot({ path: join(reports, "online-result.png") });

    step("Cyd hosts a table; Bob joins; Ala hosts another while they play; Cyd resigns");
    await cyd.app.locator(".sidebar__nav").getByRole("button", { name: "Multiplayer" }).click();
    await cyd.app.getByRole("button", { name: "Host a table" }).click();
    await bob.app.locator(".sidebar__nav").getByRole("button", { name: "Multiplayer" }).click();
    await bob.app.locator(".mp-table").getByRole("button", { name: "Join", exact: true }).first().click();
    await cyd.app.locator(".room-strip").waitFor();
    await bob.app.locator(".room-strip").waitFor();
    // Ala is still looking back at her finished game: it stays on her board.
    await waitForText(ala, "by agreement");
    // Then she opens a second table: two at once, one being played and one waiting.
    await ala.app.locator(".sidebar__nav").getByRole("button", { name: "Multiplayer" }).click();
    await ala.app.getByRole("button", { name: "Host a table" }).click();
    await ala.app.locator(".mp-table").nth(1).waitFor();
    await ala.page.screenshot({ path: join(reports, "tables.png") });
    await cyd.app.getByRole("button", { name: "Resign" }).first().click();
    await waitForText(bob, "by resignation");

    step("Cyd plays Glut, the level-1 slime; Stockfish answers");
    await menu(cyd.app, /Play a bot/);
    await cyd.app.getByRole("radio", { name: /Glut/ }).click();
    await cyd.app.locator(".side-pick").getByRole("radio", { name: "White", exact: true }).click();
    await playButton(cyd.app).click();
    await move(cyd.app, "d2", "d4");
    await cyd.app.locator(".square--last-move").nth(1).waitFor();
    const deadline = Date.now() + 20_000;
    while (plies(await sanList(cyd)) < 2) {
      if (Date.now() > deadline) throw new Error("The bot never answered.");
      await new Promise((r) => setTimeout(r, 200));
    }
    await cyd.page.screenshot({ path: join(reports, "bot-game.png") });

    step("Bob opens the puzzle of the day, then a test position: the coach and Stockfish's defence take over");
    await bob.app.locator(".sidebar__nav").getByRole("button", { name: "Puzzles", exact: true }).click();
    await bob.app.locator(".puzzles").waitFor();
    await bob.page.screenshot({ path: join(reports, "puzzles.png") });
    await bob.app.locator(".puzzle-daily").getByRole("button", { name: "Solve" }).click();
    await bob.app.locator(".drill").waitFor();
    await bob.app.getByRole("button", { name: "All puzzles" }).click();
    await bob.app.locator(".puzzle-card").first().click();
    await bob.app.locator(".coach").waitFor();
    if (!(await inPanel(bob.app, ".coach__actions"))) throw new Error("The puzzle panel pushed its buttons out of view.");
    await waitForText(bob, "Your move");
    await bob.page.screenshot({ path: join(reports, "position.png") });

    step("Bob starts Puzzle Rush from the Puzzles page; its clock runs beside the board");
    await bob.app.locator(".sidebar__nav").getByRole("button", { name: "Puzzles", exact: true }).click();
    await bob.app.locator(".puzzle-rush__start").click();
    await bob.app.locator(".drill__clock").waitFor();
    if (!(await inPanel(bob.app, ".drill__actions"))) throw new Error("The Puzzle Rush panel pushed its buttons out of view.");
    await bob.page.screenshot({ path: join(reports, "puzzle-rush.png") });
    await bob.app.getByRole("button", { name: "All puzzles" }).click();
    await bob.app.locator(".puzzles").waitFor();

    step("Cyd's finished bot game is on the statistics page");
    await cyd.app.getByRole("button", { name: "Resign" }).first().click();
    await waitForText(cyd, "by resignation");
    await cyd.app.locator(".sidebar__nav").getByRole("button", { name: "Statistics", exact: true }).click();
    await cyd.app.locator(".stats-recent li").first().waitFor();
    await cyd.page.screenshot({ path: join(reports, "stats.png") });
    step("The ladder ranks the session by Stellarr Elo: Bob won a game, Ala drew one, Cyd lost one");
    await cyd.app.locator(".sidebar__nav").getByRole("button", { name: "Ladder", exact: true }).click();
    await cyd.app.locator(".elo-table").waitFor();
    const ranking = async () => (await cyd.app.locator(".elo-table tbody tr").allInnerTexts()).map((row) => row.replace(/\s+/g, " "));
    const rankDeadline = Date.now() + 10_000;
    let rows = await ranking();
    // The simulator names everyone "Player …": Bob is first on 1216 after a draw and a win, Cyd ("you") last on 1184.
    while (!(rows.length === 3 && / 1216 \+16 2 1–1–0/.test(rows[0]) && / 1200 ±0 1 0–1–0/.test(rows[1]) && / you 1184 −16 1 0–0–1/.test(rows[2]))) {
      if (Date.now() > rankDeadline) throw new Error(`The ranking is off: ${JSON.stringify(rows)}`);
      await new Promise((r) => setTimeout(r, 200));
      rows = await ranking();
    }
    if ((await cyd.app.locator(".elo-result").count()) !== 2) throw new Error("The session's results are missing a game.");
    if (!/1184/.test(await cyd.app.locator(".elo-me__value").innerText())) throw new Error("Cyd's own Elo card did not move.");
    if (!/Stellarr Elo 1216/.test(await bob.app.locator(".sidebar__me").innerText())) throw new Error("Bob's sidebar does not show his Elo.");
    await cyd.page.screenshot({ path: join(reports, "ladder-players.png") });
    await cyd.app.getByRole("tab", { name: "Bots" }).click();
    await cyd.app.locator(".ladder-grid").waitFor();
    await cyd.page.screenshot({ path: join(reports, "ladder.png") });

    step("Bob reloads: his Elo comes back from his Stellarr progress, counted once");
    // Progress is saved shortly after a change; give it time to reach the simulator.
    await new Promise((r) => setTimeout(r, 1_500));
    await bob.page.reload();
    await bob.app.locator(".stats").waitFor({ timeout: 20_000 });
    await bob.app.locator(".sidebar__nav").getByRole("button", { name: "Ladder", exact: true }).click();
    await bob.app.locator(".elo-table tr.is-me").waitFor();
    const bobRow = (await bob.app.locator(".elo-table tr.is-me").innerText()).replace(/\s+/g, " ");
    if (!/ you 1216 \+16 2 1–1–0/.test(bobRow)) throw new Error(`Bob's rating did not survive a reload: ${bobRow}`);
    if (!/Stellarr Elo 1216/.test(await bob.app.locator(".sidebar__me").innerText())) throw new Error("Bob's sidebar lost his Elo after a reload.");

    if (await cyd.app.locator(".sidebar__nav").getByRole("button", { name: "Chaos Chess", exact: true }).count()) {
      step("Cyd plays Chaos Chess: after four moves the draft stops the game");
      await chaosGame(cyd);
    } else {
      step("Chaos Chess is hidden: no entry in the menu");
    }

    step("Ala watches two bots play each other");
    await menu(ala.app, /Bot vs bot/);
    await playButton(ala.app).click();
    const watchDeadline = Date.now() + 20_000;
    while (plies(await sanList(ala)) < 2) {
      if (Date.now() > watchDeadline) throw new Error("The bots never played.");
      await new Promise((r) => setTimeout(r, 200));
    }
    await ala.page.screenshot({ path: join(reports, "bot-match.png") });

    step("On a phone: the menu and the channel board");
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "pl-PL" });
    try {
      const dee = await player(phone, origin, "Dee");
      everyone.push(dee);
      await dee.page.screenshot({ path: join(reports, "phone-menu.png") });
      await dee.app.locator(".sidebar__play > button").click();
      await dee.app.locator(".flyout").waitFor();
      await dee.page.screenshot({ path: join(reports, "phone-flyout.png") });
      await dee.app.locator(".sidebar__play > button").click();
      await dee.app.locator(".sidebar__nav").getByRole("button", { name: "Multiplayer" }).click();
      await dee.app.locator(".mp-page").waitFor();
      await dee.page.screenshot({ path: join(reports, "phone-room.png") });
      const sideways = () => dee.app.locator("body").evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      let overflow = await sideways();
      if (overflow > 1) throw new Error(`The phone layout scrolls sideways by ${overflow}px.`);
      await dee.app.locator(".sidebar__nav").getByRole("button", { name: /^(Ladder|Drabinka)$/ }).click();
      await dee.app.locator(".elo-table").waitFor();
      await dee.page.screenshot({ path: join(reports, "phone-ladder.png"), fullPage: true });
      overflow = await sideways();
      if (overflow > 1) throw new Error(`The phone ladder scrolls sideways by ${overflow}px.`);
      // Dee has played nothing, yet her card reached the room as soon as she arrived.
      await cyd.app.getByRole("tab", { name: "Players" }).click();
      const cardDeadline = Date.now() + 10_000;
      while ((await cyd.app.locator('.elo-table tbody tr[data-card="room"]').count()) < 4) {
        if (Date.now() > cardDeadline) throw new Error("A newcomer's card never reached the room.");
        await new Promise((r) => setTimeout(r, 200));
      }
    } finally {
      await phone.close();
    }

    const errors = everyone.flatMap((who) => who.errors).filter((text) => !/Not accepted|favicon/.test(text));
    if (errors.length) throw new Error(`Console errors:\n${errors.join("\n")}`);
  } catch (error) {
    for (const who of everyone) await who.page.screenshot({ path: join(reports, `failed-${who.name}.png`) }).catch(() => undefined);
    const errors = everyone.flatMap((who) => who.errors);
    if (errors.length) console.error(errors.join("\n"));
    throw error;
  } finally {
    await context.close();
    stop();
  }
}

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".wav": "audio/wav", ".woff2": "font/woff2", ".woff": "font/woff" };

/** Stellarr's policy for an installed activity's files (live.rs), for a release served under `files`. */
function activityPolicy(origin, files) {
  return [
    "sandbox allow-scripts allow-forms allow-presentation",
    "default-src 'none'",
    `script-src ${files} ${origin}/_stellarr/sdk/ 'unsafe-inline' 'wasm-unsafe-eval'`,
    `style-src ${files} 'unsafe-inline'`,
    `img-src ${files} ${origin}/assets/ data: blob:`,
    `media-src ${files} blob:`,
    `font-src ${files} data:`,
    `connect-src ${files} ${origin}/_stellarr/sdk/`,
    `worker-src ${files} blob:`,
    "frame-src 'none'",
    `frame-ancestors ${origin}`,
    "base-uri 'none'",
    "form-action 'none'",
    "object-src 'none'",
  ].join("; ");
}

/** The built app inside `sandbox="allow-scripts"`, served with CORS and the policy Stellarr uses. */
async function opaqueRun(browser) {
  let origin = "";
  const server = createServer((req, res) => {
    const path = new URL(req.url, "http://x").pathname;
    if (path === "/host.html") {
      res.writeHead(200, { "content-type": "text/html" }).end('<!doctype html><iframe id="activity" sandbox="allow-scripts" src="/app/" style="width:1300px;height:820px;border:0"></iframe>');
      return;
    }
    const file = join(dist, decodeURIComponent(path.replace(/^\/app/, "")).replace(/\/$/, "/index.html"));
    let body;
    try {
      body = readFileSync(file);
    } catch {
      res.writeHead(404, { "access-control-allow-origin": "*" }).end();
      return;
    }
    res.writeHead(200, {
      "content-type": TYPES[extname(file)] ?? "application/octet-stream",
      "access-control-allow-origin": "*",
      "content-security-policy": activityPolicy(origin, `${origin}/app/`),
    }).end(body);
  }).listen(0);
  origin = `http://localhost:${server.address().port}`;
  const context = await browser.newContext({ viewport: { width: 1320, height: 840 }, locale: "pl-PL" });
  try {
    const page = await context.newPage();
    const errors = [];
    const policy = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      const text = message.text();
      // There is no Stellarr host here: the SDK import fails and the app falls back to solo play.
      if (/_stellarr\/sdk\/v1\.js|Failed to fetch dynamically imported module|404/.test(text)) return;
      (/Content Security Policy/.test(text) ? policy : errors).push(text);
    });
    await page.goto(`${origin}/host.html`);
    const app = page.frameLocator("#activity");
    step("opaque origin: the menu loads without browser storage");
    await app.locator(".stats").waitFor({ timeout: 20_000 });
    step("opaque origin: Stockfish answers a move");
    // The empty statistics page leads to the first rung of the ladder.
    await app.locator(".first-game__actions .btn--green").click();
    await app.locator(".side-pick").getByRole("radio", { name: "Białe", exact: true }).click();
    await playButton(app).click();
    await move(app, "e2", "e4");
    const deadline = Date.now() + 20_000;
    while (plies(await app.locator(".move-table").innerText()) < 2) {
      if (Date.now() > deadline) throw new Error("No bot move inside the opaque-origin frame.");
      await new Promise((r) => setTimeout(r, 200));
    }
    await page.screenshot({ path: join(reports, "opaque-origin.png") });
    step("opaque origin: fonts, opening names and sounds loaded under the policy");
    const loaded = await app.locator("body").evaluate(async () => {
      await document.fonts.ready;
      return { montserrat: document.fonts.check("700 16px Montserrat"), noto: document.fonts.check("400 16px 'Noto Sans'") };
    });
    if (!loaded.montserrat || !loaded.noto) throw new Error(`Fonts missing: ${JSON.stringify(loaded)}`);
    await app.locator(".opening-row b").first().waitFor({ timeout: 10_000 });
    if (policy.length) throw new Error(`Blocked by the activity policy:\n${policy.join("\n")}`);
    if (errors.length) throw new Error(`Page errors:\n${errors.join("\n")}`);
  } finally {
    await context.close();
    server.close();
  }
}

const browser = await chromium.launch();
try {
  await simulatorRun(browser);
  await opaqueRun(browser);
  console.log("Browser check passed.");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
