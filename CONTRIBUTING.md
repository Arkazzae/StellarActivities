# Contributing

Write commit subjects and pull request titles as `type(scope): subject`. The scope is optional. Start the description with a lowercase word, keep the entire subject within 72 characters and omit the final period. For example, `fix(player): keep the playback position after a host change`.

Allowed types are `feat`, `fix`, `refactor`, `test`, `docs`, `build`, `ci`, `chore` and `perf`. Describe the change in your own words. Omit AI/tool attributions, signatures, generated-by trailers and mentions from commit messages and PR titles. Use your own Git identity. Human co-author trailers are welcome.

Enable the local check after cloning:

```sh
git config core.hooksPath .githooks
```

The contribution workflow checks pushed commits, pull request commits, and edited PR titles. Use Node 26, pnpm 12 and the system zip utility. Run `pnpm install --frozen-lockfile` from the repository root, then `bash scripts/check-activity.sh synctube` (substitute any catalogue ID). The command tests the activity, builds its production files, packs them with the pinned Stellarr SDK and checks the ZIP. Changes to shared packaging or workflows check all catalog entries. Run `node --test scripts/test/*.test.mjs` to check the release tooling.
