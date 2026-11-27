/**
 * The host's decisions, as pure functions of the public state, the players' private
 * assignments and a few live room facts. The room layer only routes commands here, so any
 * player who becomes host decides exactly the same way.
 */
import { pick, rng, shuffle } from "./random.ts";
import { fillTopic, namesSomeone, poolFor } from "./topics.ts";
import {
  CAPTION_MAX,
  emptyStats,
  initialState,
  MAX_PLAYERS,
  MIN_PLAYERS,
  MODES,
  PACKS,
  ROUND_OPTIONS,
  SEARCH_OPTIONS,
  type Assignment,
  type GameState,
  type GifRef,
  type Highlight,
  type Meme,
  type Player,
  type RoundResult,
  type Settings,
  type Stats,
  type Topic,
} from "./types.ts";

export const TOPIC_MS = 12_000;
export const REVEAL_INTRO_MS = 1_500;
export const REVEAL_EACH_MS = 5_000;
export const VOTE_MS = 20_000;
export const RESULTS_MS = 10_000;
/** How late a send or a vote may arrive after the deadline and still count. */
export const GRACE_MS = 1_500;
/** Reżyser: points for the meme the director picks. */
export const DIRECTOR_POINTS = 3;

/**
 * A refused command. Its message is a code (`ownMeme`, `searchOver`, …) that the sender's
 * screen turns into a sentence in their own language.
 */
export class Refusal extends Error {}

const refuse = (message: string): never => {
  throw new Refusal(message);
};

export interface Decision {
  patch?: Partial<GameState>;
  /** Only ever the sender's own assignment: the room refuses decisions for absent players. */
  assignments?: Record<string, Assignment>;
  result?: string;
}

/** Live facts about the room that the host reads when deciding. */
export interface Room {
  now: number;
  /** Ids of the participants connected right now. */
  connected: string[];
}

export type Assignments = Record<string, unknown>;

const unique = (ids: string[]) => [...new Set(ids)];

export const isPlayer = (state: GameState, id: string) => !!state.match?.players.some((p) => p.id === id);

/** Players of the match who are in the room now. */
export const activePlayers = (state: GameState, connected: string[]) =>
  (state.match?.players ?? []).filter((p) => connected.includes(p.id)).map((p) => p.id);

export const directing = (state: GameState) => state.settings.mode === "rezyser";

/** Reżyser: players take turns in match order; someone who isn't in the room is skipped. */
export function directorFor(players: Player[], round: number, connected: string[] | null): string | null {
  for (let i = 0; i < players.length; i++) {
    const p = players[(round + i) % players.length];
    if (!connected || connected.includes(p.id)) return p.id;
  }
  return players.length ? players[round % players.length].id : null;
}

/** Players who search this round: everyone in the room, except the director in Reżyser. */
export const searchers = (state: GameState, connected: string[]) =>
  activePlayers(state, connected).filter((id) => !(directing(state) && id === state.director));

export const captioning = (state: GameState) => state.settings.mode === "napisy";

/** The assignment, if it belongs to this match and round. Older ones are ignored, never cleared. */
export function liveAssignment(value: unknown, state: GameState): Assignment | null {
  if (!value || typeof value !== "object" || !state.match) return null;
  const a = value as Partial<Assignment>;
  if (a.match !== state.match.id || a.round !== state.round) return null;
  return {
    match: a.match,
    round: a.round,
    gif: a.gif && typeof a.gif === "object" ? (a.gif as GifRef) : null,
    caption: typeof a.caption === "string" && a.caption ? a.caption : null,
    sentMs: typeof a.sentMs === "number" ? a.sentMs : null,
    vote: typeof a.vote === "string" ? a.vote : null,
  };
}

/** Napisy: a caption as the room keeps it, or a refusal. */
export function cleanCaption(input: unknown): string {
  const text = typeof input === "string" ? input.replace(/\s+/g, " ").trim() : "";
  if (!text) return refuse("emptyCaption");
  return [...text].slice(0, CAPTION_MAX).join("");
}

