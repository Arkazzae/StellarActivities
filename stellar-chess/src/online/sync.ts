/**
 * Multiplayer, wired to Stellarr: registers the rules for the referee, mirrors the tables of the
 * room's shared state into the game store (the table being played or watched), sends the player's
 * own moves and watches the clocks.
 *
 * Moves are shown at once and sent after; the room's state is the truth, so a move the host
 * refuses (or a reconnect that missed some) is settled by reloading the game from the room.
 */

import { create } from "zustand";
import type { ActivityState, JsonValue, Participant } from "@stellarr/sdk";
import { useGameStore } from "@/state/game";
import { useUiStore } from "@/state/ui";
import { useStatsStore } from "@/state/stats";
import { outcomeOf, useHistoryStore } from "@/state/history";
import { playMoveSound } from "@/sounds";
import { t } from "@/i18n";
import type { ClockState } from "@/engine/clock";
import type { Move, PieceColor } from "@/engine/types";
import { isVoiceRoom, session } from "@/stellarr/sdk";
import { COMMANDS, decide, INITIAL_STATE, isUnlimitedTc, timeLeft, type ColorChoice, type Match, type SharedState, type Table } from "./protocol";

interface OnlineState {
  /** Whether this session is shared with other people, so tables can be hosted and joined. */
  available: boolean;
  me: string;
  shared: SharedState;
  participants: Participant[];
  host: string | null;
  connection: "connected" | "reconnecting" | "closed";
  /** A command on its way to the host (to disable the button that sent it). */
  pending: string | null;
  /** The table whose game is on the board. */
  watching: string | null;
}

export const useOnlineStore = create<OnlineState>(() => ({
  available: false,
  me: "",
  shared: INITIAL_STATE,
  participants: [],
  host: null,
  connection: "connected",
  pending: null,
  watching: null,
}));

/** The finished game the player walked away from; it is not shown again by itself. */
let dismissedMatch: string | null = null;
/** The ply last sent for the shown game, so one move is never submitted twice. */
let sentPly = -1;
const flagSent = new Set<string>();
/** Games and tables already announced in a toast, so each is announced once. */
const announced = new Set<string>();
/** Whether the room's state has been seen once (tables open before then are not announced). */
let seeded = false;

export function myColorIn(match: Match | null, me: string): PieceColor | null {
  if (!match) return null;
  return match.players.w === me ? "w" : match.players.b === me ? "b" : null;
}

function uciOf(move: Pick<Move, "from" | "to" | "promotion">): string {
  return `${move.from}${move.to}${move.promotion ?? ""}`;
}

/** The room's clock in the local terms of the game store (Date.now()-based ticks). */
function localClock(match: Match): ClockState {
  const { clock } = match;
  const elapsed = clock.running ? session().now() - clock.since : 0;
  return { w: clock.w, b: clock.b, running: clock.running, lastTick: Date.now() - elapsed };
}

async function submit(kind: string, data: Record<string, JsonValue>, id?: string): Promise<JsonValue | undefined> {
  useOnlineStore.setState({ pending: kind });
  try {
    return await session().commands.submit(kind, data, id ? { id } : undefined);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    useUiStore.getState().showToast(t("online.refused", { reason: message }));
    throw error;
  } finally {
    useOnlineStore.setState({ pending: null });
  }
}

/** The table whose game is shown on the board, if any. */
function shownTable(): Table | null {
  const shown = useGameStore.getState().online?.matchId;
  if (!shown) return null;
  return useOnlineStore.getState().shared.tables.find((table) => table.match?.id === shown) ?? null;
}

/** The match with this id at any table (for the panels). */
export function matchById(shared: SharedState, id: string | null | undefined): Match | null {
  if (!id) return null;
  return shared.tables.find((table) => table.match?.id === id)?.match ?? null;
}

/** The table where this person plays a game still going on. */
export function tableOf(shared: SharedState, me: string): Table | null {
  return shared.tables.find((table) => table.match && !table.match.result && myColorIn(table.match, me) !== null) ?? null;
}

function playerInfo(match: Match, color: PieceColor) {
  return { userId: match.players[color], username: match.names[color], avatarUrl: match.avatars[color] };
}

/** Show a table's game exactly as it stands. */
function load(table: Table): void {
  const match = table.match;
  if (!match) return;
  const me = useOnlineStore.getState().me;
  useOnlineStore.setState({ watching: table.id });
  sentPly = match.moves.length - 1;
  useGameStore.getState().loadOnline({
    matchId: match.id,
    myColor: myColorIn(match, me),
    players: { w: playerInfo(match, "w"), b: playerInfo(match, "b") },
    timeControl: match.tc,
    startFen: match.startFen,
    moves: match.moves,
    clock: localClock(match),
    result: match.result,
  });
}

