import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

async function project(t) {
  const cwd = await mkdtemp(join(tmpdir(), "activity-catalog-test-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  await cp(new URL("..", import.meta.url), join(cwd, "scripts"), { recursive: true });
  const catalog = { first: ["stellarr.json", "index.html", "icon.png"], second: ["stellarr.json", "index.html", "icon.png"] };
  await writeFile(join(cwd, "catalog.json"), JSON.stringify(catalog));
  const dir = join(cwd, "first");
  await mkdir(dir);
  const manifest = { id: "first", protocol: 1, name: "First", version: "2.0.0", description: "A test activity.", icon: "icon.png" };
  await writeFile(join(dir, "stellarr.json"), JSON.stringify(manifest));
  await writeFile(join(dir, "index.html"), "<title>First</title>");
  await cp(new URL("../../synctube/assets/icon.png", import.meta.url), join(dir, "icon.png"));
  await writeFile(join(dir, "CHANGELOG.md"), "## Unreleased\n\nFuture.\n\n## 2.0.0\n\nCurrent notes.\n\n## 1.0.0\n\nHistorical.\n");
  const run = (cmd, args) => execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  return { cwd, catalog, node: (file, ...args) => run(process.execPath, ["scripts/" + file + ".mjs", ...args]), git: (...args) => run("git", args) };
}

test("a scoped tag packages one activity even when its sibling has no build", async t => {
  const { cwd, node } = await project(t);
  assert.equal(node("release-notes", "first/v2.0.0"), "Current notes.");
  for (const invalid of ["v2.0.0", "first/v2.1.0", "first/v2.0.0-01", "missing/v2.0.0", "../first/v2.0.0"]) {
    assert.throws(() => node("release-notes", invalid));
  }
  assert.throws(() => node("package-release"));
  node("package-release", "first");
  assert.deepEqual(await readdir(join(cwd, "dist")), ["first"]);
  const out = join(cwd, "dist/first");
  assert.deepEqual((await readdir(out)).sort(), ["first.zip", "stellarr-release.json"]);
  const { activities } = JSON.parse(await readFile(join(out, "stellarr-release.json"), "utf8"));
  const bytes = await readFile(join(out, "first.zip"));
  assert.deepEqual(activities, [{ id: "first", name: "First", version: "2.0.0", asset: "first.zip",
    bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }]);
});

test("CI selects a changed activity or catalog entry and checks all after shared tooling changes", async t => {
  const { cwd, catalog, node, git } = await project(t);
  git("init", "-q");
  git("config", "user.name", "Release tests");
  git("config", "user.email", "release@example.invalid");
  git("config", "core.hooksPath", "/dev/null");
  git("config", "commit.gpgsign", "false");
  function commit() {
    git("add", ".");
    git("commit", "-qm", "test");
  }
  commit();
  await writeFile(join(cwd, "first/index.html"), "<title>Updated</title>");
  commit();
  assert.equal(node("changed-activities", "HEAD^"), "first");
  await writeFile(join(cwd, "catalog.json"), JSON.stringify({ ...catalog, second: [...catalog.second, "new.js"] }));
  commit();
  assert.equal(node("changed-activities", "HEAD^"), "second");
  await writeFile(join(cwd, "README.md"), "Updated instructions.");
  commit();
  assert.equal(node("changed-activities", "HEAD^"), "");
  await writeFile(join(cwd, "scripts/shared.mjs"), "");
  commit();
  assert.equal(node("changed-activities", "HEAD^"), "first\nsecond");
});
