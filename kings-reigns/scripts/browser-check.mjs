/**
 * End-to-end check of the built activity (run `pnpm build` first), in the `stellarr dev`
 * simulator as a voice-channel room. Ala takes the throne, Bob sits as the Treasurer, bots take
 * the other chairs. They play the whole first year: Bob votes by dragging the case card, Ala
 * decrees with the keyboard, both accuse at the trial, the verdict leads into the second year.
 * Cyd joins mid-year on a phone and watches, and Ala ends the reign from the game menu. Then a solo reign, and the
 * built app in Stellarr's sandbox. Screenshots go to reports/. Exits non-zero on the first failed step.
 */

import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(import.meta.dirname, "..");
const stellarrCli = fileURLToPath(new URL("cli.js", import.meta.resolve("@stellarr/sdk")));
const dist = join(root, "dist");
const reports = join(root, "reports");
mkdirSync(reports, { recursive: true });

const step = (name) => console.log(`· ${name}`);

async function startSimulator(mode = "voice") {
  const child = spawn(process.execPath, [stellarrCli, "dev", "--dir", "dist", "--port", "0", "--mode", mode], { cwd: root });
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

async function player(context, origin, name) {
  const page = await context.newPage();
  const errors = [];
  page.on("console", (message) => {
    // Requests the check itself blocks to simulate a dropped connection.
    if (message.type() === "error" && !/ERR_FAILED/.test(message.text())) errors.push(`${name}: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`${name}: ${error.message}`));
  page.on("response", (response) => { if (response.status() === 404) errors.push(`${name}: 404 ${response.url()}`); });
  await page.goto(`${origin}/`);
  const app = page.frameLocator("#activity");
  return { name, page, app, errors };
}

const shot = (who, file) => who.page.screenshot({ path: join(reports, `${file}.png`) });

async function drag(who, side) {
  const box = await who.app.locator(".drag-surface").boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await who.page.mouse.move(x, y);
  await who.page.mouse.down();
  for (let i = 1; i <= 8; i++) await who.page.mouse.move(x + (side === "left" ? -1 : 1) * i * 22, y);
  await who.page.mouse.up();
}

async function main() {
  const sim = await startSimulator();
  const browser = await chromium.launch();
  const all = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const ala = await player(context, sim.origin, "Ala");
    all.push(ala);
    await ala.app.locator(".title").waitFor({ timeout: 20_000 });
    step("menu");
    await shot(ala, "01-menu");

    const bob = await player(context, sim.origin, "Bob");
    all.push(bob);
    await bob.app.locator(".title").waitFor({ timeout: 20_000 });
    for (const who of [ala, bob]) {
      await who.app.getByRole("button", { name: /Zwołaj radę/ }).click();
      await who.app.locator(".lobby").waitFor();
    }
    await ala.app.locator(".chair", { hasText: "Niesprawdzony Władca" }).getByRole("button", { name: "Usiądź" }).click();
    await bob.app.locator(".chair", { hasText: "Strażnik Miar" }).getByRole("button", { name: "Usiądź" }).click();
    await ala.app.locator(".chair.mine", { hasText: "Król" }).waitFor();
    await ala.app.locator(".chair", { hasText: "Strażnik Miar" }).locator(".avatar").waitFor();
    step("lobby: Ala on the throne, Bob as the Treasurer");
    if (!(await ala.app.locator(".mode", { hasText: "Poselstwa" }).isDisabled())) throw new Error("Poselstwa can still be picked in the lobby.");
    step("lobby: Poselstwa are shown as closed");
    await shot(ala, "02-lobby");

    await ala.app.getByRole("button", { name: /Rozpocznij panowanie/ }).click();
    for (const who of [ala, bob]) await who.app.locator(".reveal").waitFor();
    step("role reveal");
    await shot(bob, "03-reveal-bob");
    for (const who of [ala, bob]) await who.app.getByRole("button", { name: /Do stołu/ }).click();
    await ala.app.locator(".omen-card").waitFor();
    step("omen of the year");
    await shot(ala, "04-omen");
    await ala.app.getByRole("button", { name: /Zaczynamy rok/ }).click();

    for (let decree = 1; decree <= 12; decree++) {
      if (decree === 4) {
        step("Bob comes back (a reload keeps his identity) and gets his own note again");
        await bob.page.unroute("**/_stellarr/**");
        await bob.page.reload();
        await bob.app.locator(".caption strong", { hasText: "Skarbnik" }).first().waitFor({ timeout: 30_000 });
        await shot(bob, "12-bob-back");
      }
      const bobHere = decree <= 2 || decree >= 4;
      if (decree === 5) {
        // A late joiner on a phone: every chair is taken, so Cyd watches. Checked in the first
        // year so it runs every time, not only when the realm lasts to the second.
        const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
        const cyd = await player(phone, sim.origin, "Cyd");
        all.push(cyd);
        await cyd.app.locator(".case").first().waitFor({ timeout: 40_000 });
        step("Cyd joins mid-year on a phone and watches");
        await shot(cyd, "13-phone-watcher");
      }
      if (bobHere) await bob.app.locator(".case").waitFor();
      await ala.app.locator(".case").waitFor();
      if (decree === 1) {
        // A drag short of the threshold peeks under the card and falls back.
        const box = await bob.app.locator(".drag-surface").boundingBox();
        await bob.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await bob.page.mouse.down();
        for (let i = 1; i <= 4; i++) await bob.page.mouse.move(box.x + box.width / 2 - i * 18, box.y + box.height / 2);
        await bob.app.locator(".under-text.left").waitFor();
        step("dragging the case card part way reveals the fox and Bob's own numbers");
        await shot(bob, "05-drag-peek");
        await bob.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await bob.page.mouse.up();
      }
      if (decree === 1) {
        // Released over the council panel, far from the card: the drag must end and count.
        const box = await bob.app.locator(".drag-surface").boundingBox();
        const council = await bob.app.locator(".council").boundingBox();
        await bob.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await bob.page.mouse.down();
        for (let i = 1; i <= 10; i++) await bob.page.mouse.move(box.x + box.width / 2 + ((council.x + 60 - box.x - box.width / 2) * i) / 10, box.y + box.height / 2);
        await bob.page.mouse.up();
        await bob.app.getByText("Twój głos: B", { exact: false }).first().waitFor({ timeout: 10_000 });
        if (await bob.app.locator(".case.dragging").count()) throw new Error("The card stayed stuck after a release over the council.");
        step("a drag released over the council ends and counts");
      } else if (decree === 2) {
        // Released outside the activity frame (over the simulator's bar), then back in with no button held.
        const box = await bob.app.locator(".drag-surface").boundingBox();
        await bob.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await bob.page.mouse.down();
        for (let i = 1; i <= 6; i++) await bob.page.mouse.move(box.x + box.width / 2 - i * 30, box.y + box.height / 2 - i * ((box.y + box.height / 2 - 20) / 6));
        await bob.page.mouse.up();
        await bob.page.mouse.move(box.x + box.width / 2 - 180, box.y + box.height / 2);
        await bob.page.mouse.move(box.x + box.width / 2 - 170, box.y + box.height / 2);
        await bob.app.locator(".case.dragging").waitFor({ state: "detached", timeout: 5000 });
        step("a drag released outside the frame does not stick");
        if (!(await bob.app.getByText("Twój głos:", { exact: false }).count())) await drag(bob, "left");
      } else if (bobHere) {
        await drag(bob, decree % 2 ? "left" : "right");
        await bob.app.getByText("Twój głos:", { exact: false }).first().waitFor({ timeout: 10_000 });
      }
      await ala.app.getByText("Rada zagłosowała", { exact: false }).first().waitFor({ timeout: 90_000 });
      if (decree === 1) {
        step("Bob voted by dragging; the bots voted; the King may decree");
        await ala.app.getByRole("button", { name: /Menu/ }).first().click();
        await ala.app.locator(".game-menu").waitFor();
        await shot(ala, "16-game-menu");
        await ala.app.getByRole("button", { name: "Wróć do gry" }).click();
        await ala.app.locator(".game-menu").waitFor({ state: "detached" });
        step("the game menu opens over the council and closes back to it");
        await shot(bob, "06-advisor-voted");
        await shot(ala, "07-king-ready");
      }
      // The King follows the council's majority, as a careful human would.
      const left = await ala.app.locator(".backers.left .backer").count();
      const right = await ala.app.locator(".backers.right .backer").count();
      await ala.app.locator(".case").focus();
      await ala.page.keyboard.press(left >= right ? "ArrowLeft" : "ArrowRight");
      await ala.page.keyboard.press("Enter");
      await ala.app.locator(".decree-card").waitFor({ timeout: 10_000 });
      if (decree === 1) {
        step("decree by keyboard, the proclamation");
        await shot(ala, "08-proclamation");
      }
      if (decree === 2) {
        step("Bob drops for longer than the grace; the rules play his chair");
        await bob.page.route("**/_stellarr/**", (route) => route.abort());
      }
      if (await ala.app.locator(".collapse-line").count()) {
        step(`the realm fell at decree ${decree}`);
        await ala.app.getByRole("button", { name: /Zobacz koniec/ }).click();
        await ala.app.locator(".ending").waitFor();
        await shot(ala, "11-ending");
        await endReignFromMenu(ala, bob);
        return;
      }
      await ala.app.getByRole("button", { name: decree === 12 ? /Na sąd roku/ : /Następny dekret/ }).click();
    }

    await ala.app.locator(".suspects").waitFor();
    step("the trial");
    await ala.app.getByRole("button", { name: /Oskarż: Generał/ }).click();
    await bob.app.getByRole("button", { name: /Oskarż: Generał/ }).click();
    await bob.app.locator(".suspect.chosen").waitFor();
    await bob.page.waitForTimeout(600);
    await shot(bob, "09-trial");
    await ala.app.locator(".verdict-text").waitFor({ timeout: 90_000 });
    step("the verdict");
    await shot(ala, "10-verdict");
    if (await ala.app.getByRole("button", { name: /Dalej: rok drugi/ }).count()) {
      await ala.app.getByRole("button", { name: /Dalej: rok drugi/ }).click();
      await ala.app.locator(".omen-card").waitFor();
      step("the second year opens with a new omen");
      await shot(ala, "11-year-two");
      await ala.app.getByRole("button", { name: /Zaczynamy rok/ }).click();
    }

    await endReignFromMenu(ala, bob);
  } catch (error) {
    for (const who of all) await shot(who, `fail-${who.name}`).catch(() => undefined);
    throw error;
  } finally {
    const errors = all.flatMap((who) => who.errors);
    if (errors.length) console.log("Console errors:\n" + errors.join("\n"));
    await browser.close();
    sim.stop();
  }
}

/** Personal launch: one player, the throne and four bots. */
async function soloRun(browser) {
  const sim = await startSimulator("personal");
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  try {
    const me = await player(context, sim.origin, "Solo");
    await me.app.getByRole("button", { name: /Zasiądź na tronie/ }).click();
    await me.app.locator(".reveal").waitFor({ timeout: 15_000 });
    step("solo: the King's reveal");
    await me.app.getByRole("button", { name: /Do stołu/ }).click();
    await me.app.getByRole("button", { name: /Zaczynamy rok/ }).click();
    await me.app.getByText("Rada zagłosowała", { exact: false }).first().waitFor({ timeout: 30_000 });
    step("solo: four bots voted and reported their numbers");
    await shot(me, "14-solo");
    // End the reign from the menu: alone, that is the title screen, and a new reign starts from there.
    await me.app.getByRole("button", { name: /Menu/ }).first().click();
    await me.app.getByRole("button", { name: "Zakończ panowanie…" }).click();
    await me.app.getByRole("button", { name: "Zakończ panowanie", exact: true }).click();
    await me.app.locator(".title").waitFor({ timeout: 10_000 });
    if (await me.app.getByRole("button", { name: "Poselstwa" }).count()) throw new Error("The title screen still offers Poselstwa.");
    await me.app.getByRole("button", { name: /Zasiądź na tronie/ }).click();
    await me.app.locator(".reveal").waitFor({ timeout: 15_000 });
    await me.app.getByRole("button", { name: /Do stołu/ }).click();
    await me.app.getByRole("button", { name: /Zaczynamy rok/ }).click();
    await me.app.locator(".case").waitFor({ timeout: 15_000 });
    if (await me.app.locator(".toast[role=alert]").count()) throw new Error(`Error toast: ${await me.app.locator(".toast[role=alert]").textContent()}`);
    step("solo: ending the reign from the menu leads back to the title screen and into a new reign");
    if (me.errors.length) throw new Error(me.errors.join("\n"));
  } finally {
    await context.close();
    sim.stop();
  }
}

/** The host ends the reign from the game menu: everyone is back in the lobby and keeps their chair. */
async function endReignFromMenu(ala, bob) {
  await ala.app.getByRole("button", { name: /Menu/ }).first().click();
  await ala.app.getByRole("button", { name: "Zakończ panowanie…" }).click();
  await shot(ala, "17-end-reign");
  await ala.app.getByRole("button", { name: "Zakończ panowanie", exact: true }).click();
  for (const who of [ala, bob]) await who.app.locator(".lobby").waitFor({ timeout: 10_000 });
  await bob.app.locator(".chair.mine").waitFor({ timeout: 5000 });
  step("the host ends the reign from the menu; everyone is back in the lobby with their chairs");
}

/**
 * Not run while Poselstwa are closed (EMBASSY_ENABLED in src/game/features.ts); call it from the
 * chain at the bottom again when they open.
 *
 * Poselstwa in a voice room: Ala on the throne, Bob as the Treasurer. A whole year of dispatches:
 * the channels rotate, only the liaison sees the hidden layer, the seal moves the relation, the
 * trial follows the twelfth dispatch, and the host ends the reign from the menu.
 */
async function embassyRun(browser) {
  const sim = await startSimulator("voice");
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  // Bob plays this one on a phone: the liaison's cards are the tallest thing in the game.
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const all = [];
  try {
    const ala = await player(context, sim.origin, "Ala");
    const bob = await player(phone, sim.origin, "Bob");
    all.push(ala, bob);
    for (const who of [ala, bob]) {
      await who.app.getByRole("button", { name: /Zwołaj radę/ }).click({ timeout: 20_000 });
      await who.app.locator(".lobby").waitFor();
    }
    await ala.app.locator(".mode", { hasText: "Poselstwa" }).click();
    await bob.app.locator(".mode.on", { hasText: "Poselstwa" }).waitFor();
    await ala.app.locator(".chair", { hasText: "Niesprawdzony Władca" }).getByRole("button", { name: "Usiądź" }).click();
    await bob.app.locator(".chair", { hasText: "Strażnik Miar" }).getByRole("button", { name: "Usiądź" }).click();
    await ala.app.locator(".chair", { hasText: "Strażnik Miar" }).locator(".avatar").waitFor();
    step("poselstwa: the host picks the mode, Ala and Bob sit");
    await ala.app.getByRole("button", { name: /Rozpocznij panowanie/ }).click();
    for (const who of [ala, bob]) await who.app.getByRole("button", { name: /Do stołu/ }).click({ timeout: 15_000 });
    await ala.app.getByRole("button", { name: /Zaczynamy rok/ }).click();

    const order = ["Czarna Fala", "Wolne Porty", "Bursztynowy Trakt"];
    let liaisonSeen = false;
    for (let decree = 1; decree <= 12; decree++) {
      // A fresh dispatch: Bob has not picked yet. Waiting on this keeps him off the last sealed one.
      await bob.app.getByText("Kliknij odpowiedź, żeby zagłosować.").waitFor({ timeout: 20_000 });
      await ala.app.locator(".case-panel").waitFor();
      const focus = (await ala.app.locator(".channel.on b").first().textContent())?.trim();
      if (focus !== order[(decree - 1) % 3]) throw new Error(`Dispatch ${decree} went to ${focus}, expected ${order[(decree - 1) % 3]}.`);
      const liaison = (await bob.app.locator(".liaison-line", { hasText: "Jesteś łącznikiem" }).count()) > 0;
      const bobSecrets = await bob.app.locator(".reply-facts.with-secret").count();
      const alaSecrets = await ala.app.locator(".reply-facts.with-secret, .intel-note").count();
      if (alaSecrets) throw new Error(`The King sees the hidden layer at dispatch ${decree}.`);
      if (liaison !== (bobSecrets === 3)) throw new Error(`Bob liaison=${liaison} but sees ${bobSecrets} secret blocks at dispatch ${decree}.`);
      if (liaison && !liaisonSeen) {
        liaisonSeen = true;
        step(`poselstwa: Bob is the liaison at dispatch ${decree} and alone sees the hidden layer`);
        await bob.app.locator(".reply").first().scrollIntoViewIfNeeded();
        await shot(bob, "16-poselstwa-liaison-phone");
        const wide = await bob.app.locator("body").evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        if (wide > 0) throw new Error(`The liaison's screen scrolls sideways on a phone by ${wide}px.`);
      }
      await bob.app.locator(".reply").nth(decree % 3).click();
      await bob.app.getByText("Twój głos:", { exact: false }).first().waitFor({ timeout: 10_000 });
      await ala.app.getByText("Rada zagłosowała", { exact: false }).first().waitFor({ timeout: 30_000 });
      if (decree === 1) {
        step("poselstwa: Bob and the bots voted; the King chooses");
        await shot(ala, "17-poselstwa-king");
        await ala.app.getByRole("button", { name: /Menu/ }).first().click();
        await ala.app.locator(".game-menu").waitFor();
        await shot(ala, "18-menu");
        await ala.app.getByRole("button", { name: "Wróć do gry" }).click();
        await ala.app.locator(".game-menu").waitFor({ state: "detached" });
        step("the game menu opens over the council and closes back to it");
      }
      // The King seals the reply most of the council backed.
      const replies = ala.app.locator(".reply");
      let best = 0, most = -1;
      for (let i = 0; i < 3; i++) {
        const votes = await replies.nth(i).locator(".reply-votes img").count();
        if (votes > most) { most = votes; best = i; }
      }
      const before = Number(await ala.app.locator(".channel.on .relation > b").textContent());
      await replies.nth(best).click();
      await ala.app.getByRole("button", { name: /Opieczętuj/ }).click();
      await ala.app.locator(".decree-card").waitFor({ timeout: 10_000 });
      await bob.app.locator(".decree-card").waitFor({ timeout: 10_000 });
      const line = await ala.app.locator(".decree-card .omen-line").textContent();
      const now = Number(line.match(/teraz (\d+)/)?.[1]);
      const moved = Number(line.match(/: ([+−-]?\d+)/)?.[1].replace("−", "-").replace("+", ""));
      if (now !== Math.max(0, Math.min(100, before + moved))) throw new Error(`Relation went ${before} → ${now} but the seal says ${moved}.`);
      if (decree === 1) {
        step("poselstwa: the seal shows the response and moves the relation");
        await shot(ala, "19-poselstwa-sealed");
      }
      if (await ala.app.locator(".collapse-line").count()) {
        step(`poselstwa: the realm fell at dispatch ${decree}`);
        await ala.app.getByRole("button", { name: /Zobacz koniec/ }).click();
        await ala.app.locator(".ending").waitFor();
        break;
      }
      await ala.app.getByRole("button", { name: decree === 12 ? /Na sąd roku/ : /Następna depesza/ }).click();
      if (decree === 12) {
        await ala.app.locator(".suspects").waitFor();
        step("poselstwa: the trial follows the twelfth dispatch");
      }
    }
    if (!liaisonSeen) step("poselstwa: Bob was never the liaison this year (no secret-layer screenshot)");

    await ala.app.getByRole("button", { name: /Menu/ }).first().click();
    await ala.app.getByRole("button", { name: "Zakończ panowanie…" }).click();
    await ala.app.getByRole("button", { name: "Zakończ panowanie", exact: true }).click();
    for (const who of [ala, bob]) await who.app.locator(".lobby").waitFor({ timeout: 10_000 });
    await bob.app.locator(".chair.mine").waitFor({ timeout: 5000 });
    step("the host ends the reign from the menu; everyone is back in the lobby with their chairs");
    const errors = all.flatMap((who) => who.errors);
    if (errors.length) throw new Error(errors.join("\n"));
  } catch (error) {
    for (const who of all) await shot(who, `fail-poselstwa-${who.name}`).catch(() => undefined);
    throw error;
  } finally {
    await context.close();
    await phone.close();
    sim.stop();
  }
}

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".webp": "image/webp", ".woff2": "font/woff2", ".woff": "font/woff" };

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
    "frame-src 'none'",
    `frame-ancestors ${origin}`,
    "base-uri 'none'",
    "form-action 'none'",
    "object-src 'none'",
  ].join("; ");
}

