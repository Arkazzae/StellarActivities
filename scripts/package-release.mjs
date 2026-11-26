// Run from a SyncTube checkout, or from the parent of its published folder.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  utimes,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const root = resolve(
  process.argv[2] ?? ((await lstat("stellarr.json").catch(() => null)) ? "." : "synctube"),
);
const destination = resolve(process.argv[3] ?? "dist");
const manifest = JSON.parse(await readFile(join(root, "stellarr.json"), "utf8"));
if (manifest.id !== "synctube" || manifest.protocol !== 1)
  throw Error("Expected the SyncTube protocol 1 manifest.");
const files = ["LICENSE", "app.js", "index.html", "player.js", "room.js", "stellarr.json", "styles.css"];
const assets = [
  "assets/ARTWORK.txt",
  "assets/cinema.webp",
  "assets/icon.png",
  "assets/outfit.woff2",
  "assets/Outfit-LICENSE.txt",
  "assets/sample.mp4",
];
const folderLicense = join(root, "LICENSE");
const license = (await lstat(folderLicense).catch(() => null))
  ? folderLicense
  : join(dirname(root), "LICENSE");

const staging = await mkdtemp(join(tmpdir(), "synctube-release-"));
try {
  const timestamp = new Date("2000-01-01T00:00:00Z");
  for (const file of [...files, ...assets]) {
    const source = file === "LICENSE" ? license : join(root, file),
      target = join(staging, file);
    if (!(await lstat(source)).isFile()) throw Error("Expected a regular file: " + file);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(source, target);
    await utimes(target, timestamp, timestamp);
  }
  const asset = manifest.id + ".zip";
  const stagedZip = join(staging, asset);
  execFileSync("zip", ["-X", "-q", "-9", stagedZip, ...[...assets, ...files].sort()], {
    cwd: staging,
    env: { ...process.env, TZ: "UTC" },
  });
  const bytes = await readFile(stagedZip);
  const index = {
    protocol: 1,
    activities: [
      {
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        asset,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        bytes: bytes.length,
      },
    ],
  };
  await mkdir(destination, { recursive: true });
  const temporary = await mkdtemp(join(destination, ".release-"));
  try {
    await writeFile(join(temporary, asset), bytes);
    await writeFile(join(temporary, "stellarr-release.json"), JSON.stringify(index, null, 2) + "\n");
    await rename(join(temporary, asset), join(destination, asset));
    await rename(join(temporary, "stellarr-release.json"), join(destination, "stellarr-release.json"));
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
  process.stdout.write("Packaged " + asset + " and stellarr-release.json\n");
} finally {
  await rm(staging, { recursive: true, force: true });
}
