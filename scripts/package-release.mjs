import { execFileSync } from "node:child_process";
import { copyFile, lstat, mkdir, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { publishedCli } from "./stellarr.mjs";

const root = await realpath(join(import.meta.dirname, ".."));
const catalog = JSON.parse(await readFile(join(root, "catalog.json"), "utf8"));
const id = process.argv[2];
if (!id || !/^[a-z0-9-]{1,100}$/.test(id) || !Object.hasOwn(catalog, id))
  throw new Error("Choose an activity from catalog.json.");
const activity = join(root, id);
const entry = catalog[id];
const output = resolve(process.argv[3] ?? join(root, "dist", id));
const stage = await mkdtemp(join(tmpdir(), "activity-release-"));
try {
  let source = stage;
  if (entry.build === "dist") {
    execFileSync("pnpm", ["run", "build"], { cwd: activity, stdio: "inherit" });
    source = join(activity, "dist");
  } else {
    if (!Array.isArray(entry) || !entry.includes("stellarr.json") || !entry.includes("index.html"))
      throw new Error("Incomplete catalog entry for " + id);
    for (const file of entry.filter(name => name !== "LICENSE")) {
      if (file.includes("\\") || file.split("/").some(part => !part || part.startsWith(".") || part.startsWith("-")))
        throw new Error("Invalid catalog path in " + id);
      const from = join(activity, file);
      if (await realpath(from) !== from || !(await lstat(from)).isFile())
        throw new Error("Expected a regular file at " + from);
      const target = join(stage, file);
      await mkdir(dirname(target), { recursive: true });
      await copyFile(from, target);
    }
  }
  const license = join(activity, "LICENSE");
  await copyFile(await lstat(license).catch(() => null) ? license : join(root, "LICENSE"), join(source, "LICENSE"));
  const manifest = JSON.parse(await readFile(join(source, "stellarr.json"), "utf8"));
  if (manifest.id !== id || !manifest.icon) throw new Error("Check manifest ID and icon for " + id);
  execFileSync(process.execPath, [publishedCli, "pack", "--dir", source, "--out", output], { stdio: "inherit" });
} finally {
  await rm(stage, { recursive: true, force: true });
}