/** The built app inside `sandbox="allow-scripts"` with Stellarr's policy: no storage, bundled fonts only. */
async function opaqueRun(browser) {
  let origin = "";
  const files = new Map();
  for (const entry of readdirSync(dist, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const file = join(entry.parentPath, entry.name);
    const url = relative(dist, file).split(sep).map(encodeURIComponent).join("/");
    files.set(`/app/${url}`, file);
  }
  files.set("/app/", files.get("/app/index.html"));
  const server = createServer((req, res) => {
    const path = req.url.split("?", 1)[0];
    if (path === "/host.html") {
      res.writeHead(200, { "content-type": "text/html" }).end('<!doctype html><iframe id="activity" sandbox="allow-scripts" src="/app/" style="width:1300px;height:820px;border:0"></iframe>');
      return;
    }
    const file = files.get(path);
    if (!file) {
      res.writeHead(404, { "access-control-allow-origin": "*" }).end();
      return;
    }
    res.writeHead(200, {
      "content-type": TYPES[extname(file)] ?? "application/octet-stream",
      "access-control-allow-origin": "*",
      "content-security-policy": activityPolicy(origin, `${origin}/app/`),
    }).end(readFileSync(file));
  });
  await new Promise((ready) => server.listen(0, "127.0.0.1", ready));
  origin = `http://127.0.0.1:${server.address().port}`;
  const context = await browser.newContext({ viewport: { width: 1320, height: 840 } });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      const text = message.text();
      // No Stellarr host here: the SDK import fails and the app falls back to a solo room.
      if (/_stellarr\/sdk\/v1\.js|Failed to fetch dynamically imported module|404/.test(text)) return;
      errors.push(text);
    });
    await page.goto(`${origin}/host.html`);
    const app = page.frameLocator("#activity");
    await app.getByRole("button", { name: /Zasiądź na tronie/ }).click({ timeout: 20_000 });
    await app.getByRole("button", { name: /Do stołu/ }).click();
    await app.getByRole("button", { name: /Zaczynamy rok/ }).click();
    await app.locator(".case").waitFor();
    step("opaque origin: the game runs without browser storage");
    const fonts = await app.locator("body").evaluate(async () => {
      await document.fonts.ready;
      return ["700 20px 'Grenze Gotisch'", "400 16px 'Alegreya Sans'", "700 20px 'Cormorant Garamond'", "600 14px 'IBM Plex Mono'"].map((font) => [font, document.fonts.check(font)]);
    });
    const missing = fonts.filter(([, ok]) => !ok);
    if (missing.length) throw new Error(`Fonts missing: ${JSON.stringify(missing)}`);
    step("opaque origin: all four bundled fonts loaded under the policy");
    await page.screenshot({ path: join(reports, "15-opaque-origin.png") });
    if (errors.length) throw new Error(`Errors in the sandboxed frame:\n${errors.join("\n")}`);
  } finally {
    await context.close();
    server.close();
  }
}

main()
  .then(async () => {
    const browser = await chromium.launch();
    try {
      await soloRun(browser);
      await opaqueRun(browser);
    } finally {
      await browser.close();
    }
  })
  .then(
  () => { console.log("Browser check passed. Screenshots in reports/."); process.exit(0); },
  (error) => { console.error(error); process.exit(1); },
);
