/**
 * Multiplayer: tables in the activity's room. Anyone can host a table (time control and colour);
 * anyone else joins it to play, and everyone can watch any table, so several games run at once.
 * Shared through Stellarr's host-authoritative state: players submit commands, the elected host
 * checks them against the rules here and commits the result. Every client registers the same
 * rules, so whoever becomes host after a disconnect carries on from the shared state alone (the
 * moves, never a local board). "Host" in the rules below is the table's host, a player; the
 * session's elected host only referees.
 *
 * Pure functions only: no SDK, no stores. Times are milliseconds of the session clock
 * (`session.now()`); time controls are in seconds, as everywhere else in the app.
 */

import { Chess } from "chess.js";
import type { GameResult, PieceColor, TimeControl } from "@/engine/types";
import { STANDARD_FEN } from "@/engine/positions";

export type ColorChoice = PieceColor | "random";

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
  /** Both players' Stellarr Elo when the game started. */
  ratings: Record<PieceColor, number>;
  /** How each rating moved when the game ended (null while it goes on). */
  ratingChange: Record<PieceColor, number> | null;
}

/** A table: its host's settings, and the game played at it once someone joins. */
export interface Table {
  id: string;
  /** Participant who opened the table. */
  host: string;
  hostName: string;
  hostAvatar: string | null;
  tc: TimeControl;
  /** The colour the host wants. */
  color: ColorChoice;
  createdAt: number;
  /** Null while the table waits for an opponent. */
  match: Match | null;
}

/**
 * A player's card in this session: their Stellarr Elo and record, published from their own saved
 * progress when they arrive and updated by the referee after each game.
 */
export interface Profile {
  name: string;
  avatar: string | null;
  elo: number;
  peak: number;
  /** Rated games played. */
  games: number;
  w: number;
  d: number;
  l: number;
  at: number;
}

/** A finished game, for the session's results. */
export interface ResultEntry {
  id: string;
  names: Record<PieceColor, string>;
  players: Record<PieceColor, string>;
  result: GameResult;
  change: Record<PieceColor, number>;
  at: number;
}

export interface SharedState {
  [key: string]: unknown;
  v: 2;
  tables: Table[];
  profiles: Record<string, Profile>;
  results: ResultEntry[];
}

export const INITIAL_STATE: SharedState = { v: 2, tables: [], profiles: {}, results: [] };

/** Stellarr Elo: where everyone starts, and how far one game moves it. */
export const START_ELO = 1200;
export const ELO_K = 32;
const MAX_RESULTS = 30;
const MAX_PROFILES = 60;

/** The rating change of a finished game for White and Black (zero-sum, rounded). */
export function eloChange(ratings: Record<PieceColor, number>, result: GameResult): Record<PieceColor, number> {
  const expected = 1 / (1 + 10 ** ((ratings.b - ratings.w) / 400));
  const scored = result.winner === "w" ? 1 : result.winner === "b" ? 0 : 0.5;
  const w = Math.round(ELO_K * (scored - expected));
  // `0 - 0` keeps a level draw at 0 rather than -0.
  return { w, b: 0 - w };
}

/** At most this many tables at once; empty tables of people who left make room first. */
export const MAX_TABLES = 12;

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

function findTable(state: SharedState, tableId: unknown): Table {
  const table = state.tables.find((item) => item.id === tableId);
  if (!table) throw new Refused("That table was closed.");
  return table;
}

function tableMatch(state: SharedState, data: Record<string, unknown>): { table: Table; match: Match } {
  const table = findTable(state, data.tableId);
  const match = table.match;
  if (!match || match.id !== data.matchId) throw new Refused("That game is no longer on the table.");
  return { table, match };
}

/** The shared state with one table replaced (or removed, for null). */
function withTable(state: SharedState, id: string, next: Table | null): Partial<SharedState> {
  return { tables: next ? state.tables.map((table) => (table.id === id ? next : table)) : state.tables.filter((table) => table.id !== id) };
}

/** Whether someone is in a game still being played, at any table. */
function playing(state: SharedState, id: string): boolean {
  return state.tables.some((table) => table.match && !table.match.result && colorOf(table.match, id) !== null);
}

/**
 * Tables nobody will come back to: empty ones whose host left, and finished games both players
 * left. A participant's own empty tables go too when they host or join another.
 */
function tidy(tables: Table[], ctx: DecideContext, drop: string | null): Table[] {
  const here = (id: string) => person(ctx.roster, id).connected;
  return tables.filter((table) => {
    if (!table.match) return here(table.host) && table.host !== drop;
    if (!table.match.result) return true;
    return here(table.match.players.w) || here(table.match.players.b);
  });
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

function startMatch(players: Record<PieceColor, string>, tc: TimeControl, ctx: DecideContext, state: SharedState): Match {
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
    ratings: { w: state.profiles[players.w]?.elo ?? START_ELO, b: state.profiles[players.b]?.elo ?? START_ELO },
    ratingChange: null,
  };
}

