# Changelog

## Unreleased

- Renamed from Stellar Chess to Arcade Chess, to match the game-character bots and the pixel-art look. Only the shown name changed: the activity id stays `stellar-chess`, so saved progress carries over.
- A new pixel-art icon (a knight on an arcade screen, also the logo mark in the sidebar) and cover (the bots around the board in a night-time arcade).
- New bots: eight parodies of video-game types instead of eight ordinary people, with 32-bit-style pixel-art portraits (Stockfish too) and new lines in Polish and English: Glut the level-1 slime (250), Zenek the villager NPC (450), Turbo the speedrunner (700), Mimik the treasure-chest trap (1000), Bazyl the travelling merchant (1300), Bronka the tank (1600), Bogdan the fighting-game combo master (1900) and Mordax the final boss (2200). Each keeps its rung's strength, with a play style to match. Records, history and choices against the first ladder move to the character on the same rung.
- Stellarr Elo for Multiplayer: every finished game moves both players' rating (start 1200, K = 32). The Ladder page has a Players tab: the session ranked by Elo with each player's last change, games, wins–draws–losses, score and best rating, the session's results with the change each game made, and your own card with your last games. The bots' ladder moved to a Bots tab. Your Elo is saved in your Stellarr progress and shows under your name in the sidebar.
- Multiplayer opens on its own page instead of a board: open tables waiting for an opponent, games being played with their live position, hosting a game, and who is in the activity. The board opens for a game.
- Multiplayer is now tables: anyone can host a table with their own clock and colour, others join the one they want or watch any game, and several games run at once. A rematch stays at the same table; a player getting up after the game closes it.
- Board look in the settings: three piece sets (Classic, the new default drawn for Stellar Chess; Cartoon; Tournament, the cburnett set) and six square colours, with a preview. Every picture of a piece follows the chosen set.
- Chaos Chess is hidden for now (`CHAOS_ENABLED` in `src/features.ts`). While hidden it was reworked: cards in Multiversal Chess's dark style instead of bright frames and gems, a picture of the card instead of cartoon icons, its own illustration for every one of the 50 cards, and the five opponents redrawn as fantasy classes (Sorceress, Chronomancer, Warrior, Oracle, Arbiter of Chaos).
- The empty statistics page shows where to start: the next ladder rival greeting you, the whole ladder, the puzzle of the day and Puzzle Rush.

## 0.1.0 — 2026-11-27

First version, built from FlyChess 2.0 (`Arkazzae/flychess@27ae022`).

- **No fly.** Removed the fruit-fly opponent: the DROSO-1 model, the connectome, the brain views, their preloader and the fly's "solves" mode.
- **Shell like a chess site.** A sidebar with a Play menu (bot, multiplayer, Chaos Chess, bot vs bot, puzzles, the last game's review), Puzzles, Chaos Chess, Multiplayer, Ladder and Statistics; the mode is chosen only there. On a phone it becomes a top bar.
- **Statistics as the start page.** Games, win rate, longest streak and ladder progress over 7, 14 or 30 days or all time, a day-by-day chart, results by colour, recent games with their review, and the openings played most. Up to 40 games are kept in Stellarr progress.
- **The ladder.** Eight original bots, Kuba (250) to Wiktor (2200), each choosing among Stockfish's lines in its own way and talking in Polish and English, with Stockfish as the configurable top opponent.
- **Multiplayer.** Players in the same Stellarr session post and accept challenges, the host checks every move, and the rest can watch. Games have a clock with increment, draw offers, resignation, a win when the opponent leaves, and rematches, and survive a host reload or failover. Classic chess only.
- **Chaos Chess** (engine from Multiversal Chess):
  - Every four moves the game stops for a draft of three playing cards from a deck of 50 effects; some cards ask for a square on the board.
  - Active cards show as icons with tooltips beside each player, and as cards with their turns and a chronicle in the game panel. Pieces the cards forge, summon, curse or restore have their own art.
  - Its own menu has five original opponents, each with a favourite kind of card. A Chaos game is browsed move by move rather than reviewed by the engine, and does not count on the ladder.
- **Puzzles.**
  - A puzzle rating, a daily streak with the last week, and a different puzzle of the day every day.
  - Puzzle Rush: three minutes, three mistakes.
  - Theme drills on 190 generated mates in one and two, each checked to have a single solution.
  - Test positions and endgames against Stockfish's defence, with a coach and best times, and six badges.
- **Stellarr.** Settings, choices, history, puzzle progress and the language are saved in Stellarr progress, since the activity frame has no `localStorage`. The language follows Stellarr's and sounds follow the Game audio slider. PGN is shown to copy instead of downloaded, since activity frames cannot download files.
- **Art and fonts.** Codex generated the pieces (with Chaos variants), the portraits and the icons. The card illustrations, icon and cover come from Multiversal Chess. Fonts are bundled, since Stellarr's content security policy blocks Google Fonts.
- **Fix from FlyChess.** Time controls were read as milliseconds by a clock that counts seconds, which turned "1 min" into almost 17 hours.
