/**
 * Games between people in a voice channel. One board per room, shared through Stellarr's
 * host-authoritative state: players submit commands, the elected host checks them against the
 * rules here and commits the result. Every client registers the same rules, so whoever becomes
 * host after a disconnect carries on from the shared state alone (the moves, never a local board).
 *
 * Pure functions only: no SDK, no stores. Times are milliseconds of the session clock
 * (`session.now()`); time controls are in seconds, as everywhere else in the app.
 */

import { Chess } from "chess.js";
import type { GameResult, PieceColor, TimeControl } from "@/engine/types";
import { STANDARD_FEN } from "@/engine/positions";

export type ColorChoice = PieceColor | "random";

export interface Challenge {
  id: string;
  /** Participant who posted it. */
  by: string;
  tc: TimeControl;
  /** The colour the challenger wants. */
  color: ColorChoice;
  at: number;
}

export interface MatchClock {
  /** Milliseconds left for each side when its clock last stopped. */
  w: number;
  b: number;
  /** Whose clock runs, from `since` (session time); null before the first move and after the end. */
  running: PieceColor | null;
  since: number;
}

export interface Match {
  id: string;
  /** Participant ids at each colour. */
  players: Record<PieceColor, string>;
  /** Names and avatars as they were when the game started; the room roster may change. */
  names: Record<PieceColor, string>;
  avatars: Record<PieceColor, string | null>;
  tc: TimeControl;
  startFen: string;
  /** UCI moves from the start position. */
  moves: string[];
  clock: MatchClock;
  result: GameResult | null;
  /** The colour offering a draw right now. */
  drawOffer: PieceColor | null;
  /** Who asked to play again after the end. */
  rematch: Record<PieceColor, boolean>;
  startedAt: number;
}

export interface SharedState {
  [key: string]: unknown;
  v: 1;
  challenge: Challenge | null;
  match: Match | null;
}

export const INITIAL_STATE: SharedState = { v: 1, challenge: null, match: null };

export interface RosterEntry {
  id: string;
  name: string;
  avatar: string | null;
  connected: boolean;
}

/** What the host needs besides the command itself. */
export interface DecideContext {
  from: string;
  now: number;
  roster: RosterEntry[];
  /** For colour draws and ids; injectable for tests. */
  random: () => number;
}

export interface Decision {
  patch?: Partial<SharedState>;
  result?: unknown;
}

/** A command the rules refuse; the message goes back to whoever sent it. */
export class Refused extends Error {}

const TIME_LIMITS = { maxInitial: 3 * 3600, maxIncrement: 180 };

export function isUnlimitedTc(tc: TimeControl): boolean {
  return tc.initial === 0 && tc.increment === 0;
}

function other(color: PieceColor): PieceColor {
  return color === "w" ? "b" : "w";
}

/** Session time plus a random tail: unique per room, ordered by creation. */
function newId(ctx: Pick<DecideContext, "now" | "random">): string {
  return `${Math.floor(ctx.now).toString(36)}-${Math.floor(ctx.random() * 2 ** 32).toString(36)}`;
}

/** The board after the match's moves; throws if the stored moves do not replay. */
export function replay(match: Pick<Match, "startFen" | "moves">): Chess {
  const chess = new Chess(match.startFen);
  for (const uci of match.moves) {
    chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  }
  return chess;
}

/** Time left for a side at `now`, counting the running clock. */
export function timeLeft(clock: MatchClock, color: PieceColor, now: number): number {
  return clock.running === color ? Math.max(0, clock[color] - (now - clock.since)) : clock[color];
}

/** The rules' verdict on a finished position, or null while the game goes on. */
export function positionResult(chess: Chess): GameResult | null {
  if (chess.isCheckmate()) return { winner: chess.turn() === "w" ? "b" : "w", reason: "checkmate" };
  if (chess.isStalemate()) return { winner: null, reason: "stalemate" };
  if (chess.isInsufficientMaterial()) return { winner: null, reason: "insufficient" };
  if (chess.isThreefoldRepetition()) return { winner: null, reason: "threefold" };
  if (chess.isDrawByFiftyMoves()) return { winner: null, reason: "fifty_moves" };
  return null;
}