/** Stop the running clock at `now`, for a game that just ended. */
function stopped(clock: MatchClock, now: number): MatchClock {
  if (!clock.running) return clock;
  return { ...clock, [clock.running]: timeLeft(clock, clock.running, now), running: null, since: now };
}

/**
 * End a table's game: the result, the clock stopped, both ratings moved, the game added to the
 * session's results and both players' cards updated.
 */
function endGame(state: SharedState, table: Table, match: Match, result: GameResult, now: number): Partial<SharedState> {
  const ratings = match.ratings ?? { w: START_ELO, b: START_ELO };
  const change = eloChange(ratings, result);
  const ended: Match = { ...match, result, drawOffer: null, clock: stopped(match.clock, now), ratingChange: change };
  const profiles = { ...state.profiles };
  for (const color of ["w", "b"] as const) {
    const id = match.players[color];
    const before = profiles[id] ?? { name: match.names[color], avatar: match.avatars[color], elo: ratings[color], peak: ratings[color], games: 0, w: 0, d: 0, l: 0, at: now };
    const elo = before.elo + change[color];
    const outcome = result.winner === null ? "d" : result.winner === color ? "w" : "l";
    profiles[id] = { ...before, name: match.names[color], avatar: match.avatars[color], elo, peak: Math.max(before.peak, elo), games: before.games + 1, [outcome]: before[outcome] + 1, at: now };
  }
  const entry: ResultEntry = { id: match.id, names: match.names, players: match.players, result, change, at: now };
  return {
    tables: state.tables.map((item) => (item.id === table.id ? { ...table, match: ended } : item)),
    results: [entry, ...state.results.filter((item) => item.id !== match.id)].slice(0, MAX_RESULTS),
    profiles,
  };
}

type Handler = (data: Record<string, unknown>, state: SharedState, ctx: DecideContext) => Decision;