/** Bring the shown game up to the room's: play the moves it is missing, keep a move of ours still on its way. */
function follow(match: Match): void {
  const game = useGameStore.getState();
  const local = game.chess.history({ verbose: true }).map(uciOf);
  const ahead = local.length > match.moves.length;
  const prefix = (short: string[], long: string[]) => short.every((uci, i) => long[i] === uci);
  if (ahead ? !prefix(match.moves, local) : !prefix(local, match.moves)) {
    const table = shownTable();
    return table ? load(table) : undefined;
  }

  let last: Move | null = null;
  for (const uci of match.moves.slice(local.length)) {
    const move = game.chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }) as unknown as Move;
    useGameStore.getState().applyMove(move);
    last = move;
  }
  if (last) playMoveSound(last);
  // Our own move still on its way keeps the local clock; otherwise the room's clock is the one shown.
  if (!ahead) useGameStore.setState({ clock: localClock(match) });

  if (match.result && useGameStore.getState().phase === "playing") {
    useGameStore.getState().setResult(match.result);
    recordResult(match);
  }
}

function recordResult(match: Match): void {
  const color = myColorIn(match, useOnlineStore.getState().me);
  if (!color || !match.result) return;
  useStatsStore.getState().record("online", match.result.winner === null ? "d" : match.result.winner === color ? "w" : "l");
  useHistoryStore.getState().add({
    kind: "online",
    opponent: match.names[color === "w" ? "b" : "w"],
    opponentId: null,
    color,
    outcome: outcomeOf(match.result, color),
    reason: match.result.reason,
    startFen: match.startFen,
    moves: match.moves.join(" "),
  });
}

/** The card last sent to the room, so the same one is not sent again on every state. */
let publishedCard = "";

/**
 * Stellarr Elo: count each of the player's finished games once in their saved rating (even one
 * not on the board, like a game the opponent left), then show the room the player's card when
 * the room's copy differs from the saved one (on arrival, and after a game).
 */
function settleRating(shared: SharedState): void {
  const me = useOnlineStore.getState().me;
  const stats = useStatsStore.getState();
  // The results outlive the tables (closed when a player gets up), so a player who was away when
  // their game ended, say one they left, still has it counted when they come back.
  const finished = [
    ...[...shared.results].reverse(),
    ...shared.tables.flatMap((table) => (table.match?.result && table.match.ratingChange
      ? [{ id: table.match.id, players: table.match.players, names: table.match.names, result: table.match.result, change: table.match.ratingChange, at: session().now() }]
      : [])),
  ];
  for (const game of finished) {
    const color = game.players.w === me ? "w" : game.players.b === me ? "b" : null;
    if (!color) continue;
    stats.rate({
      id: game.id,
      opponent: game.names[color === "w" ? "b" : "w"],
      outcome: game.result.winner === null ? "d" : game.result.winner === color ? "w" : "l",
      change: game.change[color],
      at: game.at,
    });
  }
  const { elo, peak, games, w, d, l } = useStatsStore.getState().rating;
  const card = { elo, peak, games, w, d, l };
  const key = JSON.stringify(card);
  const room = shared.profiles[me];
  const same = room && room.elo === elo && room.peak === peak && room.games === games && room.w === w && room.d === d && room.l === l;
  if (same || key === publishedCard) return;
  publishedCard = key;
  session().commands.submit("profile", card).catch(() => {
    publishedCard = "";
  });
}

/** Mirror a new room state into the game shown, pulling players into their game. */
function reconcile(shared: SharedState): void {
  const me = useOnlineStore.getState().me;
  const game = useGameStore.getState();
  const shown = game.online?.matchId ?? null;
  const view = useUiStore.getState().view;
  const busyWithBots = game.phase === "playing" && !game.online;

  // The game on the board goes on.
  const showing = shown ? shared.tables.find((table) => table.match?.id === shown) : null;
  if (showing?.match) follow(showing.match);
  // A rematch at the table on the board: its players move on to the new game.
  const watched = useOnlineStore.getState().watching;
  const rematched = !showing && watched ? shared.tables.find((table) => table.id === watched && table.match && !table.match.result) : null;
  if (rematched?.match && myColorIn(rematched.match, me) && shown && rematched.match.id !== dismissedMatch) {
    load(rematched);
    return;
  }

  // A player is brought to their new game, unless a bot game is on.
  const mine = tableOf(shared, me);
  if (mine?.match && mine.match.id !== shown && mine.match.id !== dismissedMatch && !busyWithBots) {
    load(mine);
    useUiStore.getState().setView("online");
    useUiStore.getState().setPanelTab("game");
    return;
  }

  // Elsewhere in the app, others' new tables are announced once; the ones already open on arrival are not news.
  const arriving = !seeded;
  seeded = true;
  for (const table of shared.tables) {
    if (table.match || table.host === me || announced.has(table.id)) continue;
    announced.add(table.id);
    if (!arriving && view !== "online") useUiStore.getState().showToast(t("online.tableOpened", { name: table.hostName }));
  }
}