/** Whether a side still has anything that could mate: a flag against bare king (or king and minor) is a draw. */
function canMate(chess: Chess, color: PieceColor): boolean {
  const pieces = chess.board().flat().filter((piece) => piece && piece.color === color).map((piece) => piece!.type);
  if (pieces.some((type) => type === "p" || type === "r" || type === "q")) return true;
  return pieces.filter((type) => type === "n" || type === "b").length >= 2;
}

function colorOf(match: Match, from: string): PieceColor | null {
  return match.players.w === from ? "w" : match.players.b === from ? "b" : null;
}

function activeMatch(state: SharedState, matchId: unknown): Match {
  const match = state.match;
  if (!match || match.id !== matchId) throw new Refused("That game is no longer on the board.");
  return match;
}

function asTimeControl(value: unknown): TimeControl {
  const tc = value as Partial<TimeControl> | null;
  const initial = Number(tc?.initial);
  const increment = Number(tc?.increment);
  if (!Number.isInteger(initial) || !Number.isInteger(increment) || initial < 0 || increment < 0 || initial > TIME_LIMITS.maxInitial || increment > TIME_LIMITS.maxIncrement || (initial === 0 && increment > 0)) {
    throw new Refused("Invalid time control.");
  }
  return { initial, increment };
}

function person(roster: RosterEntry[], id: string): RosterEntry {
  return roster.find((entry) => entry.id === id) ?? { id, name: "?", avatar: null, connected: false };
}

function startMatch(players: Record<PieceColor, string>, tc: TimeControl, ctx: DecideContext): Match {
  const initial = tc.initial * 1000;
  const w = person(ctx.roster, players.w);
  const b = person(ctx.roster, players.b);
  return {
    id: newId(ctx),
    players,
    names: { w: w.name, b: b.name },
    avatars: { w: w.avatar, b: b.avatar },
    tc,
    startFen: STANDARD_FEN,
    moves: [],
    clock: { w: initial, b: initial, running: null, since: ctx.now },
    result: null,
    drawOffer: null,
    rematch: { w: false, b: false },
    startedAt: ctx.now,
  };
}

/** Stop the running clock at `now`, for a game that just ended. */
function stopped(clock: MatchClock, now: number): MatchClock {
  if (!clock.running) return clock;
  return { ...clock, [clock.running]: timeLeft(clock, clock.running, now), running: null, since: now };
}

function finish(match: Match, result: GameResult, now: number): Match {
  return { ...match, result, drawOffer: null, clock: stopped(match.clock, now) };
}

type Handler = (data: Record<string, unknown>, state: SharedState, ctx: DecideContext) => Decision;