const HANDLERS: Record<string, Handler> = {
  /** Publish your Stellarr Elo and record (from your saved progress) on arrival. */
  profile(data, state, ctx) {
    const int = (value: unknown, min: number, max: number) => {
      const n = Number(value);
      if (!Number.isInteger(n) || n < min || n > max) throw new Refused("Invalid profile.");
      return n;
    };
    const me = person(ctx.roster, ctx.from);
    const elo = int(data.elo, 100, 4000);
    const card: Profile = {
      name: me.name,
      avatar: me.avatar,
      elo,
      peak: Math.max(elo, int(data.peak ?? elo, 100, 4000)),
      games: int(data.games ?? 0, 0, 1_000_000),
      w: int(data.w ?? 0, 0, 1_000_000),
      d: int(data.d ?? 0, 0, 1_000_000),
      l: int(data.l ?? 0, 0, 1_000_000),
      at: ctx.now,
    };
    // The newest cards are kept when the session has seen many people.
    const entries = Object.entries({ ...state.profiles, [ctx.from]: card }).sort((a, b) => b[1].at - a[1].at).slice(0, MAX_PROFILES);
    return { patch: { profiles: Object.fromEntries(entries) } };
  },

  /** Open a table with a time control and a colour; anyone else can join it. */
  host(data, state, ctx) {
    if (playing(state, ctx.from)) throw new Refused("Finish your game first.");
    const tables = tidy(state.tables, ctx, ctx.from).filter((table) => !(table.host === ctx.from && table.match?.result));
    if (tables.length >= MAX_TABLES) throw new Refused("All tables are taken.");
    const me = person(ctx.roster, ctx.from);
    const table: Table = {
      id: newId(ctx),
      host: ctx.from,
      hostName: me.name,
      hostAvatar: me.avatar,
      tc: asTimeControl(data.tc),
      color: data.color === "w" || data.color === "b" ? data.color : "random",
      createdAt: ctx.now,
      match: null,
    };
    return { patch: { tables: [...tables, table] }, result: table.id };
  },

  /** The host closes a table that is empty or whose game is over. */
  close(data, state, ctx) {
    const table = state.tables.find((item) => item.id === data.tableId);
    if (!table || table.host !== ctx.from) return {};
    if (table.match && !table.match.result) throw new Refused("A game is being played at this table.");
    return { patch: withTable(state, table.id, null) };
  },

  /** Sit down at someone's empty table: the game starts. */
  join(data, state, ctx) {
    const table = findTable(state, data.tableId);
    if (table.host === ctx.from) throw new Refused("This is your own table.");
    if (table.match && !table.match.result) throw new Refused("Someone already sat down at this table.");
    if (table.match) throw new Refused("That game is over.");
    if (playing(state, ctx.from)) throw new Refused("Finish your game first.");
    if (!person(ctx.roster, table.host).connected) throw new Refused("The host has left.");
    const hostColor: PieceColor = table.color === "random" ? (ctx.random() < 0.5 ? "w" : "b") : table.color;
    const players = hostColor === "w" ? { w: table.host, b: ctx.from } : { w: ctx.from, b: table.host };
    const match = startMatch(players, table.tc, ctx, state);
    // Joining closes the empty tables the player had opened.
    const tables = tidy(state.tables, ctx, ctx.from).map((item) => (item.id === table.id ? { ...table, match } : item));
    return { patch: { tables }, result: match.id };
  },

  /** A player gets up after the game: the table closes (no rematch after that; anyone can host again). */
  leave(data, state, ctx) {
    const table = state.tables.find((item) => item.id === data.tableId);
    const match = table?.match;
    if (!table || !match || !match.result || colorOf(match, ctx.from) === null) return {};
    return { patch: withTable(state, table.id, null) };
  },

  move(data, state, ctx) {
    const { table, match } = tableMatch(state, data);
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
      return { patch: endGame(state, table, match, { winner, reason: "timeout" }, ctx.now), result: "timeout" };
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
    return { patch: result ? endGame(state, table, next, result, ctx.now) : withTable(state, table.id, { ...table, match: next }), result: "ok" };
  },

  resign(data, state, ctx) {
    const { table, match } = tableMatch(state, data);
    const color = colorOf(match, ctx.from);
    if (!color || match.result) return {};
    return { patch: endGame(state, table, match, { winner: other(color), reason: "resignation" }, ctx.now) };
  },

  /** Offer a draw, or accept the one the opponent offered. */
  draw(data, state, ctx) {
    const { table, match } = tableMatch(state, data);
    const color = colorOf(match, ctx.from);
    if (!color || match.result) return {};
    if (match.drawOffer === other(color)) {
      return { patch: endGame(state, table, match, { winner: null, reason: "draw_agreement" }, ctx.now), result: "agreed" };
    }
    return { patch: withTable(state, table.id, { ...table, match: { ...match, drawOffer: color } }), result: "offered" };
  },

  decline(data, state, ctx) {
    const { table, match } = tableMatch(state, data);
    const color = colorOf(match, ctx.from);
    if (!color || match.result || match.drawOffer !== other(color)) return {};
    return { patch: withTable(state, table.id, { ...table, match: { ...match, drawOffer: null } }) };
  },

  /** Anyone may point out a fallen flag; the referee checks it on its own clock. */
  flag(data, state, ctx) {
    const { table, match } = tableMatch(state, data);
    if (match.result || isUnlimitedTc(match.tc) || !match.clock.running) return {};
    const side = match.clock.running;
    if (timeLeft(match.clock, side, ctx.now) > 0) return {};
    const winner = canMate(replay(match), other(side)) ? other(side) : null;
    return { patch: endGame(state, table, match, { winner, reason: "timeout" }, ctx.now) };
  },

  /** Claim the game when the opponent has left the activity. */
  abandon(data, state, ctx) {
    const { table, match } = tableMatch(state, data);
    const color = colorOf(match, ctx.from);
    if (!color || match.result) return {};
    if (person(ctx.roster, match.players[other(color)]).connected) throw new Refused("Your opponent is still here.");
    return { patch: endGame(state, table, match, { winner: color, reason: "abandoned" }, ctx.now) };
  },

  /** After the end: ask to play again; when both ask, colours swap and a new game starts at the same table. */
  rematch(data, state, ctx) {
    const { table, match } = tableMatch(state, data);
    const color = colorOf(match, ctx.from);
    if (!color || !match.result) return {};
    const rematch = { ...match.rematch, [color]: true };
    if (!rematch.w || !rematch.b) return { patch: withTable(state, table.id, { ...table, match: { ...match, rematch } }) };
    const next = startMatch({ w: match.players.b, b: match.players.w }, match.tc, ctx, state);
    return { patch: withTable(state, table.id, { ...table, match: next }), result: next.id };
  },
};

export const COMMANDS = Object.keys(HANDLERS);

/** The host's ruling on one command. Throws `Refused` for a move the rules do not allow. */
export function decide(kind: string, data: unknown, state: SharedState, ctx: DecideContext): Decision {
  const handler = HANDLERS[kind];
  if (!handler) throw new Refused(`Unknown command: ${kind}`);
  // A room left from the one-board version has no tables yet.
  const current: SharedState = {
    ...INITIAL_STATE,
    ...state,
    tables: Array.isArray(state?.tables) ? state.tables : [],
    profiles: state?.profiles && typeof state.profiles === "object" ? state.profiles : {},
    results: Array.isArray(state?.results) ? state.results : [],
  };
  return handler((data && typeof data === "object" ? data : {}) as Record<string, unknown>, current, ctx);
}