/** Send the player's newest move when the board has one the room has not seen. */
function sendOwnMove(): void {
  const game = useGameStore.getState();
  const table = shownTable();
  const match = table?.match ?? null;
  if (!game.online || !table || !match || game.online.matchId !== match.id || !game.myColor || match.result) return;
  const history = game.chess.history({ verbose: true });
  const ply = match.moves.length;
  if (history.length !== ply + 1 || sentPly >= ply) return;
  const move = history[ply];
  if (move.color !== game.myColor) return;
  sentPly = ply;
  submit("move", { tableId: table.id, matchId: match.id, ply, uci: uciOf(move) }, `move:${match.id}:${ply}`).catch(() => {
    // Refused or lost: show the room's game again.
    const latest = shownTable();
    if (latest?.match && latest.match.id === match.id) load(latest);
  });
}

/** Anyone may point out a fallen flag at any table; the referee checks it against its own clock. */
function watchFlag(): void {
  for (const table of useOnlineStore.getState().shared.tables) {
    const match = table.match;
    if (!match || match.result || isUnlimitedTc(match.tc) || !match.clock.running) continue;
    const key = `${match.id}:${match.moves.length}`;
    if (flagSent.has(key) || timeLeft(match.clock, match.clock.running, session().now()) > 0) continue;
    flagSent.add(key);
    session().commands.submit("flag", { tableId: table.id, matchId: match.id }, { id: `flag:${key}` }).catch(() => flagSent.delete(key));
  }
}

/** Register the rules and start mirroring the room; only in a voice channel. */
export function startOnline(): void {
  if (!isVoiceRoom()) return;
  const s = session();
  useOnlineStore.setState({ available: true, me: s.context.me.id });

  for (const kind of COMMANDS) {
    s.commands.handle(kind, (data, meta, current) => {
      const decision = decide(kind, data, current as unknown as SharedState, {
        from: meta.from,
        now: s.now(),
        roster: s.participants.get(),
        random: Math.random,
      });
      return { patch: decision.patch as Partial<ActivityState> | undefined, result: (decision.result ?? null) as JsonValue };
    });
  }

  s.participants.subscribe((participants) => useOnlineStore.setState({ participants }));
  s.host.subscribe((host) => useOnlineStore.setState({ host }));
  s.connection.subscribe((connection) => useOnlineStore.setState({ connection }));
  s.state.subscribe((state) => {
    const raw = state as Partial<SharedState>;
    const shared = {
      ...INITIAL_STATE,
      ...raw,
      tables: Array.isArray(raw?.tables) ? raw.tables : [],
      profiles: raw?.profiles && typeof raw.profiles === "object" ? raw.profiles : {},
      results: Array.isArray(raw?.results) ? raw.results : [],
    } as SharedState;
    useOnlineStore.setState({ shared });
    reconcile(shared);
    settleRating(shared);
  });
  useGameStore.subscribe((state, previous) => {
    if (state.fen !== previous.fen) sendOwnMove();
  });
  setInterval(watchFlag, 500);
}

// ── Actions from the interface ──

/** Open a table with a time control and a colour. */
export function hostTable(tc: { initial: number; increment: number }, color: ColorChoice): Promise<unknown> {
  return submit("host", { tc, color });
}

export function closeTable(tableId: string): Promise<unknown> {
  return submit("close", { tableId });
}

/** Sit down at someone's table; the game comes to the board when the room has it. */
export function joinTable(tableId: string): Promise<unknown> {
  dismissedMatch = null;
  return submit("join", { tableId });
}

/** Take a room game off this board (it carries on in the room) before showing something else. */
export function leaveRoomGame(): void {
  if (!useGameStore.getState().online) return;
  onlineLeave();
  useGameStore.getState().reset();
}

/** Open Multiplayer: straight into the player's own game when one is going on, otherwise the tables. */
export function openRoom(): void {
  const online = useOnlineStore.getState();
  const mine = tableOf(online.shared, online.me);
  if (mine) return watchTable(mine.id);
  // A finished room game on the board gives way to the tables.
  leaveRoomGame();
  useUiStore.getState().setView("online");
}

/** Show the game at a table, to play it or watch it. */
export function watchTable(tableId: string): void {
  const table = useOnlineStore.getState().shared.tables.find((item) => item.id === tableId);
  if (!table?.match) return;
  dismissedMatch = null;
  load(table);
  useUiStore.getState().setView("online");
  useUiStore.getState().setPanelTab("game");
}

function matchAction(kind: string): void {
  const table = shownTable();
  if (table?.match) submit(kind, { tableId: table.id, matchId: table.match.id }).catch(() => undefined);
}

export const onlineResign = () => matchAction("resign");
export const onlineDraw = () => matchAction("draw");
export const onlineDecline = () => matchAction("decline");
export const onlineRematch = () => matchAction("rematch");
export const onlineAbandon = () => matchAction("abandon");

/**
 * The player walks away from the shown game: a finished one is not brought back by itself, and a
 * player getting up after the end closes the table.
 */
export function onlineLeave(): void {
  const table = shownTable();
  const shown = useGameStore.getState().online?.matchId ?? null;
  if (shown) dismissedMatch = shown;
  useOnlineStore.setState({ watching: null });
  const me = useOnlineStore.getState().me;
  if (table?.match?.result && myColorIn(table.match, me)) submit("leave", { tableId: table.id }).catch(() => undefined);
}