/** A fresh round's mode-specific parts: the topics (or nothing in Napisy) and the director. */
function roundStart(state: GameState, matchId: string, round: number, players: Player[], used: string[], connected: string[] | null) {
  const napisy = state.settings.mode === "napisy";
  const draw = napisy ? { choices: [], used } : drawChoices(matchId, round, state.settings, used, players);
  return {
    choices: draw.choices,
    used: draw.used,
    director: state.settings.mode === "rezyser" ? directorFor(players, round, connected) : null,
    gifChoices: [],
    roundGif: null,
  };
}

// ---------------------------------------------------------------- settings and start

export function cleanSettings(input: unknown, current: Settings): Settings {
  const raw = (input && typeof input === "object" ? input : {}) as Partial<Settings>;
  const mode = MODES.find((m) => m.id === raw.mode && m.ready)?.id ?? current.mode;
  const rounds = (ROUND_OPTIONS as readonly number[]).includes(Number(raw.rounds)) ? Number(raw.rounds) : current.rounds;
  const searchSeconds = (SEARCH_OPTIONS as readonly number[]).includes(Number(raw.searchSeconds)) ? Number(raw.searchSeconds) : current.searchSeconds;
  const pack = PACKS.find((p) => p.id === raw.pack)?.id ?? current.pack;
  const names = typeof raw.names === "boolean" ? raw.names : current.names;
  return { mode, rounds, searchSeconds, pack, names };
}

export function updateSettings(state: GameState, input: unknown, fromHost: boolean): Decision {
  if (state.phase !== "lobby" && state.phase !== "final") refuse("settingsLocked");
  if (!fromHost) refuse("hostOnlySettings");
  return { patch: { settings: cleanSettings(input, state.settings) }, result: "ok" };
}

/** Two topics to vote on, drawn from the pack without repeats until it runs out. */
export function drawChoices(matchId: string, round: number, settings: Settings, used: string[], players: Player[]) {
  const random = rng(`${matchId}:${round}:topics`);
  const names = settings.names && players.length > 0;
  let pool = poolFor(settings.pack, names).filter((t) => !used.includes(t.id));
  let kept = used;
  if (pool.length < 2) {
    pool = poolFor(settings.pack, names);
    kept = [];
  }
  const picked = shuffle(pool, random).slice(0, 2);
  const people = shuffle(players.map((p) => p.name), random);
  let next = 0;
  const choices: Topic[] = picked.map((t) => ({ id: t.id, ...fillTopic(t, namesSomeone(t) ? people[next++ % people.length] : null) }));
  return { choices, used: [...kept, ...picked.map((t) => t.id)] };
}

export function startMatch(state: GameState, players: Player[], matchId: string, now: number, fromHost: boolean): Decision {
  if (state.phase !== "lobby" && state.phase !== "final") refuse("alreadyPlaying");
  if (!fromHost) refuse("hostOnlyStart");
  const roster = players.slice(0, MAX_PLAYERS);
  if (roster.length < MIN_PLAYERS) refuse("notEnoughPlayers");
  return {
    patch: {
      phase: "topic",
      match: { id: matchId, players: roster, startedAt: now },
      round: 0,
      startsAt: now,
      endsAt: now + TOPIC_MS,
      ...roundStart(state, matchId, 0, roster, [], null),
      topicVotes: {},
      topic: null,
      done: [],
      memes: [],
      result: null,
      scores: Object.fromEntries(roster.map((p) => [p.id, 0])),
      highlights: [],
      stats: emptyStats(),
    },
    result: "started",
  };
}

export function toLobby(state: GameState, fromHost: boolean): Decision {
  if (!fromHost) refuse("hostOnlyLobby");
  return { patch: { ...initialState(), settings: state.settings }, result: "ok" };
}

/**
 * The host ends the match early: straight to the final screen with the scores as they are.
 * A round that hasn't reached its results doesn't count.
 */
export function endMatch(state: GameState, fromHost: boolean, now: number): Decision {
  if (!state.match || state.phase === "lobby" || state.phase === "final") refuse("notPlaying");
  if (!fromHost) refuse("hostOnlyEnd");
  const played = state.phase === "results" ? state.round + 1 : state.round;
  return { patch: { phase: "final", played, startsAt: now, endsAt: 0, done: [] }, result: "ended" };
}

// ---------------------------------------------------------------- topic

const everyoneIn = (state: GameState, connected: string[], ids: string[]) => {
  const active = activePlayers(state, connected);
  return active.length > 0 && active.every((id) => ids.includes(id));
};

