import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const publishedCli = fileURLToPath(new URL("cli.js", import.meta.resolve("@stellarr/sdk")));

export function stellarrCli() {
  return process.env.STELLARR_SDK ? resolve(process.env.STELLARR_SDK, "cli.js") : publishedCli;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const run = spawnSync(process.execPath, [stellarrCli(), ...process.argv.slice(2)], { stdio: "inherit" });
  process.exitCode = run.status ?? 1;
}
