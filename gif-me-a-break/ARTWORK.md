# Brief for Codex: Pętla artwork

Pętla is a party game for a Discord-like voice channel. A topic appears, every
player searches for the GIF that fits it best, then the memes are shown one by
one, everyone reacts and votes. The screens are designed on a canvas; this brief
asks only for image assets. Do not create or edit any other file, do not
install packages, do not commit.

Use your built-in image generation. Save every result as PNG into
`gif-me-a-break/artwork/`, named exactly as below. Where a transparent background is
asked for and your tool can't make one, use a flat solid `#111733` background
instead and say so at the end.

## Shared art direction

Entirely original. Playful flat 2D sticker illustration: chunky rounded shapes,
a confident even outline in deep navy ink `#111733`, flat fills with one soft
shade, a thick off-white `#FFF3E0` die-cut sticker border around every
standalone character or sticker, very light print grain. Palette: coral-orange
`#FF7A45` (main), mint `#5FEFC4`, bubblegum pink `#FF8BD1`, cream `#FFF3E0`,
navy ink `#111733`. Friendly, a bit cheeky, readable at small sizes.

Avoid: photorealism, 3D render, anime, emoji look, gradients, glossy plastic,
any existing game's or app's characters or style. In particular, do **not**
draw a round yellow moon face, floating disembodied hands, sparkle/star
fields, or wavy squiggle dividers. No logos of real brands, no watermark, no
UI or frames.

## 1. Mascot: Pętlik the loop cat