const HANDLERS: Record<string, Handler> = {
  /** Post an open challenge anyone else in the room can accept. */
  challenge(data, state, ctx) {
    if (state.match && !state.match.result) throw new Refused("A game is already being played.");
    const color = data.color === "w" || data.color === "b" ? data.color : "random";
    const challenge: Challenge = { id: newId(ctx), by: ctx.from, tc: asTimeControl(data.tc), color, at: ctx.now };
    return { patch: { challenge }, result: challenge.id };
  },

  cancel(_data, state, ctx) {
    if (!state.challenge || state.challenge.by !== ctx.from) return {};
    return { patch: { challenge: null } };
  },

  accept(data, state, ctx) {
    const challenge = state.challenge;
    if (!challenge || challenge.id !== data.challengeId) throw new Refused("That challenge was withdrawn.");
    if (challenge.by === ctx.from) throw new Refused("You cannot accept your own challenge.");
    if (state.match && !state.match.result) throw new Refused("A game is already being played.");
    if (!person(ctx.roster, challenge.by).connected) throw new Refused("The challenger has left.");
    const challengerColor: PieceColor = challenge.color === "random" ? (ctx.random() < 0.5 ? "w" : "b") : challenge.color;
    const players = challengerColor === "w" ? { w: challenge.by, b: ctx.from } : { w: ctx.from, b: challenge.by };
    const match = startMatch(players, challenge.tc, ctx);
    return { patch: { challenge: null, match }, result: match.id };
  },

  move(data, state, ctx) {
    const match = activeMatch(state, data.matchId);
    if (match.result) throw new Refused("The game is over.");
    const color = colorOf(match, ctx.from);
    if (!color) throw new Refused("Only the two players can move.");
    if (data.ply !== match.moves.length) throw new Refused("That move is out of date.");
    const chess = replay(match);
    if (chess.turn() !== color) throw new Refused("It is not your move.");

    const unlimited = isUnlimitedTc(match.tc);
    // A move that arrives after the flag fell loses on time instead.
    if (!unlimited && match.clock.running === color && timeLeft(match.clock, color, ctx.now) <= 0) {
      const winner = canMate(chess, other(color)) ? other(color) : null;
      return { patch: { match: finish(match, { winner, reason: "timeout" }, ctx.now) }, result: "timeout" };
    }

    const uci = String(data.uci ?? "");
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) throw new Refused("Illegal move.");
    try {
      chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    } catch {
      throw new Refused("Illegal move.");
    }

    let clock = match.clock;
    if (!unlimited) {
      // The clock starts with White's first move (Black's clock runs first), like on a chess site.
      clock = clock.running === color
        ? { ...clock, [color]: timeLeft(clock, color, ctx.now) + match.tc.increment * 1000, running: other(color), since: ctx.now }
        : { ...clock, running: other(color), since: ctx.now };
    }
    // A move declines a draw the opponent offered; the mover's own offer stands.
    const drawOffer = match.drawOffer === color ? color : null;
    const next: Match = { ...match, moves: [...match.moves, uci], clock, drawOffer };
    const result = positionResult(chess);
    return { patch: { match: result ? finish(next, result, ctx.now) : next }, result: "ok" };
  },

  resign(data, state, ctx) {
    const match = activeMatch(state, data.matchId);
    const color = colorOf(match, ctx.from);
    if (!color || match.result) return {};
    return { patch: { match: finish(match, { winner: other(color), reason: "resignation" }, ctx.now) } };
  },

  /** Offer a draw, or accept the one the opponent offered. */
  draw(data, state, ctx) {
    const match = activeMatch(state, data.matchId);
    const color = colorOf(match, ctx.from);
    if (!color || match.result) return {};
    if (match.drawOffer === other(color)) {
      return { patch: { match: finish(match, { winner: null, reason: "draw_agreement" }, ctx.now) }, result: "agreed" };
    }
    return { patch: { match: { ...match, drawOffer: color } }, result: "offered" };
  },

  decline(data, state, ctx) {
    const match = activeMatch(state, data.matchId);
    const color = colorOf(match, ctx.from);
    if (!color || match.result || match.drawOffer !== other(color)) return {};
    return { patch: { match: { ...match, drawOffer: null } } };
  },

  /** Anyone may point out a fallen flag; the host checks it on its own clock. */
  flag(data, state, ctx) {
    const match = activeMatch(state, data.matchId);
    if (match.result || isUnlimitedTc(match.tc) || !match.clock.running) return {};
    const side = match.clock.running;
    if (timeLeft(match.clock, side, ctx.now) > 0) return {};
    const winner = canMate(replay(match), other(side)) ? other(side) : null;
    return { patch: { match: finish(match, { winner, reason: "timeout" }, ctx.now) } };
  },

  /** Claim the game when the opponent has left the room. */
  abandon(data, state, ctx) {
    const match = activeMatch(state, data.matchId);
    const color = colorOf(match, ctx.from);
    if (!color || match.result) return {};
    if (person(ctx.roster, match.players[other(color)]).connected) throw new Refused("Your opponent is still here.");
    return { patch: { match: finish(match, { winner: color, reason: "abandoned" }, ctx.now) } };
  },

  /** After the end: ask to play again; when both ask, colours swap and a new game starts. */
  rematch(data, state, ctx) {
    const match = activeMatch(state, data.matchId);
    const color = colorOf(match, ctx.from);
    if (!color || !match.result) return {};
    const rematch = { ...match.rematch, [color]: true };
    if (!rematch.w || !rematch.b) return { patch: { match: { ...match, rematch } } };
    const next = startMatch({ w: match.players.b, b: match.players.w }, match.tc, ctx);
    return { patch: { match: next, challenge: null }, result: next.id };
  },
};

export const COMMANDS = Object.keys(HANDLERS);

/** The host's ruling on one command. Throws `Refused` for a move the rules do not allow. */
export function decide(kind: string, data: unknown, state: SharedState, ctx: DecideContext): Decision {
  const handler = HANDLERS[kind];
  if (!handler) throw new Refused(`Unknown command: ${kind}`);
  const current: SharedState = { ...INITIAL_STATE, ...state };
  return handler((data && typeof data === "object" ? data : {}) as Record<string, unknown>, current, ctx);
}