export function voteTopic(state: GameState, from: string, choice: unknown, room: Room): Decision {
  if (state.phase !== "topic") refuse("topicClosed");
  if (!isPlayer(state, from)) refuse("spectator");
  const index = Number(choice);
  const count = captioning(state) ? state.gifChoices.length : state.choices.length;
  if (!Number.isInteger(index) || index < 0 || index >= count) refuse("noSuchTopic");
  if (directing(state) && from !== state.director) refuse("directorPicksTopic");
  const topicVotes = { ...state.topicVotes, [from]: index };
  if (directing(state) || everyoneIn(state, room.connected, Object.keys(topicVotes))) {
    return { patch: { topicVotes, ...closeTopic({ ...state, topicVotes }, room.now).patch }, result: "ok" };
  }
  return { patch: { topicVotes }, result: "ok" };
}

export function closeTopic(state: GameState, now: number): Decision {
  const options = captioning(state) ? state.gifChoices : state.choices;
  if (options.length === 0) {
    // Napisy without GIFs to choose from (the host's search failed): the round is empty.
    const missing = (state.match?.players ?? []).map((p) => p.id);
    return { patch: { phase: "results", memes: [], result: { authors: {}, votes: {}, points: {}, winners: [], missing }, startsAt: now, endsAt: now + RESULTS_MS, done: [] } };
  }
  const counts = options.map((_, i) => Object.values(state.topicVotes).filter((v) => v === i).length);
  const top = Math.max(0, ...counts);
  const leaders = counts.map((c, i) => (c === top ? i : -1)).filter((i) => i >= 0);
  const chosen = leaders.length === 1 ? leaders[0] : pick(leaders, rng(`${state.match?.id}:${state.round}:topic-tie`));
  return {
    patch: {
      phase: "search",
      topic: captioning(state) ? null : state.choices[chosen] ?? state.choices[0] ?? null,
      roundGif: captioning(state) ? state.gifChoices[chosen] : null,
      startsAt: now,
      endsAt: now + state.settings.searchSeconds * 1000,
      done: [],
    },
  };
}

// ---------------------------------------------------------------- search

const GIF_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function cleanGif(input: unknown): GifRef {
  const raw = (input && typeof input === "object" ? input : {}) as Partial<GifRef>;
  if (typeof raw.id !== "string" || !GIF_ID.test(raw.id)) return refuse("notAGif");
  const size = (n: unknown) => (Number.isInteger(n) && (n as number) > 0 && (n as number) <= 4096 ? (n as number) : 0);
  const w = size(raw.w);
  const h = size(raw.h);
  if (!w || !h) return refuse("notAGif");
  const alt = typeof raw.alt === "string" && raw.alt.trim() ? [...raw.alt.trim()].slice(0, 120).join("") : undefined;
  return alt ? { id: raw.id, w, h, alt } : { id: raw.id, w, h };
}

export function submitGif(state: GameState, from: string, input: unknown, room: Room, assignments: Assignments): Decision {
  if (state.phase !== "search" || !state.match) refuse("searchOver");
  if (!isPlayer(state, from)) refuse("spectator");
  if (room.now > state.endsAt + GRACE_MS) refuse("searchOver");
  if (directing(state) && from === state.director) refuse("directorDoesntSearch");
  if (captioning(state)) refuse("captionsOnly");
  const gif = cleanGif(input);
  const mine: Assignment = { match: state.match!.id, round: state.round, gif, sentMs: Math.max(0, room.now - state.startsAt), vote: null };
  return handIn(state, from, mine, room, assignments);
}

/** Napisy: a player's caption for the round's GIF. */
export function submitCaption(state: GameState, from: string, input: unknown, room: Room, assignments: Assignments): Decision {
  if (state.phase !== "search" || !state.match || !captioning(state)) refuse("writingOver");
  if (!isPlayer(state, from)) refuse("spectator");
  if (room.now > state.endsAt + GRACE_MS) refuse("writingOver");
  const caption = cleanCaption(input);
  const mine: Assignment = { match: state.match!.id, round: state.round, gif: null, caption, sentMs: Math.max(0, room.now - state.startsAt), vote: null };
  return handIn(state, from, mine, room, assignments);
}

