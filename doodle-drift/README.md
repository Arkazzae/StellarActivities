# Doodle Drift

A telephone drawing game for a Stellarr voice channel. Everyone starts an album, then writes,
draws and describes in each other's albums; the host walks everyone through the reveal.
The screens follow the design canvas the team accepted (lobby, round, reveal, end, modes).

## Run

```bash
pnpm build                 # type-check + Vite build into dist/
pnpm sdk:dev               # Stellarr simulator; each tab at / is a new player
pnpm test                  # plan and protocol tests (node --test)
```

`pnpm dev` (plain Vite) runs a one-player stand-in without a room, which is enough for UI work.

The `sdk:*` scripts and the e2e run go through `scripts/stellarr.mjs`, which uses a local Stellarr
checkout when it finds one (`STELLARR_SDK=<path to its sdk/ folder>`, or
`~/Documents/GitHub/Stellarr-newest/sdk`) and the published `@stellarr/sdk` otherwise.

End-to-end in the simulator (Playwright's Chromium: `pnpm exec playwright install chromium` once):

```bash
pnpm build && pnpm e2e classic 3   # mode, players
RELOAD=1 pnpm e2e classic 3        # guest and host reload mid-round
CLOSE=1 pnpm e2e classic 3         # the host leaves, the next player takes over
```

Screenshots go to `reports/` (ignored by git).

## How the room is used

Stellarr gives a host-authoritative room (`"authority": "host"`). Its limits shape the design:

| Channel | Used for | Why |
| --- | --- | --- |
| Shared state (≤ 256 KiB) | phase, settings, roster, the match plan, round clock, who finished, reveal pointer, revealed sentences, votes | public, small, survives reloads |
| Private assignments | each player's prompt for this round and a copy of every sentence they wrote | a new host rebuilds the sentences from the checkpoint |
| Commands | `submit` (page key + text or picture hash) and `advance` (after the deadline) | the room's command ledger holds only 4096 entries and 4 MiB **per room**, so pictures never go through it |
| Binary messages (≤ 64 KiB) | pictures (`img`), acknowledged by the host (`ack`), re-requested (`need`), mosaic tile previews (`tile`) | pictures are WebP/JPEG/PNG shrunk until they fit one message |

- The host writes state directly (`state.set`) for round changes and the reveal; it needs a command only when it must also hand out private assignments.
- `state.store` holds the boot id of the host tab that holds the pictures. When it changes (host reload or failover), every player sends back the pictures and sentences they hold. The host also leaves a copy of its own drawings with another player.
- Any player may ask to `advance` once the deadline plus a grace period has passed, because a hidden host tab sleeps.
- Pictures are painted on `<canvas>` from decoded bytes, never shown through `blob:`/`data:` URLs, which the simulator's Content-Security-Policy refuses.
- Names come from Stellarr without grammatical gender or case, so the copy uses forms like "Album: Ola" and "Kuba · rysunek".

## Code map

- `src/game/` — pure rules: modes table, `buildPlan()` (who works on which album each round, what they see, what they hand on), timings, stars, holes, tiles. Tested for every mode and 1–14 players.
- `src/net/` — protocol types, reveal order, binary packets, picture encoding, and `Game`, which mirrors the room for the UI and runs the host's rules.
- `src/draw/` — the drawing board: locked layers, onion skin, clip regions, kaleidoscope mirrors, one-line, blind drawing and the star tool.
- `src/ui/` — screens: lobby and mode picker, countdown, tasks, waiting, reveal (chain, points, gallery, animation, monster, mosaic, exhibition), end and GIF export, settings.

## Modes

| Group | Mode | Rule |
| --- | --- | --- |
| To start | Klasyczny łańcuszek | sentence → drawing → caption, alternating |
| | Mieszanka | each drawing round draws one of the dice rules; captions sometimes go by telegram |
| | Opowieść | sentences only, you see only the previous one |
| | Własne zasady | the host picks the order (sentence first, drawing first, drawings only as a comic, sentences only), rounds, seconds per sentence and drawing, and one extra rule |
| One-round rule | Gwiazdozbiór | draw only by joining stars on a shared night sky |
| | Jedna kreska | the whole drawing in one stroke |
| | Kalejdoskop | strokes repeat 2, 4 or 6 times around the centre |
| | Trzy kredki | three random colours per drawing |
| | Po ciemku | the canvas is hidden and typed letters show as dots |
| | Telegram | captions have at most four words |
| Different flow | Z pamięci | drawings only after the first sentence; the previous drawing disappears at your first touch; less time each round |
| | Między zdaniami | sentence, drawings from memory, the last player guesses the first sentence |
| | Wspólny temat | everyone asks a question, everyone draws the same questions, gallery reveal |
| | Z bazgrołów | a quick scribble, then everyone adds on without erasing what is there |
| | Na punkty | a chain; on the reveal players mark pages that fit the previous one, the author scores |
| | Brakujący kawałek | now and then you fill a hole cut out of someone's drawing |
| | Arcydzieło | write a painting title, someone paints it with plenty of time, exhibition reveal |
| Animation and split canvas | Kineograf | each player animates someone's theme in 4–5 frames with onion skin |
| | Animacja w sztafecie | the animation travels; each player draws the next frame |
| | Animacja na tle | one player draws a still backdrop, the next ones animate on top of it |
| | Potwór z kawałków | head, body and legs by different players, each seeing only the edge above |
| | Mozaika | a shared picture cut into tiles, drawn at the same time, with neighbours' edges visible |

Several rules borrow mechanics from party drawing games; names, pictures, copy and layouts are this game's own.
