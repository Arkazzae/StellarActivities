#!/usr/bin/env bash
set -euo pipefail
id=$1
if [[ -f "$id/package.json" ]]; then
  pnpm --dir "$id" test
else
  node --test "$id"/test/*.test.mjs
fi
node scripts/package-release.mjs "$id"
asset=$(jq -er '.activities[0].asset' "dist/$id/stellarr-release.json")
unzip -tq "dist/$id/$asset"