/** Records a GIF or a caption, and ends the search once everyone who searches handed in. */
function handIn(state: GameState, from: string, mine: Assignment, room: Room, assignments: Assignments): Decision {
  const done = unique([...state.done, from]);
  const need = searchers(state, room.connected);
  if (need.length > 0 && need.every((id) => done.includes(id))) {
    const merged = { ...assignments, [from]: mine };
    return { patch: { done, ...closeSearch({ ...state, done }, room.now, merged).patch }, assignments: { [from]: mine }, result: "sent" };
  }
  return { patch: { done }, assignments: { [from]: mine }, result: "sent" };
}

/** Napisy: the host offers the GIFs to vote on at the start of a round. */
export function offerGifs(state: GameState, input: unknown, fromHost: boolean): Decision {
  if (state.phase !== "topic" || !captioning(state)) return { result: "stale" };
  if (!fromHost) refuse("hostOnlyGifs");
  if (state.gifChoices.length > 0) return { result: "stale" };
  const list = Array.isArray(input) ? input.slice(0, 2) : [];
  const gifChoices = list.map(cleanGif);
  if (gifChoices.length === 0) refuse("noGifs");
  return { patch: { gifChoices }, result: "ok" };
}

/** This round's GIFs (or, in Napisy, captions under the round's GIF) in match order, with their authors. */
export function submissions(state: GameState, assignments: Assignments) {
  const out: { player: string; gif: GifRef; caption?: string; sentMs: number | null }[] = [];
  for (const p of state.match?.players ?? []) {
    const a = liveAssignment(assignments[p.id], state);
    if (captioning(state)) {
      if (a?.caption && state.roundGif) out.push({ player: p.id, gif: state.roundGif, caption: a.caption, sentMs: a.sentMs });
    } else if (a?.gif) {
      out.push({ player: p.id, gif: a.gif, sentMs: a.sentMs });
    }
  }
  return out;
}

/**
 * The reveal order and who made what. The seed includes each sender's private send time, so the
 * host (any host, from the assignments) gets the same order, but players who only see the
 * public state can't work out who made which meme.
 */
export function memeOrder(state: GameState, assignments: Assignments): { memes: Meme[]; authors: Record<string, string> } {
  const subs = submissions(state, assignments);
  const secret = subs.map((s) => `${s.player}:${s.sentMs}`).join(",");
  const order = shuffle(subs, rng(`${state.match?.id}:${state.round}:reveal:${secret}`));
  const memes: Meme[] = [];
  const authors: Record<string, string> = {};
  order.forEach((s, i) => {
    const key = `r${state.round}m${i}`;
    memes.push(s.caption ? { key, gif: s.gif, caption: s.caption } : { key, gif: s.gif });
    authors[key] = s.player;
  });
  return { memes, authors };
}

export const revealMs = (count: number) => REVEAL_INTRO_MS + count * REVEAL_EACH_MS;

export function closeSearch(state: GameState, now: number, assignments: Assignments): Decision {
  const { memes } = memeOrder(state, assignments);
  if (memes.length === 0) {
    const missing = (state.match?.players ?? []).map((p) => p.id);
    return {
      patch: {
        phase: "results",
        memes: [],
        result: { authors: {}, votes: {}, points: {}, winners: [], missing },
        startsAt: now,
        endsAt: now + RESULTS_MS,
        done: [],
      },
    };
  }
  return { patch: { phase: "reveal", memes, startsAt: now, endsAt: now + revealMs(memes.length), done: [] } };
}

// ---------------------------------------------------------------- reveal and vote

export function closeReveal(_state: GameState, now: number): Decision {
  return { patch: { phase: "vote", startsAt: now, endsAt: now + VOTE_MS, done: [] } };
}

/** Players in the room who have at least one meme that is not their own. */
export function voters(state: GameState, connected: string[], assignments: Assignments) {
  const { authors } = memeOrder(state, assignments);
  const makers = Object.values(authors);
  const can = activePlayers(state, connected).filter((id) => makers.some((m) => m !== id));
  return directing(state) ? can.filter((id) => id === state.director) : can;
}

