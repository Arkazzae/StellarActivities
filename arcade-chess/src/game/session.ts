/**
 * Starting, restarting and ending games: the player against a bot, a match between two bots, a
 * position played against a bot, and the actions that route to the voice channel's board when an
 * online game is shown.
 */

import { isSpectating, useGameStore } from "@/state/game";
import { timeOption, useUiStore } from "@/state/ui";
import { useStatsStore } from "@/state/stats";
import { outcomeOf, useHistoryStore } from "@/state/history";
import { triggerChat } from "@/ai/bot-chat";
import { getOpponent, seatFor, type EngineConfig, type Seat } from "@/ai/bots";
import { usePuzzleStore } from "@/state/puzzles";
import { PRESETS, type PresetId } from "@/engine/positions";
import { resumeAudio } from "@/sounds";
import type { GameResult, PieceColor, PlayerInfo, TimeControl } from "@/engine/types";
import { chosenStart, sideToMove, STANDARD_FEN } from "@/engine/positions";
import { onlineLeave, onlineRematch, onlineResign } from "@/online/sync";
import { t } from "@/i18n";

type Seats = Record<PieceColor, Seat | null>;

const UNLIMITED: TimeControl = { initial: 0, increment: 0 };

/** The seats picked on the bot screen; null is the player's side, rolled now when "random" unless given. */
export function lobbySeats(playerSide?: PieceColor): Seats {
  const ui = useUiStore.getState();
  if (ui.mode === "match") return { w: seatFor(ui.match.w, ui.engine.w), b: seatFor(ui.match.b, ui.engine.b) };
  const bot = seatFor(ui.mode === "chaos" ? ui.chaosOpponent : ui.opponent, ui.engine.vs);
  // A position is played by the side to move; the bot answers.
  const side: PieceColor = ui.mode === "positions"
    ? sideToMove(lobbyStart() ?? STANDARD_FEN)
    : playerSide ?? (ui.side === "random" ? (Math.random() < 0.5 ? "w" : "b") : ui.side);
  return side === "w" ? { w: null, b: bot } : { w: bot, b: null };
}

/** The position picked on the bot screen, or null while a pasted FEN cannot be played. */
export function lobbyStart(): string | null {
  const choice = chosenStart(useUiStore.getState());
  return choice.ok ? choice.fen : null;
}

/** The player takes the side to move in `fen` (the Positions tab's pick by default) against the chosen bot. */
export function startPosition(fen: string | null = lobbyStart()): void {
  if (!fen) return;
  // No clock: the position is a puzzle, not a race.
  startGame(lobbySeats(), fen, UNLIMITED, sideToMove(fen));
}

/** Stockfish at full strength: a test position is judged against the best defence. */
const DEFENDER: EngineConfig = { skill: 20, depth: 14, moveTimeMs: 1000 };

/** Open a test position from the Puzzles page: the player takes the side to move, Stockfish defends. */
export function startPuzzle(id: PresetId): void {
  const preset = PRESETS.find((item) => item.id === id);
  if (!preset) return;
  const ui = useUiStore.getState();
  ui.setMode("positions");
  ui.setPositionPick(id);
  usePuzzleStore.getState().begin(id);
  const side = sideToMove(preset.fen);
  const defender = seatFor("stockfish", DEFENDER);
  startGame(side === "w" ? { w: null, b: defender } : { w: defender, b: null }, preset.fen, UNLIMITED, side);
}

function playerInfo(seat: Seat | null): PlayerInfo {
  if (!seat) return { userId: "player", username: t("player.you"), avatarUrl: null };
  const opponent = getOpponent(seat.id);
  return { userId: opponent.id, username: opponent.name, avatarUrl: opponent.avatarUrl };
}

/** Start a game with the choices from the bot screen, or with the given seats and position for a rematch. */
export function startGame(
  seats: Seats = lobbySeats(),
  startFen: string | null = lobbyStart(),
  timeControl: TimeControl = timeOption(useUiStore.getState().timeId).tc,
  solver: PieceColor | null = null,
  chaos: boolean = !solver && useUiStore.getState().mode === "chaos",
): void {
  if (!startFen) return;
  resumeAudio();
  const ui = useUiStore.getState();
  ui.setHint(null);
  ui.setPanelTab("game");
  ui.setView("play");
  useGameStore.getState().newGame({
    timeControl,
    seats,
    players: { w: playerInfo(seats.w), b: playerInfo(seats.b) },
    startFen,
    solver,
    chaos: !solver && chaos,
  });
}

export function rematch(): void {
  const { seats, startFen, solver, online, chaos } = useGameStore.getState();
  if (online) return void onlineRematch();
  // A position is simply played again from the same side.
  if (solver) return startGame(seats, startFen, UNLIMITED, solver);
  // Like a rematch on a chess site: colours swap, for the player and in a match alike; the position stays.
  startGame({ w: seats.b, b: seats.w }, startFen, undefined, null, chaos.enabled);
}

