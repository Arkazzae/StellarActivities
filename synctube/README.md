# SyncTube

SyncTube is a no-build Stellarr v1 activity for watching YouTube together. Paste a link in the panel next to the player. The first video starts the room, and later ones wait in the queue. YouTube watch, short, mobile, Music, embed and live links are accepted, including start timestamps.

The panel has four tabs:

- **Queue**: add videos, play one now, move it, or remove it.
- **History**: queue watched and skipped videos again.
- **People**: see who is watching, the host and the person who started the room. The host can hand over control here.
- **Settings**: language, your own volume, who controls playback, autoplay and repeat.

Anyone in the room can vote to skip. A video is skipped when more than half of the people online vote. The host, the person who started the room and the instance owner can skip without a vote. The instance owner needs a Stellarr version that marks owners in the participant list.

## Install on a Stellarr instance

Open **Cockpit → Activities**, paste this repository URL and select SyncTube. Review the version, archive size and YouTube hosts, then choose **Install and enable**. In a voice channel, users open a shared queue. For a private queue, open **Friends → Activities → SyncTube → Launch for myself**. Each account gets its own personal session even when another user is watching in the same channel. [Repository](https://github.com/Arkazzae/StellarrActivities) · [Releases](https://github.com/Arkazzae/StellarrActivities/releases)

[SyncTube changelog](CHANGELOG.md)

## Language and saved progress

SyncTube follows Stellarr’s interface language and switches between Polish and English when that setting changes. **Settings → Language** overrides it for your account. On hosts with the SDK `progress` capability, SyncTube saves your spot in each YouTube video and your language choice to your account. Empty rooms offer to start from where you left off. Older hosts skip both without errors. The shared queue and playback stay in the room state.

## Run the activity

Use Node.js 22 or newer and a Stellarr checkout with SDK 0.3.0. From this directory:

```sh
node /path/to/Stellarr/sdk/cli.js dev --dir .
node --test test/*.test.mjs
```

Open the printed preview and choose **New player** to watch as a second participant. **Try the sample clip** plays the bundled video without contacting YouTube. Add another video to check automatic advance, vote from both tabs to check skipping, use **Make host** to check transfer while playing, and move Stellarr’s **Game audio** slider to check the listener’s volume. Late joiners start at the current room position. A successor host recovers the last confirmed playback checkpoint, paused. The host records a checkpoint roughly every five seconds during playback.

Keyboard shortcuts: Space plays or pauses for everyone, ← and → jump five seconds, M mutes this device, T toggles cinema mode and Esc leaves it.

For release packaging, see the [repository release instructions](../README.md#release).

## YouTube playback

On the instance hostname the room uses Stellarr’s YouTube player. Dedicated activity hosts and local previews use YouTube’s IFrame API with the privacy-enhanced embedding domain. Shared playback speed is available with the IFrame API and the sample clip. Stellarr’s player does not change speed, so the control is hidden there. Lookups and previews use the hosts listed in the manifest. Video IDs work even when the title lookup is unavailable. If autoplay is blocked, select **Play on this device**. A video that is unavailable for embedded playback can be retried or skipped. Availability, live-edge positions and ads are determined by the provider. [YouTube IFrame API](https://developers.google.com/youtube/iframe_api_reference)
