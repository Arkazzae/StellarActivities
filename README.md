# Stellarr Activities

Each activity lives in its own folder. An instance owner installs an activity by pasting this repository’s URL into **Cockpit → Activities** and choosing a release.

| Activity | What people can do |
| --- | --- |
| [SyncTube](synctube/) | Build a shared YouTube queue, watch in sync and hand playback control to another host. |

## Develop an activity

Open its directory for the manifest, source, assets, tests and setup instructions. From this repository’s root, start SyncTube with a Stellarr checkout:

```sh
node /path/to/Stellarr/sdk/cli.js dev --dir synctube
```

## Release

Run `node scripts/package-release.mjs` from the root with Node.js 22+ and `zip` installed. It builds an independent ZIP for each entry in `catalog.json` and writes a shared `dist/stellarr-release.json` index. Each archive has its own manifest and version. A repository tag such as `v1.1.0` publishes the catalog snapshot.

To add an activity, create a sibling of `synctube/` named after its manifest ID and list its distributable files in `catalog.json`. Give each published activity a name, description and icon. Its icon is a packaged PNG, JPEG or WebP up to 512 KiB. An optional cover in the same formats can be up to 2 MiB. Without a cover, Cockpit displays the icon on the current theme’s background. Local prototypes can omit both images. Keep tests and the activity README alongside the source. [Published releases](https://github.com/Arkazzae/StellarrActivities/releases) · [Contribution rules](CONTRIBUTING.md)