/** Leave the finished (or watched) game for the screen it came from. */
export function backToLobby(): void {
  const { online, chaos } = useGameStore.getState();
  useUiStore.getState().setHint(null);
  if (online) onlineLeave();
  useGameStore.getState().reset();
  if (online) useUiStore.getState().setView("online");
  // A Chaos game goes back to the Chaos menu.
  else if (chaos.enabled) useUiStore.getState().setView("chaos");
}

/** The bot facing the player in an ordinary game (not a position, not a match), for the record. */
function rankedOpponent(): Seat | null {
  const { seats, myColor, solver, online, chaos } = useGameStore.getState();
  // A Chaos win owes something to the cards: it does not climb the ladder.
  if (online || solver || !myColor || chaos.enabled) return null;
  return seats[myColor === "w" ? "b" : "w"];
}

export function finishGame(result: GameResult): void {
  const state = useGameStore.getState();
  if (state.phase !== "playing" || state.online) return;
  const ranked = rankedOpponent();
  state.setResult(result);
  if (ranked) useStatsStore.getState().record(ranked.id, result.winner === null ? "d" : result.winner === state.myColor ? "w" : "l");
  recordGame(result);
  if (!result.winner) return;
  const { seats } = state;
  const mirror = seats.w && seats.b && seats.w.id === seats.b.id;
  // Against the player the bot speaks either way; in a match the winner does.
  const speaker = seats[result.winner] ?? seats[result.winner === "w" ? "b" : "w"];
  if (!speaker) return;
  triggerChat(mirror ? "mirrorEnd" : seats[result.winner] ? "win" : "loss", getOpponent(speaker.id));
}

/** Keep a game the player took part in for the statistics page (bot games, positions, Chaos). */
function recordGame(result: GameResult): void {
  const { myColor, seats, startFen, chess, chaos, chaosTimeline } = useGameStore.getState();
  if (!myColor) return;
  const them = seats[myColor === "w" ? "b" : "w"];
  if (!them) return;
  const opponent = getOpponent(them.id);
  useHistoryStore.getState().add({
    kind: chaos.enabled ? "chaos" : useGameStore.getState().solver ? "position" : "bot",
    opponent: opponent.name,
    opponentId: opponent.id,
    color: myColor,
    outcome: outcomeOf(result, myColor),
    reason: result.reason,
    startFen,
    // chess.js replays its history to list it, which would scramble a board the Chaos cards changed.
    moves: chaos.enabled
      ? chaosTimeline.slice(1).map((ply) => (ply.lastMove ? `${ply.lastMove.from}${ply.lastMove.to}` : "")).filter(Boolean).join(" ")
      : chess.history({ verbose: true }).map((move) => `${move.from}${move.to}${move.promotion ?? ""}`).join(" "),
  });
}

export function resign(): void {
  const { myColor, phase, online } = useGameStore.getState();
  if (phase !== "playing" || !myColor) return;
  if (online) return void onlineResign();
  finishGame({ winner: myColor === "w" ? "b" : "w", reason: "resignation" });
}

/** "by checkmate", "on time", … in the current language. */
export function reasonText(reason: GameResult["reason"]): string {
  return t(`reason.${reason}`);
}

/** The game so far as PGN, with headers, for the PGN dialog. */
export function gamePgn(): string {
  const state = useGameStore.getState();
  const { chess, players, result, myColor, seats, online } = state;
  const date = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const white = players.w?.username ?? t("side.w");
  const black = players.b?.username ?? t("side.b");
  const bot = myColor ? seats[myColor === "w" ? "b" : "w"] : null;
  chess.setHeader("Event", online ? t("pgn.eventOnline")
    : isSpectating(state) ? t("pgn.eventMatch", { white, black })
    : bot ? t("pgn.eventBot", { name: getOpponent(bot.id).name }) : t("pgn.event"));
  chess.setHeader("Site", "Arcade Chess");
  chess.setHeader("Date", `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`);
  chess.setHeader("White", white);
  chess.setHeader("Black", black);
  const score = result ? (result.winner === "w" ? "1-0" : result.winner === "b" ? "0-1" : "1/2-1/2") : "*";
  chess.setHeader("Result", score);
  if (state.chaos.enabled) return chaosPgn(state.moves, score, { White: white, Black: black, Date: `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}` });
  return chess.pgn() + "\n";
}

/**
 * A Chaos game as PGN: the moves as played, with the variant named. Effects change the board between
 * moves, so ordinary chess software cannot replay it; the record is for reading.
 */
function chaosPgn(moves: string[], score: string, headers: Record<string, string>): string {
  const tags = { Event: "Chaos Chess", Site: "Arcade Chess", ...headers, Result: score, Variant: "Chaos Chess" };
  const head = Object.entries(tags).map(([key, value]) => `[${key} "${value.replace(/"/g, "'")}"]`).join("\n");
  const body = moves.map((san, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${san}` : san)).join(" ");
  return `${head}\n\n${body ? `${body} ` : ""}${score}\n`;
}
