# Stellarr Activities

This repository publishes Stellarr activities. Each activity has its own folder, version and installable ZIP.

| Activity | What people can do |
| --- | --- |
| [SyncTube](synctube/) | Build a shared YouTube queue, watch in sync and hand playback control to another host. |

## Install one activity from this repository

1. In **Cockpit → Activities**, paste `https://github.com/Arkazzae/StellarrActivities`. Cockpit finds the latest stable release of each published activity. Paste a release URL to open that exact version.
2. When the repository publishes several activities, select the one you want. Cockpit shows that activity’s version, download size, permissions and external hosts before you approve.
3. Choose **Install and enable**. That activity gets its own library entry. To add a second activity from the same repository, paste the same URL again and choose another entry.

Enable, disable, update or uninstall each activity independently in the library. A new folder appears in the installer once its first release is published. The catalog currently contains SyncTube.

## Develop an activity

Open its directory for the manifest, source, assets, tests and setup instructions. From this repository’s root, start SyncTube with a Stellarr checkout:

```sh
node /path/to/Stellarr/sdk/cli.js dev --dir synctube
```

## Release

Each activity has its own Git tag, GitHub release, changelog and ZIP. A commit to `main` runs checks. To publish, update one activity’s manifest version and add the matching section to its changelog. After those changes reach `main`, push a tag named `<activity-id>/v<version>`.

For example, for a future SyncTube version 1.2.0:

```sh
node --test synctube/test/*.test.mjs
node scripts/package-release.mjs synctube
git tag synctube/v1.2.0
git push origin synctube/v1.2.0
```

Packaging requires Node.js 22+ and `zip`. The tag workflow tests SyncTube and publishes **SyncTube 1.2.0** with its changelog entry, `synctube.zip` and a single-entry `stellarr-release.json`. The other activities keep their own release and assets. For a prerelease, use a version such as `1.2.0-beta.1`. Historical SyncTube releases through 1.1.0 remain under their original `v*` tags.

To add an activity, create a sibling of `synctube/` named after its manifest ID and list its distributable files in `catalog.json`. Give each published activity a name, description and icon. Its icon is a packaged PNG, JPEG or WebP up to 512 KiB. An optional cover in the same formats can be up to 2 MiB. Without a cover, Cockpit displays the icon on the current theme’s background. Local prototypes can omit both images. Declare `launchModes` in the manifest to choose where the activity can run. Use `["voice"]` for shared channels, `["personal"]` for a private session, or both. Omitting the field enables voice only. Keep tests, a README and a CHANGELOG.md alongside the source. Update the changelog under a `## <version>` heading when publishing a new activity version. [Published releases](https://github.com/Arkazzae/StellarrActivities/releases) · [Contribution rules](CONTRIBUTING.md)
