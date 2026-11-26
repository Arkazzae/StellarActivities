import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = await realpath(fileURLToPath(new URL("..", import.meta.url)));
const catalog = JSON.parse(await readFile(join(root, "catalog.json"), "utf8"));
const output = resolve(process.argv[2] ?? join(root, "dist"));
const timestamp = new Date("2000-01-01T00:00:00Z");

async function archive(id, files, outputDir) {
  if (!/^[a-z0-9-]+$/.test(id) || !Array.isArray(files) || !files.includes("stellarr.json") || !files.includes("index.html"))
    throw new Error("Incomplete catalog entry: " + id);
  const directory = join(root, id);
  const manifest = JSON.parse(await readFile(join(directory, "stellarr.json"), "utf8"));
  if (manifest.id !== id || manifest.protocol !== 1) throw new Error("Unexpected manifest in " + id);
  if (typeof manifest.name !== "string" || !manifest.name.trim() || typeof manifest.description !== "string" || !manifest.description.trim())
    throw new Error("Provide a name and description for " + id);
  const modes = manifest.launchModes ?? ["voice"];
  if (!Array.isArray(modes) || !modes.length || modes.some(mode => !["voice", "personal"].includes(mode)) || new Set(modes).size !== modes.length)
    throw new Error("Invalid launchModes for " + id);
  if (!manifest.icon) throw new Error("Add an icon to " + id + " before publishing.");
  for (const role of ["icon", "cover"]) {
    const path = manifest[role];
    if (path === undefined) continue;
    if (typeof path !== "string" || !files.includes(path) || !/\.(png|jpe?g|webp)$/i.test(path))
      throw new Error(id + ": include " + role + " as a PNG, JPEG or WebP in the catalog.");
    const limit = role === "icon" ? 512 * 1024 : 2 * 1024 * 1024;
    if ((await lstat(join(directory, path))).size > limit) throw new Error(id + ": " + role + " exceeds its size limit.");
  }
  const stage = await mkdtemp(join(tmpdir(), "activity-release-"));
  try {
    for (const file of files) {
      if (file.includes("\\") || file.split("/").some(part => !part || part.startsWith(".") || part.startsWith("-")))
        throw new Error("Invalid distribution path in " + id);
      let source = join(directory, file);
      if (file === "LICENSE" && !(await lstat(source).catch(() => null))) source = join(root, file);
      if (await realpath(source) !== source || !(await lstat(source)).isFile()) throw new Error("Expected a regular file: " + source);
      const target = join(stage, file);
      await mkdir(dirname(target), { recursive: true });
      await copyFile(source, target);
      await utimes(target, timestamp, timestamp);
    }
    const asset = id + ".zip";
    const path = join(outputDir, asset);
    execFileSync("zip", ["-X", "-q", "-9", path, ...[...files].sort()], { cwd: stage, env: { ...process.env, TZ: "UTC" } });
    const bytes = await readFile(path);
    return { id, name: manifest.name, version: manifest.version, asset,
      sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length };
  } finally { await rm(stage, { recursive: true, force: true }); }
}

await mkdir(output, { recursive: true });
const temporary = await mkdtemp(join(output, ".release-"));
try {
  const activities = [];
  for (const [id, files] of Object.entries(catalog)) activities.push(await archive(id, files, temporary));
  if (!activities.length) throw new Error("The catalog is empty.");
  const index = "stellarr-release.json";
  await writeFile(join(temporary, index), JSON.stringify({ protocol: 1, activities }, null, 2) + "\n");
  for (const { asset } of activities) await rename(join(temporary, asset), join(output, asset));
  await rename(join(temporary, index), join(output, index));
  console.log("Packaged " + activities.map(item => item.asset).join(", "));
} finally { await rm(temporary, { recursive: true, force: true }); }