A chubby coral-orange cat whose long tail always curls into a closed loop (the
game's name means "loop"). Big round eyes with navy pupils, small pink nose,
cream muzzle and belly, short stubby legs. Same character in every pose.
1024 × 1024, transparent background, character centred, filling about 80%.

| File | Pose |
| --- | --- |
| `cat-hello.png` | Sitting, waving one paw, the tail loop held up beside the head like a speech bubble. Welcoming. |
| `cat-search.png` | Lying on its belly holding a big smartphone with both paws, eyes wide, scrolling. The phone screen is a plain mint rectangle with nothing on it. |
| `cat-win.png` | Standing on hind legs, holding up a golden trophy shaped like a looped ribbon, mouth open in a cheer, tail loop raised. |
| `cat-wait.png` | Curled up asleep inside its own tail loop like a donut, small "z" shapes drawn as simple navy strokes (no letters). |

## 2. Wordmark

`logo-petla.png`: the word **pętla** (lowercase, with the Polish letter ę) in
fat, rounded, slightly bouncy hand-lettering, cream letters with a navy
outline and a coral-orange drop shadow, inside one off-white die-cut sticker
border. The ogonek of the ę curls into a tiny loop. 1536 × 640, transparent
background. Spelling must be exactly `pętla`.

## 3. Reaction stickers

Five die-cut stickers players throw on screen during the reveal. Each is the
word hand-lettered big and bold plus one small doodle that matches the mood.
512 × 512, transparent background, sticker centred filling about 85%,
slightly tilted. Spelling must be exact.

| File | Word | Colour | Doodle |
| --- | --- | --- | --- |
| `sticker-haha.png` | `haha` | coral-orange letters | little tears of laughter drops |
| `sticker-10na10.png` | `10/10` | mint letters | a tiny rosette ribbon |
| `sticker-nieee.png` | `nieee` | pink letters | a wobbly shocked mouth |
| `sticker-pff.png` | `pff` | cream letters on navy | a small puff of air |
| `sticker-brawo.png` | `brawo` | coral letters | two clapping paw prints |

## 4. Placeholder GIF frames

Six stills that stand in for real GIF search results on the mockups. They look
like frames from funny reaction GIFs: candid photo style, natural light,
slightly soft, animals only (no people, no text, no captions, no watermark).
1024 × 768 (4:3), opaque.

| File | Scene |
| --- | --- |
| `gif-dog-dance.png` | A small scruffy dog in sunglasses mid-dance on a city pavement, one paw up. |
| `gif-raccoon-cash.png` | A raccoon at a desk counting a fan of paper banknotes with great concentration, desk lamp on. |
| `gif-dog-tears.png` | A close-up of a golden retriever looking up with shiny, emotional eyes, as if crying with joy. |
| `gif-cat-shades.png` | A ginger cat lounging on a deck chair wearing tiny sunglasses, smug. |
| `gif-fireworks.png` | Colourful fireworks bursting over a city skyline at night, seen from a rooftop. |
| `gif-goose-shop.png` | A goose strutting proudly through the automatic doors of a small grocery shop, caught mid-step. |

At the end, list each file you wrote with its size, and anything you could not
do exactly as asked.

## 5. Backgrounds

The game screen is deep navy `#111733` with cards on top, so backgrounds must
stay quiet: low contrast, nothing behind the middle of the screen that competes
with the cards, and no text. Same palette and sticker world as above, but here
drawn as flat shapes **without** the off-white sticker border, mostly in navy
tones (`#141C3D`, `#18214A`, `#1C2756`) with only tiny touches of coral, mint
and pink. Opaque unless said otherwise.

| File | Size | What it is |
| --- | --- | --- |
| `bg-tile.png` | 1024 × 1024 | A **seamless, tileable** pattern for every screen: scattered small doodles of loops (closed curls), paw prints, tiny play-button triangles, little rounded GIF-frame rectangles and dots, all in navy tones barely lighter than `#111733` (very low contrast), evenly spread, no big shapes. The edges must tile without seams. |
| `bg-lobby.png` | 1920 × 1080 | The lobby backdrop: navy `#111733`, a soft darker vignette, and along the bottom edge a low, wide silhouette of a cozy sofa and floor cushions in slightly lighter navy, as if the players sit there; a few doodle loops floating near the top corners. The middle 70% stays calm and empty. |
| `bg-stage.png` | 1920 × 1080 | The reveal backdrop: navy, with a soft cone of light from the top centre (like a small stage spotlight) fading out by the middle, and a few faint loop doodles in the corners. Centre calm. |
| `confetti.png` | 1920 × 1080, **transparent** | An overlay for the round winner and the final screen: confetti pieces, curly ribbons and a few tiny loop shapes in coral, mint, pink and cream, bunched along the top edge and the two upper corners and thinning towards the middle; the centre and the bottom half stay empty. |

## 7. New name: Gif Me a Break

The game is renamed **Gif Me a Break** (one name in every language). Redraw
the wordmark in exactly the lettering style of `logo-petla.png`: fat, rounded,
slightly bouncy hand-lettering, cream letters with a navy `#111733` outline
and a coral-orange `#FF7A45` drop shadow, inside one off-white `#FFF3E0`
die-cut sticker border. Make the **o**-less word "Gif" stand out a little:
its dot of the "i" is a tiny closed loop, like Pętlik's tail. Spelling must be
exactly `Gif Me a Break`, transparent background.

| File | Size | Layout |
| --- | --- | --- |
| `logo-wide.png` | 2048 × 512 | All four words on one line, for the game's header. |
| `logo-stack.png` | 1536 × 1024 | Two lines, `Gif Me` over `a Break`, for the cover and big screens. |

Then redo the cover as `cover-gmab.png` (1920 × 1080, opaque), the same scene as
`cover.png` but with `logo-stack.png`'s lettering in place of `pętla`.

## 6. Cover

`cover.png`, 1920 × 1080, opaque: the activity's picture in Stellarr's picker.
Navy `#111733` background with the `bg-tile.png` doodles faint behind. The
`pętla` wordmark (reuse `logo-petla.png` as the reference, same lettering) on
the left third, Pętlik the cat on the right holding a phone that shows a
colourful GIF frame, three or four of the reaction stickers (`haha`, `10/10`,
`nieee`, `brawo`) tossed around at angles, and two or three tilted meme cards
(rounded navy cards with a thin lighter outline and a bright picture inside)
fanned behind the cat. Lively, readable as a thumbnail. Use `cat-hello.png`,
`cat-search.png`, `logo-petla.png` and the stickers as references so the
characters and lettering match exactly. The only text is `pętla` and the
sticker words.