export function castVote(state: GameState, from: string, key: unknown, room: Room, assignments: Assignments): Decision {
  if (state.phase !== "vote" || !state.match) refuse("voteOver");
  if (!isPlayer(state, from)) refuse("spectator");
  if (room.now > state.endsAt + GRACE_MS) refuse("voteOver");
  if (directing(state) && from !== state.director) refuse("directorPicksWinner");
  const { authors } = memeOrder(state, assignments);
  if (typeof key !== "string" || !(key in authors)) refuse("noSuchMeme");
  if (authors[key as string] === from) refuse("ownMeme");
  const own = liveAssignment(assignments[from], state) ?? { match: state.match!.id, round: state.round, gif: null, sentMs: null, vote: null };
  const mine: Assignment = { ...own, vote: key as string };
  const done = unique([...state.done, from]);
  const merged = { ...assignments, [from]: mine };
  const needed = voters(state, room.connected, merged);
  if (needed.length > 0 && needed.every((id) => done.includes(id))) {
    return { patch: { done, ...closeVote({ ...state, done }, room.now, merged).patch }, assignments: { [from]: mine }, result: "voted" };
  }
  return { patch: { done }, assignments: { [from]: mine }, result: "voted" };
}

export function tally(state: GameState, assignments: Assignments): RoundResult {
  const { authors } = memeOrder(state, assignments);
  const players = (state.match?.players ?? []).map((p) => p.id);
  const votes: Record<string, string[]> = Object.fromEntries(Object.keys(authors).map((k) => [k, []]));
  for (const id of players) {
    if (directing(state) && id !== state.director) continue;
    const vote = liveAssignment(assignments[id], state)?.vote;
    if (vote && vote in authors && authors[vote] !== id) votes[vote].push(id);
  }
  const points: Record<string, number> = Object.fromEntries(players.map((id) => [id, 0]));
  for (const [key, who] of Object.entries(votes)) {
    points[authors[key]] += directing(state) ? (who.length > 0 ? DIRECTOR_POINTS : 0) : who.length;
  }
  const top = Math.max(0, ...Object.values(votes).map((v) => v.length));
  const winners = top > 0 ? Object.keys(votes).filter((k) => votes[k].length === top).map((k) => authors[k]) : [];
  const makers = new Set(Object.values(authors));
  return { authors, votes, points, winners, missing: players.filter((id) => !makers.has(id)) };
}

function nextStats(stats: Stats, state: GameState, assignments: Assignments, result: RoundResult): Stats {
  const s: Stats = JSON.parse(JSON.stringify(stats));
  for (const sub of submissions(state, assignments)) {
    if (sub.sentMs === null) continue;
    s.sendMs[sub.player] = (s.sendMs[sub.player] ?? 0) + sub.sentMs;
    s.sends[sub.player] = (s.sends[sub.player] ?? 0) + 1;
  }
  for (const p of state.match?.players ?? []) {
    if (result.winners.includes(p.id)) {
      s.wins[p.id] = (s.wins[p.id] ?? 0) + 1;
      s.streak[p.id] = (s.streak[p.id] ?? 0) + 1;
      s.bestStreak[p.id] = Math.max(s.bestStreak[p.id] ?? 0, s.streak[p.id]);
    } else {
      s.streak[p.id] = 0;
    }
  }
  // In Reżyser one person picks, so "no votes" and "most votes" say nothing about the room.
  for (const [key, who] of directing(state) ? [] : Object.entries(result.votes)) {
    const author = result.authors[key];
    if (who.length === 0) s.silent[author] = (s.silent[author] ?? 0) + 1;
    if (!s.best || who.length > s.best.votes) s.best = { player: author, votes: who.length, round: state.round };
  }
  return s;
}

export function closeVote(state: GameState, now: number, assignments: Assignments): Decision {
  const result = tally(state, assignments);
  const scores = { ...state.scores };
  for (const [id, n] of Object.entries(result.points)) scores[id] = (scores[id] ?? 0) + n;
  const { memes } = memeOrder(state, assignments);
  const fresh: Highlight[] = [];
  for (const meme of memes) {
    const author = result.authors[meme.key];
    if (result.winners.includes(author)) {
      fresh.push({ round: state.round, topic: state.topic, gif: meme.gif, ...(meme.caption ? { caption: meme.caption } : {}), author, votes: result.votes[meme.key].length });
    }
  }
  return {
    patch: {
      phase: "results",
      result,
      scores,
      stats: nextStats(state.stats, state, assignments, result),
      highlights: [...state.highlights, ...fresh].slice(-24),
      startsAt: now,
      endsAt: now + RESULTS_MS,
    },
  };
}

