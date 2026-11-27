# Doodle Drift assets

> Since the 0.2 rewrite the fonts and the countdown sprites (`countdown-digits.webp`, `countdown-start.webp`) live in `src/assets/` and are bundled by Vite. The old 1024 px `public/icon.png` and `public/countdown-card.webp` were removed; the manifest uses `artwork/icon-v2.png`. The lobby plays `artwork/menu-print.mp4` (the still when motion is reduced).

## Current activity artwork

- [Background](public/artwork/activity-bg-v2.webp): the paper-cut drawing chain, used in the activity manifest and as the reference for the menu illustration.
- [Icon](public/artwork/icon-v2.png): the coral pencil/telephone and speech bubble, used in the activity manifest and browser tab.

Both images were generated separately with the built-in imagegen tool. Their full prompts, palette and descriptions are recorded in [artwork-prompts.json](artwork-prompts.json). The previous activity covers and thumbnail have been removed.

The remaining assets below belong to the in-game paper-cut / wax-crayon system.

## Typefaces

Headings, menu actions and exported albums use [National Park](public/fonts/national-park-variable.woff2). Supporting text uses [Nunito](public/fonts/nunito-variable.woff2). Both variable fonts are bundled locally with their Polish characters and SIL Open Font Licenses. [National Park source](https://github.com/google/fonts/tree/main/ofl/nationalpark) · [National Park license](public/fonts/NationalPark-OFL.txt) · [Nunito license](public/fonts/Nunito-OFL.txt).

## Animated menu print

The [silent film](public/artwork/menu-print.mp4) and its matching [still](public/artwork/menu-print.webp) are 960 × 960. The built-in ImageGen tool drew the blank paper backdrop and four poses for each character, using the activity artwork as a reference. The cat, rocket and flower take turns about five seconds apart on a fixed backdrop. The loop returns to the starting drawing between scenes.

Backdrop prompt

> Create the blank artwork layer for an interactive paper-collage poster. Use the supplied cat/rocket/flower illustration as the visual master. Deliver one SQUARE poster face. Keep the same playful cut-paper look, thick midnight navy desk, warm textured cream notes, bits of coral and chartreuse corner tape, and a red colored pencil at upper right, lime speech-bubble cutout at upper left, small paper flecks. Reframe the existing landscape scene into a square: extend the midnight navy handmade paper desk above and below, keeping the main group near the middle. Arrange exactly THREE separate LARGE blank vertical cream paper notes SIDE BY SIDE in a single row across the central width, like the reference. Left note gently tilted counterclockwise, center upright, right slightly clockwise. Centers near x=20%, 50%, 80%, all centered around y=52%. Keep the subjects' future drawing areas broad and tall, blank cream paper, without any drawings, symbols or letters on the notes. The trio of notes occupies around 91% of canvas width and about 48% of height, across the middle, so this square can also be cropped to a wide horizontal banner without cutting the three characters off. A thin dark yarn curl quietly connects the three notes along their VERY bottom edges, never through the blank central drawing areas. Preserve the big beautiful colored pencil and ripped tape textures even if near an edge. Balance the taller print with gentle paper cutout confetti near the top and bottom, spacious navy, no fake frame, no text, no numbers, no extra notes, no UI. Full bleed square RGB illustration, not a mockup or a photo of an entire desk.

Shared character sheet prompt

> Generate one square RGBA transparent SPRITE SHEET of four animation drawings in an exact 2 x 2 grid of equal SQUARE cells. Four separate individual drawings, one centered in each quadrant, generous transparent gutters between cells. EACH one must be the SAME recurring character, with the same construction, size, line weight and optical center. The supplied drawing-game poster is STYLE REFERENCE ONLY. Draw ONLY the requested character. Bold handmade dark midnight navy wax crayon contour and a few coral accents, joyful imperfect thick lines with light crayon tooth. Broad readable silhouettes. Preserve a genuinely transparent alpha background, including interior unpainted areas of the line drawings so notebook paper shows through. No sheets of paper, pencil, desk, rectangular cards, backdrop, labels, speech balloons or lettering. No grey shadow or texture field. Each drawing should fill about 70–76% of its square. Read frames top-left, top-right, bottom-left, bottom-right.

Individual actions

> A simple adorable round-headed sitting kitten with two pointy ears, dot eyes and a long curling tail like the reference cat. Four drawings tell a sight gag. 1: the iconic calm sitting cat, smiling, tail on its right. 2: it spots its own tail tip beside its nose and crosses its eyes to look at it. 3: the tail drapes across and under its nose in a ridiculous curled handlebar moustache, the cat puffs out its chest, smug expression. 4: the tail flicks away with two tiny coral ticks, cat winks proudly. Keep it charming and legible, four distinct poses.

> A cheerful little pointy vintage toy rocket angled slightly upper-right, two fins, ONE big round porthole, tiny coral flame, like the reference. Four drawings tell a sight gag: 1: classic resting rocket, round porthole. 2: rocket body squashes as it sputters a little puffy coral exhaust, the porthole lid flips open. 3: instead of taking off a silly SMALL CAT PILOT with round head and two triangular ears suddenly pops its whole head up out of the open porthole, waving. 4: the slightly tilted rocket finally hops upwards with an energetic coral exhaust while the little cat peeks from inside the porthole. Make the rocket the dominant shape in all four frames, with a surprisingly readable cat in frame 3.

> A simple five-petalled daisy on one gracefully bending stalk with two leaves, round flower center with two dot eyes, based on the reference flower. Four drawings tell a sight gag: 1: happy upright daisy, 2: petals squeeze inward, eyes tight shut, leaves draw up, stalk bends back in preparation for a sneeze. 3: explosive cute sneeze! whole blossom pitches forward, three tiny specks of vivid coral pollen and ONE single detached petal fly off, two tiny motion ticks. 4: surprised flower wears the one loose petal on its head like a wonky little hat and grins. No words or sound-effect lettering. Keep all the plant body/stem visible on all four.

## `public/artwork/halftone-navy.webp`

The app background was generated with the built-in ImageGen tool and encoded as WebP.

> Wide 16:9 background texture for a drawing game. A nearly uniform midnight navy field, #07152c, with very subtle pop-art halftone printing at the far left and far right edges. Small ink dots in slightly lighter muted indigo gather loosely in a few irregular screen-printed patches, and dissolve naturally into the navy. The central two thirds are almost entirely plain. Matte, restrained, barely visible on first glance. No objects, no illustrations, no bursts, no symbols, no bright colors, no lettering, no border, no interface.

## `public/icon.png`

> Compact app glyph: a cream spiral sketchbook with a coral wax crayon drawing
> an orbit line toward a tiny acid-lime star. Tactile paper-cut and risograph
> texture, strong silhouette, centered with generous transparent padding and
> readable at 16px. True transparent background; no phone device, text, logo,
> mascot, tile or watermark.

The icon required a second `background-extraction` pass to replace the rendered
checkerboard with genuine alpha. Final project files were resized/encoded to
the activity formats after generation.

`public/logo-mark.webp` and `public/favicon.png` are lightweight derivatives of
the same older generated icon. The in-game logo uses the 256 px logo mark. The activity manifest and browser tab use the new icon above.

## `public/countdown-card.webp`

> Original transparent game-UI countdown prop: a stack of blank cream drawing
> cards with navy spiral binding, coral backing paper and orbit line, plus
> restrained lime and navy paper-star details. Premium handcrafted paper
> collage and wax-crayon texture matching the StellarPhone visual world. Large,
> calm blank center for a dynamic HTML numeral. No letters, numbers, text,
> characters, interface chrome, logo or watermark.

The built-in imagegen tool used `public/logo-mark.webp` and
the former activity thumbnail as style references. A targeted
`background-extraction` pass produced genuine alpha before the final asset was
resized to 768 × 720 and encoded as a 98 KB transparent WebP.

## Countdown notebook and stickers

The [blank notebook](public/illustrations/countdown-notebook.webp) is a transparent 768 × 720 WebP. The built-in ImageGen tool edited the original countdown card using this prompt.

> Precise-object-edit for a layered animation asset. The reference is the exact flat, front-facing transparent paper-cut spiral notebook to edit. Remove ONLY the three decorative starburst stickers: the small dark navy star at upper right, the large yellow/lime star at lower left, and the smaller vermilion coral star at lower right. Restore the surfaces behind them naturally: cream kraft paper, red cover or genuinely transparent outside the silhouette. Preserve the original full notebook silhouette and framing, front-on pose, slight existing slant, the cream page stack, navy metal spiral rings on the left, thin red backing, the single mustard bookmark on the right and the coral crayon cord looping diagonally behind the notebook. Match paper grain, handmade offset shadows, existing outline and positions. The entire front sheet is blank, warm cream paper. Return ONLY one complete isolated notebook with its cord, with real RGBA alpha on all sides, including holes and loops. No stars anywhere, no numerals, no marks on the page, no characters, no border. Match reference scale and near-square aspect. For the small transparent margins keep the whole cord and notebook inside the canvas.

The [sticker strip](public/illustrations/countdown-stars.webp) contains the three cutouts from the original card, in lime, navy and coral order. Each occupies a 128 px square. The page, stickers and numeral follow the same four poses on each beat.

## `public/illustrations/countdown-digits.webp`

ImageGen drew each numeral as its own transparent four-pose sheet. The WebP packs one numeral per row (3, 2, 1) and one pose per column, in reading order. The shared round clock selects each pose. Reduced-motion mode uses the resting pose.

Shared ImageGen prompt, with NUMBER replaced by the digit:

> Generate ONE square transparent RGBA animation sprite sheet of four drawings, precisely a 2 x 2 grid of identical square cells with no borders. The only subject in all four cells is the SAME single digit, NUMBER. Every cell must contain exactly that one unmistakable numeral and nothing else. Hand-painted vintage cartoon title lettering for a paper-cut crayon drawing party game. A very fat, rounded cream-paper-cut numeral painted vivid vermilion-coral red, with a thick bold dark midnight-navy inky outline, a small offset deep-navy printed shadow, and a soft little cream accent stroke. Playful, optionally a couple of tiny navy motion dashes tucked close. No faces, no creatures, no extra words, labels, pencils, particles, badges or backing card. True transparent background in every quadrant. The number occupies about 75% of each cell on all sides. Keep it at approximately the exact center of each quadrant, no overlaps or cropped edges. Stable scale across the sheet, intentional modest cartoon deformation between frames. Upper left, upper right, lower left, lower right reading order. All four clearly separate and clearly legible, on a consistent optical center.

The individual motion prompts were:

> Three is an elastic bouncer. Frame A squash the wide squat 3 a little with weight at its base; B springs up and stretches tall with both rounded bowls; C briefly puffs round as it lands; D settles into a relaxed, upright, iconic 3.

> Two dances with a little swing. Frame A the head of the 2 leans left with its long flat or gently upturned foot planted; B the bowl and baseline arc to the right with a hand-drawn overshoot; C rebounds slightly left; D settles as a beautifully legible upright 2. Preserve the distinctive curved top, diagonal and foot.

> One is a springy exclamation of victory, yet always the digit ONE, no dot. Frame A a slightly stubby 1 with a strong diagonal hooked top flag and wide slab base; B stretches straight up tall like a spring with the same flag and foot; C recoils and leans forward a bit; D plants itself in a strong upright stance.

## Countdown start

The [Start! lettering strip](public/illustrations/countdown-start.webp) holds four transparent 576 × 252 frames. The built-in ImageGen tool used the illustrated 3 as its style reference. The game displays the same lettering for Polish and English.

> Make a transparent lettering-animation sprite sheet for a hand-drawn drawing game. Use the supplied numeral purely as a style and color reference. In EACH of four equal cells, letter exactly “Start!” (capital S, lowercase t-a-r-t, exclamation mark). Show the WHOLE word in one horizontal line in each cell. Only this one word in every cell. No numeral anywhere. Arrange FOUR complete, isolated stamps vertically, one per row, four rows of identical height and equal width on a single portrait canvas, centered horizontally; generous CLEAR transparent gutters to cut the rows apart. Make the word quite wide and its letters large, compact, friendly, and legible on a phone. Match the reference's wax-crayon saturated coral vermilion fill, heavy midnight-navy inky outline and short navy shadow, creamy paper-cut edge and creamy gleam. The same distinctive word in four deliberately different animation poses: top: slightly squashed horizontally broad low anticipation pose. Second: letters spring up and fan playfully with the exclamation rising, taller arched action pose. Third: short squash and rebound with a little tilt after landing. Bottom: calm upright hero pose, very readable, baseline settles. The glyphs keep their identity and the same spelling. One unified piece of expressive hand lettering in each cell, with a slight airy gap before the exclamation. No bursts, ancillary marks, stars, underlines, background color, notebook, characters, watermarks, shadows outside the artwork or labels. Fully transparent background and between rows. No panels or borders.

## `public/illustrations/reaction-*.webp`

> One original horizontal reaction-stamp sheet with exactly five separate
> emblems: a laughing cream paper face, coral orbit-heart, surprised paper
> moon, coral-and-lime flame and clapping paper hands. Tactile cut-paper shapes,
> wax-crayon edges and subtle risograph grain; deep navy, warm cream, coral and
> lime only. Compact silhouettes readable at 28–40 px, true alpha transparency,
> no frames, text, logos, UI or copyrighted characters.

The generated sheet was split into five equal source cells, trimmed and encoded
as transparent WebP files with ImageMagick. The original generated sheet remains
in the image-generation output directory.
