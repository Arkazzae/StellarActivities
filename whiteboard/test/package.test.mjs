import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(readFileSync(join(root, "..", "catalog.json"), "utf8")).whiteboard;
const manifest = JSON.parse(readFileSync(join(root, "stellarr.json"), "utf8"));

/** Every file the browser loads, following HTML, JS imports and CSS url(). */
const reachable = () => {
  const seen = new Set();
  const visit = (file) => {
    const path = normalize(file);
    if (seen.has(path)) return;
    seen.add(path);
    const text = readFileSync(join(root, path), "utf8");
    const base = dirname(path);
    const refs = [];
    if (path.endsWith(".html")) for (const match of text.matchAll(/(?:src|href)="\.\/([^"]+)"/g)) refs.push(match[1]);
    if (path.endsWith(".js")) for (const match of text.matchAll(/from\s+"(\.{1,2}\/[^"]+)"/g)) refs.push(join(base, match[1]));
    if (path.endsWith(".css")) for (const match of text.matchAll(/url\("\.\/([^"]+)"\)/g)) refs.push(join(base, match[1]));
    for (const ref of refs) {
      const target = normalize(ref);
      if (/\.(js|css|html)$/.test(target)) visit(target);
      else seen.add(target);
    }
  };
  visit("index.html");
  return seen;
};

test("every file the page loads is in catalog.json", () => {
  const listed = new Set(catalog);
  const missing = [...reachable()].filter((file) => !listed.has(file));
  assert.deepEqual(missing, []);
});

test("every catalog file exists and fonts ship with their licences", () => {
  for (const file of catalog) {
    if (file === "LICENSE") continue;
    assert.ok(existsSync(join(root, file)), file);
  }
  const fonts = readdirSync(join(root, "assets", "fonts"));
  for (const font of fonts) assert.ok(catalog.includes(`assets/fonts/${font}`), font);
});

test("the manifest describes a shared, two-mode activity with valid artwork", () => {
  assert.equal(manifest.protocol, 1);
  assert.equal(manifest.id, "whiteboard");
  assert.deepEqual(manifest.launchModes, ["voice", "personal"]);
  assert.equal(manifest.seats, undefined, "everyone who joins can draw");
  assert.equal(manifest.authority, undefined, "shared authority (default)");
  assert.ok(statSync(join(root, manifest.icon)).size <= 512 * 1024);
  assert.ok(statSync(join(root, manifest.cover)).size <= 2 * 1024 * 1024);
  const png = readFileSync(join(root, manifest.icon));
  assert.equal(png.readUInt32BE(16), 512);
  assert.equal(png.readUInt32BE(20), 512);
});

test("only the entry module talks to the Stellarr SDK", () => {
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (path.endsWith(".js")) files.push(relative(root, path));
    }
  };
  walk(join(root, "src"));
  for (const file of files) assert.ok(!readFileSync(join(root, file), "utf8").includes("/_stellarr/"), file);
});
