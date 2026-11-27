/**
 * End-to-end check of the built activity (run `pnpm build` first).
 *
 * 1. In the `stellarr dev` simulator as a voice-channel room, with its offline GIFs: Ala (host),
 *    Bob and Cyd see the lobby warn when GIFs are off for one player or for the instance, then
 *    play a whole five-round match in Zakaz słów: topic vote, search, send, stickers in the
 *    reveal, vote, results. Bob reloads mid-search and keeps his GIF; the word ban refuses a
 *    topic word; Dee joins in round two and watches; Ala closes her tab in round three and the
 *    match goes on under a new host, who takes everyone back to the lobby at the end.
 * 2. The built app inside `sandbox="allow-scripts"` with Stellarr's content security policy:
 *    no browser storage, bundled fonts and pictures only.
 *
 * Screenshots go to reports/e2e/. Exits non-zero on the first failed step.
 */
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";
import { stellarrCli } from "./stellarr.mjs";

const root = resolve(import.meta.dirname, "..");
const dist = join(root, "dist");
const reports = join(root, "reports/e2e");
mkdirSync(reports, { recursive: true });
const step = (name) => console.log(`· ${name}`);

async function startSimulator() {
  const child = spawn(process.execPath, [stellarrCli(), "dev", "--dir", "dist", "--port", "0", "--mode", "voice"], { cwd: root });
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

/** What each player reads, by their language. Ala and Cyd play in Polish, Bob and Dee in English. */
const L = {
  pl: {
    players3: "Gracze z kanału: 3 z 8", players: /Gracze z kanału/, start: "Zaczynamy", send: "Wyślij", sent: /Wysłane/, haha: /Naklejka haha/,
    topic: "wybór tematu", gif: "wybór GIF-a", search: "szukasz GIF-a", caption: "piszesz napis", show: "Pokaz", vote: "głosowanie", results: "wynik",
    voteBtn: "Głosuj", watching: "Oglądasz tę grę", gameOver: "Koniec gry", lobby: "Wróć do lobby", bannedHit: "jest w temacie",
    noGifs: "Bez GIF-ów nie zagramy", endGame: "Zakończ grę", endNow: "Zakończ", declined: "masz wyłączone w ustawieniach prywatności", banned: /Zakaz słów/, others: "inni szukają",
  },
  en: {
    players3: "Players in the channel: 3 of 8", players: /Players in the channel/, start: "Let's play", send: "Send", sent: /Sent/, haha: /Sticker haha/,
    topic: "pick a topic", gif: "pick a GIF", search: "find a GIF", caption: "write a caption", show: "Show", vote: "voting", results: "results",
    voteBtn: "Vote", watching: "You're watching this game", gameOver: "Game over", lobby: "Back to the lobby", bannedHit: "is in the topic",
    noGifs: "Can't play without GIFs", endGame: "End game", endNow: "End it", declined: "GIFs are off in your Stellarr privacy settings", banned: /Banned words/, others: "the others are searching",
    director: "Director", captions: "Captions", pick: "Pick this one", picksWinner: "director's pick",
  },
};

async function enter(browser, origin, name, lang) {
  // One context per player: its own simulator identity, and the browser language Stellarr reports.
  const context = await browser.newContext({ locale: lang === "pl" ? "pl-PL" : "en-US", viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on("console", (m) => { if (m.type() === "error") errors.push(`${name}: ${m.text()}`); });
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  await page.goto(`${origin}/`);
  const app = page.frameLocator("#activity");
  await app.locator(".screen").first().waitFor({ timeout: 20_000 });
  return { name, page, app, context, l: L[lang] };
}

const shot = (who, file) => who.page.screenshot({ path: join(reports, `${file}.png`) });
const phaseText = (who, key, timeout = 30_000) => who.app.locator(".bar-center", { hasText: who.l[key] }).waitFor({ timeout });

/**
 * Leaves the frame and comes back, like a player returning from Stellarr's settings (the lobby
 * asks about GIFs again when its window gets focus), until `check` holds.
 */
async function until(who, check, what) {
  for (let i = 0; i < 20; i++) {
    await who.page.mouse.click(4, 4);
    await who.page.waitForTimeout(1_100);
    await who.app.locator(".lobby-title").click();
    if (await check()) return;
    await who.page.waitForTimeout(600);
  }
  throw new Error(`${who.name}: ${what}`);
}

/**
 * The host ends the match early with the header button and its confirmation, sees the final
 * screen, and takes everyone back to the lobby. Guests don't get the button.
 */
async function endEarly(host, guest) {
  if (await guest.app.locator(".end-btn").count()) throw new Error(`${guest.name} (not the host) sees the end-game button`);
  await host.app.getByRole("button", { name: host.l.endGame }).click();
  await host.app.getByRole("button", { name: host.l.endNow, exact: true }).click();
  await phaseText(host, "gameOver", 10_000);
  await phaseText(guest, "gameOver", 10_000);
  await host.app.getByRole("button", { name: host.l.lobby }).click();
  await host.app.getByText(host.l.players).waitFor({ timeout: 10_000 });
}

/** Searches that no topic contains, so the word ban never refuses them. */
const QUERIES = ["lama", "wiewiorka", "rakieta"];

async function sendGifs(players, round, hooks = {}) {
  for (const [i, p] of players.entries()) {
    const query = QUERIES[i % QUERIES.length];
    await p.app.locator("#q").fill(query);
    const mine = p.app.locator(`.result[aria-label^="${query}"]`).first();
    await mine.waitFor({ timeout: 15_000 });
    await mine.click();
    await p.app.getByRole("button", { name: p.l.send, exact: true }).click();
    // The last send closes the search early, so only the others wait for the confirmation.
    if (i < players.length - 1) await p.app.getByRole("button", { name: p.l.sent }).waitFor({ timeout: hooks.slowHost ? 40_000 : 10_000 });
    if (i === 0 && round === 1) await shot(p, "r1-search-sent");
    if (hooks.afterSend && i === 1) await hooks.afterSend(p);
  }
}

async function playRound(round, everyone, roster, hooks = {}) {
  let players = everyone;
  let [lead] = players;
  step(`round ${round}: topic`);
  await phaseText(lead, "topic");
  if (round === 1) {
    const pl = await players.find((p) => p.l === L.pl).app.locator(".topic-text").first().textContent();
    const en = await players.find((p) => p.l === L.en).app.locator(".topic-text").first().textContent();
    if (pl === en) throw new Error(`the topic reads the same in both languages: ${pl}`);
    step(`round 1: the topic in Polish "${pl}", in English "${en}"`);
  }
  for (const p of players) await p.app.locator(".topic-card").first().click();

  step(`round ${round}: search`);
  for (const p of players) await phaseText(p, "search");
  if (hooks.beforeSearch) await hooks.beforeSearch();
  players = players.filter((p) => !p.page.isClosed());
  [lead] = players;
  await sendGifs(players, round, hooks);

  step(`round ${round}: reveal and stickers`);
  await phaseText(lead, "show", 30_000);
  await players[1].app.getByRole("button", { name: players[1].l.haha }).click();
  await lead.app.locator(".flying").first().waitFor({ timeout: 5_000 });
  if (round === 1) await shot(lead, "r1-reveal");

  step(`round ${round}: vote`);
  for (const p of players) await phaseText(p, "vote", 30_000);
  for (const p of players) await p.app.getByRole("button", { name: p.l.voteBtn, exact: true }).first().click();
  if (round === 1) await shot(lead, "r1-vote");

  step(`round ${round}: results`);
  await phaseText(lead, "results", 25_000);
  const rows = await lead.app.locator(".table li").count();
  if (rows !== roster) throw new Error(`results table has ${rows} rows, expected ${roster}`);
  if (round === 1) await shot(lead, "r1-results");
}

async function simulatorRun(browser) {
  const sim = await startSimulator();
  const tabs = [];
  try {
    step("three players join: Ala and Cyd in Polish, Bob in English");
    const ala = await enter(browser, sim.origin, "Ala", "pl");
    const bob = await enter(browser, sim.origin, "Bob", "en");
    const cyd = await enter(browser, sim.origin, "Cyd", "pl");
    tabs.push(ala, bob, cyd);
    await ala.app.getByText(ala.l.players3).waitFor();
    await bob.app.getByText(bob.l.players3).waitFor();
    await shot(ala, "lobby-host");
    await shot(bob, "lobby-guest-en");
    if (await bob.app.getByRole("button", { name: bob.l.start }).count()) throw new Error("a guest sees the start button");

    step("GIFs off for one player: that player is told");
    await cyd.page.getByLabel("GIFs").selectOption("declined");
    await until(cyd, () => cyd.app.getByText(cyd.l.declined).isVisible(), "no note about GIFs being off");
    await shot(cyd, "lobby-gifs-declined");
    await cyd.page.getByLabel("GIFs").selectOption("on");
    await until(cyd, async () => !(await cyd.app.locator(".gif-note").count()), "the note stays after GIFs are back");

    step("GIFs off on the instance: the host can't start");
    await ala.page.getByLabel("GIFs").selectOption("unavailable");
    await until(ala, () => ala.app.getByRole("button", { name: ala.l.noGifs }).isDisabled(), "the host can still start without GIFs");
    await shot(ala, "lobby-gifs-unavailable");
    await ala.page.getByLabel("GIFs").selectOption("on");
    await until(ala, () => ala.app.getByRole("button", { name: ala.l.start }).isEnabled(), "the start button stays off");

    step("host picks 5 rounds, 30 s and Zakaz słów, then starts");
    await ala.app.getByRole("button", { name: "5", exact: true }).click();
    await ala.app.getByRole("button", { name: "30 s", exact: true }).click();
    await ala.app.getByRole("button", { name: ala.l.banned }).click();
    await bob.app.locator(".seg button.on", { hasText: "30 s" }).waitFor();
    await bob.app.locator(".mode.on", { hasText: "Banned words" }).waitFor();
    await ala.app.getByRole("button", { name: ala.l.start }).click();

    let players = [ala, bob, cyd];
    let dee = null;
    for (let round = 1; round <= 5; round++) {
      const hooks = {};
      if (round === 1) {
        hooks.afterSend = async (p) => {
          step("Bob reloads after sending and still has his GIF");
          await p.page.reload();
          await p.app.locator(".screen").first().waitFor({ timeout: 20_000 });
          if ((await p.app.locator(".bar-center").textContent()).includes(p.l.search)) {
            await p.app.getByRole("button", { name: p.l.sent }).waitFor({ timeout: 10_000 });
          }
        };
      }
      if (round === 2) {
        hooks.beforeSearch = async () => {
          step("the word ban refuses a word from the topic (in each player's language)");
          for (const who of [ala, bob]) {
            const banned = (await who.app.locator(".banned").first().textContent()).trim();
            await who.app.locator("#q").fill(banned);
            await who.app.getByText(who.l.bannedHit).waitFor({ timeout: 5_000 });
          }
        };
      }
      if (round === 3) {
        hooks.slowHost = true;
        hooks.beforeSearch = async () => {
          step("Ala (the host) closes her tab mid-search; the round goes on under a new host");
          await ala.page.close();
        };
      }
      await playRound(round, players, 3, hooks);
      if (round === 3) players = [bob, cyd];
      if (round === 2) {
        step("Dee joins (in English) and watches");
        dee = await enter(browser, sim.origin, "Dee", "en");
        tabs.push(dee);
        await dee.app.getByText(dee.l.watching).waitFor({ timeout: 15_000 });
        await shot(dee, "r2-watching");
      }
    }

    step("final");
    await phaseText(bob, "gameOver", 25_000);
    await bob.app.locator(".podium li").first().waitFor();
    await shot(bob, "final-en");
    await bob.app.getByRole("button", { name: bob.l.lobby }).click();
    await cyd.app.getByText(cyd.l.players).waitFor({ timeout: 10_000 });
    step("back in the lobby with the new host");

    // ---------------------------------------------------------------- Director
    step("Director: Bob, Cyd and Dee");
    const trio = [bob, cyd, dee];
    await bob.app.getByRole("button", { name: /Director/ }).click();
    await cyd.app.locator(".mode.on", { hasText: "Reżyser" }).waitFor();
    await bob.app.getByRole("button", { name: bob.l.start }).click();
    await phaseText(bob, "topic");
    if (await cyd.app.locator(".topic-card:not([disabled])").count()) throw new Error("someone other than the director can pick the topic");
    await bob.app.locator(".topic-card").first().click();
    await phaseText(bob, "others");
    await shot(bob, "director-waits-en");
    await sendGifs([cyd, dee], 0);
    await phaseText(bob, "show", 30_000);
    await phaseText(bob, "picksWinner", 40_000);
    if (await cyd.app.getByRole("button", { name: "Głosuj" }).count()) throw new Error("a player can vote in Director mode");
    await bob.app.getByRole("button", { name: bob.l.pick }).first().click();
    await phaseText(bob, "results", 15_000);
    const points = await bob.app.locator(".lockup-points").textContent();
    if (!points.includes("3")) throw new Error(`the director's pick is worth ${points}`);
    await shot(bob, "director-results-en");
    step("the host ends the Director match early");
    await endEarly(bob, cyd);

    // ---------------------------------------------------------------- Captions
    step("Captions: the host offers two GIFs, everyone writes a caption");
    await bob.app.getByRole("button", { name: /Captions/ }).click();
    await cyd.app.locator(".mode.on", { hasText: "Napisy" }).waitFor();
    await bob.app.getByRole("button", { name: bob.l.start }).click();
    await phaseText(bob, "gif");
    for (const p of trio) {
      const first = p.app.locator(".gif-choice:not([disabled])").first();
      await first.waitFor({ timeout: 15_000 });
      await first.click();
    }
    for (const p of trio) await phaseText(p, "caption");
    const lines = { Bob: "When the Wi-Fi comes back", Cyd: "Ja w poniedziałek o 8:00", Dee: "Me, after one coffee" };
    for (const [i, p] of trio.entries()) {
      await p.app.locator("#napis").fill(lines[p.name]);
      await p.app.locator("#napis").press("Enter");
      if (i < trio.length - 1) await p.app.getByRole("button", { name: p.l.sent }).waitFor({ timeout: 10_000 });
    }
    await phaseText(bob, "show", 20_000);
    const shown = await bob.app.locator(".meme-card.current .meme-topic").textContent();
    if (!Object.values(lines).includes(shown.trim())) throw new Error(`the reveal shows "${shown}", not a caption`);
    for (const p of trio) await phaseText(p, "vote", 30_000);
    await shot(cyd, "captions-vote");
    for (const p of trio) await p.app.getByRole("button", { name: p.l.voteBtn, exact: true }).first().click();
    await phaseText(bob, "results", 15_000);
    await shot(bob, "captions-results-en");
    step("the host ends the Captions match early");
    await endEarly(bob, cyd);
    step("all three modes played");
  } finally {
    for (const t of tabs) await t.context.close().catch(() => {});
    sim.stop();
  }
}

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".webp": "image/webp", ".woff2": "font/woff2" };

/** Stellarr's policy for an installed activity's files (api/.../activities/live.rs). */
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
    "frame-ancestors " + origin,
    "base-uri 'none'",
    "form-action 'none'",
    "object-src 'none'",
  ].join("; ");
}

