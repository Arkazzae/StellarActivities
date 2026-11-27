import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const [base, head = "HEAD"] = process.argv.slice(2);
const catalog = JSON.parse(await readFile("catalog.json", "utf8"));
const ids = Object.keys(catalog);
if (ids.some(id => !/^[a-z0-9-]{1,100}$/.test(id))) throw new Error("Invalid activity ID in catalog.json.");

function changed() {
  if (!base || /^0+$/.test(base)) return ids;
  const git = (...args) => execFileSync("git", args, { encoding: "utf8" });
  const paths = git("diff", "--name-only", "--no-renames", "-z", base, head, "--").split("\0").filter(Boolean);
  if (paths.some(path => ["LICENSE", "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml"].includes(path) || path.startsWith("scripts/") || path.startsWith(".github/workflows/"))) return ids;
  let before = catalog;
  if (paths.includes("catalog.json")) {
    const hadCatalog = git("ls-tree", "--name-only", base, "--", "catalog.json").trim();
    before = hadCatalog ? JSON.parse(git("show", base + ":catalog.json")) : {};
  }
  return ids.filter(id => paths.some(path => path.startsWith(id + "/")) ||
    JSON.stringify(before[id]) !== JSON.stringify(catalog[id]));
}

for (const id of changed()) console.log(id);
