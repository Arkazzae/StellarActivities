# Stellarr Activities

This repository publishes Stellarr activities. Each activity has its own folder, version and installable ZIP.

| Activity | What people can do |
| --- | --- |
| [SyncTube](synctube/) | Build a shared YouTube queue, watch in sync and hand playback control to another host. |

## Install one activity from this repository

1. In **Cockpit → Activities**, paste `https://github.com/Arkazzae/StellarrActivities`. Cockpit reads the list of activities in the latest published release. A release URL selects a particular release.
2. When the release includes several activities, select the one you want. Cockpit shows that activity’s version, download size, permissions and external hosts before you approve.
3. Choose **Install and enable**. That activity gets its own library entry. To add a second activity from the same repository, paste the same URL again and choose another entry.

Enable, disable, update or uninstall each activity independently in the library. A new folder appears in the installer once its ZIP and entry are included in a published release. The catalog currently contains SyncTube.

## Develop an activity

Open its directory for the manifest, source, assets, tests and setup instructions. From this repository’s root, start SyncTube with a Stellarr checkout:

```sh
node /path/to/Stellarr/sdk/cli.js dev --dir synctube
```

## Release

Run `node scripts/package-release.mjs` from the root with Node.js 22+ and `zip` installed. It builds an independent ZIP for each entry in `catalog.json` and writes a shared `dist/stellarr-release.json` index. Each archive has its own manifest and version. Publish intentionally by pushing a version tag, for example `git push origin v1.1.0`. Commits on `main` run contribution checks. The release notes collect the current entry from each changed activity’s `CHANGELOG.md`.

To add an activity, create a sibling of `synctube/` named after its manifest ID and list its distributable files in `catalog.json`. Give each published activity a name, description and icon. Its icon is a packaged PNG, JPEG or WebP up to 512 KiB. An optional cover in the same formats can be up to 2 MiB. Without a cover, Cockpit displays the icon on the current theme’s background. Local prototypes can omit both images. Declare `launchModes` in the manifest to choose where the activity can run. Use `["voice"]` for shared channels, `["personal"]` for a private session, or both. Omitting the field enables voice only. Keep tests, a README and a CHANGELOG.md alongside the source. Update the changelog under a `## <version>` heading when publishing a new activity version. [Published releases](https://github.com/Arkazzae/StellarrActivities/releases) · [Contribution rules](CONTRIBUTING.md)
