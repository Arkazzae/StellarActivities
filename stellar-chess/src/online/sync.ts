/**
 * The voice channel's board, wired to Stellarr: registers the rules for the host, mirrors the
 * room's shared state into the game store, sends the player's own moves and watches the clocks.
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
import { COMMANDS, decide, INITIAL_STATE, isUnlimitedTc, timeLeft, type ColorChoice, type Match, type SharedState } from "./protocol";

interface OnlineState {
  /** Whether this session is a voice-channel room where a board is shared. */
  available: boolean;
  me: string;
  shared: SharedState;
  participants: Participant[];
  host: string | null;
  connection: "connected" | "reconnecting" | "closed";
  /** A command on its way to the host (to disable the button that sent it). */
  pending: string | null;
}

export const useOnlineStore = create<OnlineState>(() => ({
  available: false,
  me: "",
  shared: INITIAL_STATE,
  participants: [],
  host: null,
  connection: "connected",
  pending: null,
}));

/** The finished game the player walked away from; it is not shown again by itself. */
let dismissedMatch: string | null = null;
/** The ply last sent for the shown game, so one move is never submitted twice. */
let sentPly = -1;
let flagSentFor: string | null = null;
/** The game last announced in a toast, so a game the player is not looking at is announced once. */
let announcedMatch: string | null = null;

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

function currentMatch(): Match | null {
  return useOnlineStore.getState().shared.match;
}

function playerInfo(match: Match, color: PieceColor) {
  return { userId: match.players[color], username: match.names[color], avatarUrl: match.avatars[color] };
}

/** Show the room's game exactly as it stands. */
function load(match: Match): void {
  const me = useOnlineStore.getState().me;
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
  if (ahead ? !prefix(match.moves, local) : !prefix(local, match.moves)) return load(match);

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

/** Mirror a new room state into the game shown, pulling players into their game. */
function reconcile(shared: SharedState): void {
  const match = shared.match;
  const game = useGameStore.getState();
  const shown = game.online?.matchId ?? null;
  if (!match) return;
  if (shown === match.id) return follow(match);

  const mine = myColorIn(match, useOnlineStore.getState().me) !== null;
  const view = useUiStore.getState().view;
  const busyWithBots = game.phase === "playing" && !game.online;
  // Someone looking back at a finished room game (its review, its moves) keeps it until they leave it.
  const reviewing = game.phase === "ended" && game.online !== null;
  if (match.id === dismissedMatch) return;
  // Players are brought to their new game; watchers on the room's page see it start; a bot game is never interrupted.
  if ((mine && !busyWithBots) || (view === "online" && !busyWithBots && !reviewing && !match.result)) {
    load(match);
    useUiStore.getState().setView("online");
    useUiStore.getState().setPanelTab("game");
    return;
  }
  if (match.result || announcedMatch === match.id) return;
  announcedMatch = match.id;
  if (mine) useUiStore.getState().showToast(t("online.yourGameStarted"));
  else if (reviewing) useUiStore.getState().showToast(t("online.nextGameStarted", { white: match.names.w, black: match.names.b }));
}

/** Send the player's newest move when the board has one the room has not seen. */
function sendOwnMove(): void {
  const game = useGameStore.getState();
  const match = currentMatch();
  if (!game.online || !match || game.online.matchId !== match.id || !game.myColor || match.result) return;
  const history = game.chess.history({ verbose: true });
  const ply = match.moves.length;
  if (history.length !== ply + 1 || sentPly >= ply) return;
  const move = history[ply];
  if (move.color !== game.myColor) return;
  sentPly = ply;
  submit("move", { matchId: match.id, ply, uci: uciOf(move) }, `move:${match.id}:${ply}`).catch(() => {
    // Refused or lost: show the room's game again.
    const latest = currentMatch();
    if (latest && latest.id === match.id) load(latest);
  });
}

/** Anyone watching may point out a fallen flag; the host checks it against its own clock. */
function watchFlag(): void {
  const match = currentMatch();
  if (!match || match.result || isUnlimitedTc(match.tc) || !match.clock.running) return;
  const key = `${match.id}:${match.moves.length}`;
  if (flagSentFor === key || timeLeft(match.clock, match.clock.running, session().now()) > 0) return;
  flagSentFor = key;
  session().commands.submit("flag", { matchId: match.id }, { id: `flag:${key}` }).catch(() => { flagSentFor = null; });
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
    const shared = { ...INITIAL_STATE, ...(state as Partial<SharedState>) } as SharedState;
    useOnlineStore.setState({ shared });
    reconcile(shared);
  });
  useGameStore.subscribe((state, previous) => {
    if (state.fen !== previous.fen) sendOwnMove();
  });
  setInterval(watchFlag, 500);
}

// ── Actions from the interface ──

export function postChallenge(tc: { initial: number; increment: number }, color: ColorChoice): Promise<unknown> {
  dismissedMatch = currentMatch()?.id ?? dismissedMatch;
  return submit("challenge", { tc, color });
}

export function cancelChallenge(): Promise<unknown> {
  return submit("cancel", {});
}

export function acceptChallenge(challengeId: string): Promise<unknown> {
  return submit("accept", { challengeId });
}

/** Take a room game off this board (it carries on in the room) before showing something else. */
export function leaveRoomGame(): void {
  if (!useGameStore.getState().online) return;
  onlineLeave();
  useGameStore.getState().reset();
}

/** Open the channel's board: straight into the game when one is being played. */
export function openRoom(): void {
  const match = currentMatch();
  if (match && !match.result) return watchMatch();
  // A finished room game on the board gives way to the lobby.
  leaveRoomGame();
  useUiStore.getState().setView("online");
}

/** Show the game being played in the room. */
export function watchMatch(): void {
  const match = currentMatch();
  if (!match) return;
  dismissedMatch = null;
  load(match);
  useUiStore.getState().setView("online");
  useUiStore.getState().setPanelTab("game");
}

function matchAction(kind: string): void {
  const match = currentMatch();
  if (match) submit(kind, { matchId: match.id }).catch(() => undefined);
}

export const onlineResign = () => matchAction("resign");
export const onlineDraw = () => matchAction("draw");
export const onlineDecline = () => matchAction("decline");
export const onlineRematch = () => matchAction("rematch");
export const onlineAbandon = () => matchAction("abandon");

/** The player walks away from the shown game; a finished one is not brought back by itself. */
export function onlineLeave(): void {
  const shown = useGameStore.getState().online?.matchId ?? null;
  if (shown) dismissedMatch = shown;
}
