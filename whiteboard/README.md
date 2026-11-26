# Whiteboard

Whiteboard is a no-build Stellarr v1 activity for sketching together. Everyone in a voice channel draws on the same endless board and sees the others' cursors, selections and laser pointer live. It runs on its own engine: hand-drawn shapes, hatching, pressure-sensitive ink and the interface are written from scratch, with no drawing library and no dependencies.

## What people can do

- **Draw:** rectangles, diamonds, ellipses, arrows, lines (dragged or clicked point by point), freehand ink, text, images, eraser and a laser pointer.
- **Style:** the hand-drawn look is seeded per shape, so every participant sees identical strokes. Choose sloppiness, hatching, cross-hatching or solid fills, dashed or dotted lines, arrowheads, rounded corners and three fonts with Polish characters.
- **Connect shapes:** an arrow that ends on a shape attaches to it and follows when the shape moves, resizes or rotates. Double-click a shape to write a label inside it; the shape grows to fit.
- **Edit:** move, resize (Shift keeps proportions, Alt scales from the center), rotate (Shift snaps to 15°), edit line points, group, lock, reorder, align and distribute, duplicate, copy and paste, and snap to a grid.
- **Work together:** watch others drag and draw before they let go. Undo only reverts your own changes, and never anything someone else edited since.
- **Look around:** pan, zoom and pinch, and use light or dark mode. The board follows Stellarr's theme and language (English or Polish) unless you pick a theme yourself.

Press `?` for every shortcut.

## Install on a Stellarr instance

Open **Cockpit → Activities**, paste this repository URL and select Whiteboard. In a voice channel everyone opens the same board. **Friends → Activities → Whiteboard → Launch for myself** opens a private board.

[Whiteboard changelog](CHANGELOG.md)

## Run the activity

Use Node.js 22 or newer and a Stellarr checkout. From this directory:

```sh
node /path/to/Stellarr/sdk/cli.js dev --dir .
node --test test/*.test.mjs
```

Open the printed preview and use **New player** to join as another person in a second tab.

## How the board is stored

| What | Where | Limit |
| --- | --- | --- |
| Shapes, text, arrows and the board name | Room state, one compact key per element | 256 KiB per room |
| Cursors, selections, laser trails and in-progress drags | `session.send`, best effort | 64 KiB per message |
| Images | Sent from person to person in chunks; latecomers ask for the images they are missing | 1.4 MB per image |
| Your preferences and a compressed copy of your last board | Your account's `progress` save | 64 KiB |

Each element is encoded with short field names and delta-packed points, so a plain shape takes about 60 bytes and a freehand stroke a few hundred. The status area shows how full the board is from 60% on. New elements are refused once the room is nearly full.

Stellarr clears a room 120 seconds after the last person leaves. When you open an empty board, Whiteboard offers to restore the last board saved to your account. Images are not part of that copy and remain available only while someone in the room still has them. To keep a board with its images, use **Copy the whole board** and paste it back later, or save the copied text as a `.whiteboard` file and open it.

Stellarr's activity frame cannot start downloads or use the asynchronous clipboard. Export shows the finished PNG to save from the browser's image menu and copies SVG through the clipboard.

For release packaging, see the [repository release instructions](../README.md#release). Artwork credits are in [ARTWORK.md](ARTWORK.md).