async function sandboxRun(browser) {
  let origin = "";
  const server = createServer((req, res) => {
    const path = new URL(req.url, "http://x").pathname;
    if (path === "/host.html") {
      res.writeHead(200, { "content-type": "text/html" }).end('<!doctype html><iframe id="activity" sandbox="allow-scripts" src="/app/" style="width:1360px;height:812px;border:0"></iframe>');
      return;
    }
    const file = join(dist, decodeURIComponent(path.replace(/^\/app/, "")).replace(/\/$/, "/index.html"));
    let body;
    try { body = readFileSync(file); } catch { res.writeHead(404, { "access-control-allow-origin": "*" }).end(); return; }
    res.writeHead(200, {
      "content-type": TYPES[extname(file)] ?? "application/octet-stream",
      "access-control-allow-origin": "*",
      "content-security-policy": activityPolicy(origin, `${origin}/app/`),
    }).end(body);
  }).listen(0);
  origin = `http://localhost:${server.address().port}`;
  const context = await browser.newContext({ locale: "pl-PL", viewport: { width: 1380, height: 830 } });
  try {
    const page = await context.newPage();
    const problems = [];
    page.on("pageerror", (e) => problems.push(e.message));
    page.on("console", (m) => {
      if (m.type() !== "error") return;
      // No Stellarr host here: the SDK import fails and the app falls back to a one-player room.
      if (/_stellarr\/sdk\/v1\.js|Failed to fetch dynamically imported module|404/.test(m.text())) return;
      problems.push(m.text());
    });
    await page.goto(`${origin}/host.html`);
    const app = page.frameLocator("#activity");
    await app.getByText("Gracze z kanału").waitFor({ timeout: 20_000 });
    const check = await app.locator("body").evaluate(async () => {
      await document.fonts.ready;
      const cat = document.querySelector(".lobby-cat");
      return {
        fonts: ["600 20px 'Fredoka Variable'", "400 16px 'Atkinson Hyperlegible Next Variable'"].map((f) => [f, document.fonts.check(f)]),
        cat: cat instanceof HTMLImageElement && cat.complete && cat.naturalWidth > 0,
      };
    });
    const missing = check.fonts.filter(([, ok]) => !ok);
    if (missing.length) throw new Error(`fonts missing under the policy: ${JSON.stringify(missing)}`);
    if (!check.cat) throw new Error("the mascot did not load under the policy");
    step("sandbox: the lobby runs without storage, with bundled fonts and pictures");
    await page.screenshot({ path: join(reports, "sandbox.png") });
    if (problems.length) throw new Error(`errors in the sandboxed frame:\n${problems.join("\n")}`);
  } finally {
    await context.close();
    server.close();
  }
}

const browser = await chromium.launch();
try {
  await simulatorRun(browser);
  await sandboxRun(browser);
  // The closed host tab and the reload drop connections on purpose.
  const real = errors.filter((e) => !/WebSocket|ERR_|net::/.test(e));
  if (real.length) throw new Error(`console errors:\n${real.join("\n")}`);
  console.log("browser check passed");
} catch (error) {
  console.error(error);
  if (errors.length) console.error(errors.join("\n"));
  process.exitCode = 1;
} finally {
  await browser.close();
}
