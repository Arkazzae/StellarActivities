# Contributing

Write commit subjects and pull request titles as `type(scope): subject`. The scope is optional. Start the description with a lowercase word, keep the entire subject within 72 characters and omit the final period. For example, `fix(player): keep the playback position after a host change`.

Allowed types are `feat`, `fix`, `refactor`, `test`, `docs`, `build`, `ci`, `chore` and `perf`. Describe the change in your own words. Omit AI/tool attributions, signatures, generated-by trailers and mentions from commit messages and PR titles. Use your own Git identity. Human co-author trailers are welcome.

Enable the local check after cloning:

```sh
git config core.hooksPath .githooks
```

The contribution workflow checks pushed commits, pull request commits, and edited PR titles. Before opening a PR, run `node --test test/*.test.mjs` and `node scripts/package-release.mjs`.
