# Changelog

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
