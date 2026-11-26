import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const catalog = JSON.parse(await readFile("catalog.json", "utf8"));
function git(...args) {
  try { return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
  catch { return ""; }
}
const previous = git("describe", "--tags", "--match", "v*", "--abbrev=0", "HEAD^");
const notes = [];
for (const id of Object.keys(catalog)) {
  const manifest = JSON.parse(await readFile(id + "/stellarr.json", "utf8"));
  const before = previous && git("show", previous + ":" + id + "/stellarr.json");
  if (before && JSON.parse(before).version === manifest.version) continue;
  const changelog = await readFile(id + "/CHANGELOG.md", "utf8");
  const entries = changelog.split(/^## /m).slice(1);
  const entry = entries.find(text => text.split("\n", 1)[0].trim() === manifest.version);
  if (!entry || !entry.slice(entry.indexOf("\n") + 1).trim()) throw new Error("Add release notes for " + id + " " + manifest.version);
  notes.push("## " + manifest.name + " " + manifest.version + "\n\n" + entry.slice(entry.indexOf("\n") + 1).trim());
}
console.log(notes.length ? notes.join("\n\n") : "This catalog release carries the previously published activity versions.");
