import { readFile } from "node:fs/promises";

const tag = process.argv[2] ?? "";
const [id, versionTag, ...rest] = tag.split("/");
const version = versionTag?.slice(1);
const validVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const match = validVersion.exec(version ?? "");
if (!/^[a-z0-9-]{1,100}$/.test(id) || rest.length || !versionTag?.startsWith("v") ||
    !match || match[4]?.split(".").some(part => /^0\d+$/.test(part))) {
  throw new Error("Use an activity tag in the form <activity-id>/v<SemVer>.");
}

const catalog = JSON.parse(await readFile("catalog.json", "utf8"));
if (!Object.hasOwn(catalog, id)) throw new Error("Unknown activity: " + id);
const path = id + (catalog[id].build === "dist" ? "/public/stellarr.json" : "/stellarr.json");
const manifest = JSON.parse(await readFile(path, "utf8"));
if (manifest.id !== id || manifest.version !== version) {
  throw new Error("Tag must match the activity ID and version in " + path + ".");
}

const changelog = await readFile(id + "/CHANGELOG.md", "utf8");
const entry = changelog.split(/^## /m).slice(1).find(section => section.split("\n", 1)[0].trim() === version);
const notes = entry?.split("\n").slice(1).join("\n").trim();
if (!notes) throw new Error("Add release notes for " + id + " " + version + ".");
console.log(notes);
