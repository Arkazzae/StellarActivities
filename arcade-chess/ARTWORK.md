# Arcade Chess artwork

## What ships now

- **Pieces:** three sets in `public/pieces/<set>/`, chosen in the settings. `classic` (the default; WebP, sources in `artwork/pieces-classic/`) was drawn by Codex on 2026-11-27 as an original set in a clean modern Staunton style. `stellar` (WebP, 256 × 256; sources and the Chaos variants in `artwork/pieces/`) is Codex's cartoon set from the same day. `cburnett` (SVG) is Colin M.L. Burnett's set, GPLv2+, as used on Wikipedia and Lichess. The flychess PNGs were not reused: they are identical to chess.com's "neo" set, which is chess.com's artwork.
- **Bot portraits:** `public/avatars/bots/<id>.webp`, 512 × 512, full-bleed. Codex drew them on 2026-11-27 in 32-bit-era pixel art (a 128 × 128 grid of 8 px blocks at 1024 px, about 64 colours), from the brief in "Game-type portraits" below, after ten art directions were compared (the comparison sheet is `artwork/portraits-games/samples/kierunki.webp`; the thirty raw samples were not kept in the repository). The 1024 px PNG sources are in `artwork/portraits-games/`; the WebPs are a 2× nearest-neighbour reduction, so the pixels stay sharp. The five Chaos opponents (iskra, bruno, bolko, mira, nox) are painted portraits in `artwork/portraits-chaos/`. The first ladder's cartoon portraits (kuba … wiktor) stay only as sources in `artwork/portraits/`.
- **Icon and cover:** `public/icon.png` (512 × 512, a pixel-art knight on a glowing arcade screen, also the logo mark in the sidebar at 32 px) and `public/cover.webp` (1536 × 864, the bots around a glowing board in a night-time arcade, the left third kept dark for Stellarr's title). Codex drew them on 2026-11-27 in the bots' 32-bit pixel-art style (sources and the unused variants in `artwork/brand/`: icons A–C, covers A–B), reduced 2× nearest-neighbour. The earlier icon and cover came from Multiversal Chess; that cover stays as the hidden Chaos page's art in `public/chaos/hero.webp`. `pnpm art:placeholder` can still render plain stand-ins.
- **Chaos Chess card art:** 50 illustrations plus a card back in `public/chaos/` (WebP). Forty come from `multiversal-chess/public/assets/chaos/` in the stellar-activities-registry repository (`artwork/chaos-art-manifest.json` has alt text for each card). The ten effects Multiversal added later were painted by Codex on 2026-11-27 in the same style (sources in `artwork/chaos-art/`). The Chaos opponents' portraits are Codex paintings in that style too (sources in `artwork/portraits-chaos/`; the earlier cartoon versions stay in `artwork/portraits/`).
- **Icons:** Codex generated menu icons (`public/icons/nav/`) and puzzle icons and badges (`public/icons/puzzles/`). The cartoon icons for the 50 Chaos effects and the four categories are kept only as sources in `artwork/icons/`: Chaos now shows each card's own illustration and draws the categories as line sigils.
- **Puzzle icons and badges:** 14 Codex icons (2026-11-27) in `public/icons/puzzles/` (160 px WebP; 512 px PNG sources in `artwork/icons/puzzles/`): rush, streak, rating, calendar, mate, fork, endgame, deck and six badges.
- **Fonts:** Montserrat and Noto Sans, both SIL OFL 1.1, bundled from `@fontsource` (Latin and Latin Extended only).
- **Move sound:** the short percussive click in `public/audio/chess-move.wav` was synthesized for Arcade Chess using two damped tones and a short noise transient.
- **Openings:** the five ECO files are from [JeffML/eco.json at 36cfd92](https://github.com/JeffML/eco.json/tree/36cfd9227f553dec1d39ee20fa0775eea8f8e165). The MIT notice ships in `public/licenses/eco.txt`.

## Brief for the generated set

Everything has to be original. No real people, no characters from games, films or other chess sites, no logos, no text in the image.

### The first ladder (replaced)

The brief below made the first ladder's cartoon portraits; it is kept for the Chaos opponents and as a record.

#### Shared style for all nine portraits

Square 1024 × 1024 PNG with a transparent background; the app puts the character's tint (given below) behind it. A head-and-shoulders bust, slightly turned (three-quarter), cut at mid-chest with a soft rounded bottom edge, the face filling about 55 % of the frame.

The style is flat 2D vector cartoon, like a polished mobile-game avatar:
- clean shapes with cel shading: one shadow tone and one highlight per colour, no painterly texture;
- thin outlines in a darker shade of each fill, never pure black;
- slightly exaggerated proportions, with a large head, strong brows and jaw where they suit the person, and expressive eyes and eyebrows;
- a soft rim light along one side, the light from the upper left, and the same camera height for every character, so the set reads as one family side by side at 40 px.

### Characters

| File | Tint | Prompt |
| --- | --- | --- |
| `kuba.webp` | `#e9a93c` | A seven-year-old boy with messy light-brown hair and a gap-toothed grin, wearing an oversized striped T-shirt, holding a wooden chess knight up to the camera with both hands, delighted. |
| `halina.webp` | `#b86f8f` | A woman in her seventies with short silver permed hair, round glasses on a beaded chain and a knitted cardigan, sitting on a park bench, kind and slightly mischievous smile, a thermos cup in one hand. |
| `tomek.webp` | `#5b8fd6` | A fourteen-year-old boy with a gaming headset around his neck and a hoodie, the screen glow on his face, confident smirk, a small streaming microphone at the edge of the frame. |
| `amara.webp` | `#3fa58a` | A woman in her early twenties, a medical student with braids tied back, a lanyard and a notebook full of chess diagrams, curious and focused, a pen behind her ear. |
| `diego.webp` | `#d0623f` | A man in his thirties with a short beard and rolled-up shirt sleeves at a café table, an espresso cup beside a chess clock, quick-witted grin, mid-gesture. |
| `ingrid.webp` | `#6f7fb5` | A woman in her forties with a neat blonde bob, a dark turtleneck and a whistle on a cord, a chess club coach, calm and attentive expression, arms folded. |
| `hiro.webp` | `#2f8f9d` | A quiet man in his late twenties with neat black hair and thin wire glasses, a puzzle composer, holding a small pocket chess set, looking thoughtfully slightly past the camera. |
| `wiktor.webp` | `#8a6d3b` | A man in his sixties with a grey beard, a tweed jacket and a tournament badge from long ago, a glass of tea in a metal holder, wise and amused expression. |
| `stockfish.webp` | `#3d424d` | Not a person: an abstract engine emblem made of a stylised fish built from circuit lines and a chessboard grid, glowing cyan on graphite. |

### Icon and cover

- **`icon.png`**, 512 × 512, PNG, at most 512 KiB: a chess king and a small star on a two-by-two green and cream board tile with rounded corners. It has to stay readable at 32 px. No text.
- **`cover.webp`**, 1536 × 864, WebP, at most 2 MiB: a dark chess-site scene. A board in the green and cream colours, angled in perspective, with three or four of the characters above around the edges, as if seated around the table in a voice channel. Leave the left third calm for the title Stellarr draws over it. No text, no logos.

### Putting them in

1. Save the portraits as `public/avatars/bots/<id>.webp`. Keep each at 512 × 512 and under about 60 KB (`cwebp -q 80 -resize 512 512`).
2. Set `PORTRAIT_FORMAT` to `"webp"` in `src/ai/bots/characters.ts` and delete the placeholder SVGs.
3. Replace `public/icon.png` and `public/cover.webp`.
4. Run `pnpm build && pnpm sdk:validate`. Validation checks the icon's and cover's format and size.

## Game-type portraits (the current ladder)

The bots parody familiar kinds of video-game characters, never a particular one: if someone looking at a portrait would say "that is <a famous character> renamed", it is a copy and gets redrawn. The brief excluded, among others, a moustached plumber in a cap, a teardrop slime with a wide smile, a green-tunic elf hero, an armoured space soldier with a gold visor, a karate gi with a red headband, a hooded merchant with a covered face and a chest with legs. No text in any image (the one glyph is Zenek's golden quest marker).

Style for all nine: square 1024 × 1024, full-bleed; a 128 × 128 pixel grid upscaled in hard 8 × 8 blocks, about 48–64 colours, hand-placed shading with selective dithering, coloured outlines; waist-up, three-quarter view, the same camera height; a simpler, darker background with a rim light in the character's signature colour so each reads at 48 px.

| File | Signature colour | Character |
| --- | --- | --- |
| `glut` | lime green | a round lime-green slime with stubby nubs and big glossy eyes, a cream pawn swallowed inside, in a sunny starter field with a blank signpost |
| `zenek` | straw yellow | a round-faced villager NPC in a straw hat with a chicken under one arm and a wooden pawn in the other hand, a golden quest marker above, by a village well |
| `turbo` | electric cyan | a young speedrunner with a cyan ponytail, headset and wristband, holding up a stopwatch, an energy-drink can at the edge, in a dark room lit by a monitor |
| `mimik` | treasure gold | a legless treasure chest with teeth and a purple tongue holding a gold king as bait, amber eyes inside, in a torch-lit dungeon |
| `bazyl` | warm orange | a plump bespectacled merchant with a huge backpack of goods, holding a potion and a bishop, at a roadside camp at dusk |
| `bronka` | steel blue | a tank in steel-blue plate with a raised visor and a tower shield bearing a rook, at a castle gate |
| `bogdan` | orange-red | a bald fighter with a braided beard and a teal vest, taped fists crackling with orange energy, in a night arena |
| `mordax` | violet | an obsidian sorcerer-king with a crown forged from black chess pieces, holding a glowing violet king, in a throne room with violet braziers |
| `stockfish` | cyan on graphite | a robotic fish of graphite plates and cyan circuit lines with a chessboard pattern on its side, in front of a server rack |