// ---------------------------------------------------------------- results and the next round

export function closeResults(state: GameState, room: Room): Decision {
  const last = state.round + 1 >= state.settings.rounds;
  if (last || activePlayers(state, room.connected).length < 2 || !state.match) {
    return { patch: { phase: "final", played: state.round + 1, startsAt: room.now, endsAt: 0, done: [] } };
  }
  const round = state.round + 1;
  return {
    patch: {
      phase: "topic",
      round,
      ...roundStart(state, state.match.id, round, state.match.players, state.used, room.connected),
      topicVotes: {},
      topic: null,
      done: [],
      memes: [],
      result: null,
      startsAt: room.now,
      endsAt: room.now + TOPIC_MS,
    },
  };
}

/** Moves past a deadline. Nudges for an older phase, or before the deadline, change nothing. */
export function advance(state: GameState, data: unknown, room: Room, assignments: Assignments): Decision {
  const d = (data && typeof data === "object" ? data : {}) as { match?: string; round?: number; phase?: string };
  if (!state.match || d.match !== state.match.id || d.round !== state.round || d.phase !== state.phase) return { result: "stale" };
  if (room.now < state.endsAt) return { result: "early" };
  switch (state.phase) {
    case "topic":
      return { ...closeTopic(state, room.now), result: "ok" };
    case "search":
      return { ...closeSearch(state, room.now, assignments), result: "ok" };
    case "reveal":
      return { ...closeReveal(state, room.now), result: "ok" };
    case "vote":
      return { ...closeVote(state, room.now, assignments), result: "ok" };
    case "results":
      return { ...closeResults(state, room), result: "ok" };
    default:
      return { result: "stale" };
  }
}

// ---------------------------------------------------------------- the end

/**
 * An award as numbers: the screen writes the sentence in the reader's language. `value` is the
 * streak, the votes, the average seconds to send, or the rounds without a vote.
 */
export interface Award {
  kind: "streak" | "best" | "fast" | "quiet";
  player: string;
  value: number;
  /** For `best`: the round, counted from 1. */
  round?: number;
}

/** Awards from what really happened in the match. Each player gets at most one. */
export function awards(state: GameState): Award[] {
  const players = state.match?.players ?? [];
  const s = state.stats;
  const out: Award[] = [];
  const taken = new Set<string>();
  const best = (score: (id: string) => number, min: number) => {
    let who: string | null = null;
    let value = -Infinity;
    for (const p of players) {
      const v = score(p.id);
      if (v >= min && v > value && !taken.has(p.id)) {
        who = p.id;
        value = v;
      }
    }
    return who ? { who, value } : null;
  };
  const streak = best((id) => s.bestStreak[id] ?? 0, 2);
  if (streak) {
    taken.add(streak.who);
    out.push({ kind: "streak", player: streak.who, value: streak.value });
  }
  if (s.best && s.best.votes >= 2 && !taken.has(s.best.player)) {
    taken.add(s.best.player);
    out.push({ kind: "best", player: s.best.player, value: s.best.votes, round: s.best.round + 1 });
  }
  const fast = best((id) => ((s.sends[id] ?? 0) >= 2 ? -(s.sendMs[id] / s.sends[id]) : -Infinity), -Infinity);
  if (fast && Number.isFinite(fast.value)) {
    taken.add(fast.who);
    out.push({ kind: "fast", player: fast.who, value: Math.max(1, Math.round(-fast.value / 1000)) });
  }
  const quiet = best((id) => s.silent[id] ?? 0, 2);
  if (quiet) {
    taken.add(quiet.who);
    out.push({ kind: "quiet", player: quiet.who, value: quiet.value });
  }
  return out;
}

/** Players sorted by score; equal scores share a place. */
export function standings(state: GameState) {
  const rows = (state.match?.players ?? []).map((p) => ({ player: p, score: state.scores[p.id] ?? 0 }));
  rows.sort((a, b) => b.score - a.score);
  let place = 0;
  return rows.map((row, i) => {
    if (i === 0 || row.score !== rows[i - 1].score) place = i + 1;
    return { ...row, place };
  });
}
