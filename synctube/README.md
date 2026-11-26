# SyncTube

SyncTube is a no-build Stellarr v1 activity. Everyone in the room can add, reorder and remove queued videos, start or pause playback, seek, and skip. YouTube watch, short, mobile, Music, embed and live links are accepted, including start timestamps.

## Install on a Stellarr instance

Open **Cockpit → Activities**, paste this repository URL and select SyncTube. Review the version, archive size and YouTube hosts, then choose **Install and enable**. In a voice channel, users open a shared queue. For a private queue, open **Friends → Activities → SyncTube → Launch for myself**. Each account gets its own personal session even when another user is watching in the same channel. [Repository](https://github.com/Arkazzae/StellarrActivities) · [Releases](https://github.com/Arkazzae/StellarrActivities/releases)

[SyncTube changelog](CHANGELOG.md)

## Run the activity

Use Node.js 22 or newer. Install the SDK from a Stellarr checkout containing the activity runtime. From this directory:

```sh
node /path/to/Stellarr/sdk/cli.js dev --dir .
node --test test/*.test.mjs
```

Open the printed preview in two tabs to watch as separate participants. **Try the sample clip** plays the bundled video without contacting YouTube. Add another copy to check automatic advance, use **Make host** in the watcher list to check transfer while playing, and move Stellarr’s **Game audio** slider to check the listener’s volume. Late joiners start at the current room position. A successor host recovers the last confirmed playback checkpoint, paused. The host records a checkpoint roughly every five seconds during playback.

For release packaging, see the [repository release instructions](../README.md#release).

## YouTube playback

The room uses YouTube’s IFrame API with the privacy-enhanced embedding domain. Lookups and previews use the hosts listed in the manifest. Video IDs work even when the title lookup is unavailable. If autoplay is blocked, select **Play on this device**. A video that is unavailable for embedded playback can be retried or skipped. Availability, live-edge positions and ads are determined by the provider. [YouTube IFrame API](https://developers.google.com/youtube/iframe_api_reference)
