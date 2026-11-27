/**
 * Run the Stellarr CLI: the neighbouring Stellarr checkout's (the platform being developed, set
 * STELLARR_SDK to point elsewhere) when there is one, the published @stellarr/sdk otherwise.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(import.meta.dirname, "..");

/** The CLI script to run, or null when no SDK is installed. */
export function stellarrCli() {
  const candidates = [process.env.STELLARR_SDK, resolve(root, "../../Stellarr-newest/sdk"), join(root, "node_modules/@stellarr/sdk")].filter(Boolean);
  const sdk = candidates.find((dir) => existsSync(join(dir, "cli.js")));
  return sdk ? join(sdk, "cli.js") : null;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cli = stellarrCli();
  if (!cli) {
    console.error("No Stellarr SDK found. Run pnpm install or set STELLARR_SDK.");
    process.exit(1);
  }
  const run = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], { stdio: "inherit", cwd: root });
  process.exit(run.status ?? 1);
}
