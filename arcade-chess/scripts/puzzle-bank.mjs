#!/usr/bin/env node
/**
 * Builds src/data/puzzle-bank.json: verified mate-in-1 and mate-in-2 puzzles for Puzzle Rush and
 * the themed lists in the Puzzles tab.
 *
 *   node scripts/puzzle-bank.mjs
 *
 * Every position comes from seeded self-play games between cheap "amateur" players (they grab
 * material, like checks, develop in the opening, usually avoid hanging pieces and sometimes miss a
 * mate). Each position the games pass through is scanned for a mate in 1 with exactly one mating
 * move, and the positions that look dangerous for the defender are searched for a mate in 2 with
 * exactly one key move. The output is deterministic: same seed, same file.
 *
 * Speed: the scan and the search call chess.js's internal 0x88 methods (_moves, _makeMove,
 * _undoMove, _attacked), which skip SAN generation and are about 40 times faster than the public
 * API. Every puzzle that is kept is then re-verified from its FEN with the public API alone, with
 * the same checks as src/data/puzzle-bank.test.ts, before the file is written.
 */
import { Chess, validateFen } from "chess.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../src/data/puzzle-bank.json");

const SEED = 0x5eedc4e5;
const GAMES = 20000;
const MAX_PLIES = 200;
/** The mate-in-2 search stops once it has this many (it is the slow part). */
const MATE_IN_TWO_POOL = 160;
const TARGET = { 1: 150, 2: 40 };
/** Two boards that differ on this many squares or fewer count as the same puzzle. */
const NEAR_DUPLICATE = 8;
/** No theme may fill more than this share of a mate-in-n list. */
const THEME_CAP = 0.25;
/** A side further ahead than this (pawn = 1, queen = 9) no longer looks like a game in progress. */
const MAX_MATERIAL_EDGE = 12;
const THEMES = ["backRank", "smothered", "queen", "rook", "knight", "bishop", "pawn", "promotion", "doubleCheck", "mixed"];

// ── Seeded randomness ────────────────────────────────────────────────────────────────────────────

/** mulberry32: small, fast and good enough for shuffling and noise. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(list, rng) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** FNV-1a, so an id follows the position and survives regeneration in another order. */
function hashId(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).padStart(7, "0");
}

// ── chess.js internals (0x88 board: a8 = 0, h8 = 7, a1 = 112, h1 = 119) ─────────────────────────

const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const KING_STEPS = [-17, -16, -15, -1, 1, 15, 16, 17];
const CASTLE = 32 | 64; // BITS.KSIDE_CASTLE | BITS.QSIDE_CASTLE
const other = (color) => (color === "w" ? "b" : "w");
const squareName = (sq) => "abcdefgh"[sq & 15] + "87654321"[sq >> 4];
const uciOf = (move) => squareName(move.from) + squareName(move.to) + (move.promotion ?? "");
/** King-step distance between two squares. */
const distance = (a, b) => Math.max(Math.abs((a & 15) - (b & 15)), Math.abs((a >> 4) - (b >> 4)));
/** Rank counted from the mover's own side: 1 is its back rank. */
const relativeRank = (sq, color) => (color === "w" ? 8 - (sq >> 4) : (sq >> 4) + 1);

/** Does the side to move have any legal move? Stops at the first one. */
function hasLegalMove(chess) {
  const us = chess._turn;
  for (const move of chess._moves({ legal: false })) {
    chess._makeMove(move);
    const legal = !chess._isKingAttacked(us);
    chess._undoMove();
    if (legal) return true;
  }
  return false;
}

/** Is the side to move checkmated? (Call right after _makeMove.) */
const sideToMoveMated = (chess) => chess._isKingAttacked(chess._turn) && !hasLegalMove(chess);

function matesAfter(chess, move) {
  chess._makeMove(move);
  const mate = sideToMoveMated(chess);
  chess._undoMove();
  return mate;
}

/** Does the side to move have a mate in one? Stops at the first one. */
function hasMateInOne(chess) {
  const us = chess._turn;
  for (const move of chess._moves({ legal: false })) {
    chess._makeMove(move);
    const mate = !chess._isKingAttacked(us) && sideToMoveMated(chess);
    chess._undoMove();
    if (mate) return true;
  }
  return false;
}

/**
 * Key moves that mate next move against every defence. A key that leaves the defender without a
 * legal move (mate or stalemate) does not count. Stops once `limit` keys are found.
 */
function mateInTwoKeys(chess, limit) {
  const keys = [];
  for (const key of chess._moves()) {
    chess._makeMove(key);
    const replies = chess._moves();
    let forced = replies.length > 0;
    for (const reply of replies) {
      chess._makeMove(reply);
      const mates = hasMateInOne(chess);
      chess._undoMove();
      if (!mates) {
        forced = false;
        break;
      }
    }
    chess._undoMove();
    if (forced && keys.push(key) >= limit) break;
  }
  return keys;
}

function pieceCounts(chess) {
  const count = { w: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 } };
  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) {
      sq += 7;
      continue;
    }
    const piece = chess._board[sq];
    if (piece) count[piece.color][piece.type]++;
  }
  return count;
}

/**
 * Looks like a real middlegame: at least 7 men besides the king on each side, no extra promoted
 * pieces (one queen, two rooks, bishops and knights at most), neither side more than
 * MAX_MATERIAL_EDGE ahead, past the first few moves and well clear of the fifty-move rule. Legal
 * play already keeps pawns off the end ranks, the kings apart and the side not to move out of
 * check.
 */
function realistic(chess) {
  if (chess._moveNumber < 5 || chess._halfMoves >= 40) return false;
  const count = pieceCounts(chess);
  for (const side of [count.w, count.b]) {
    if (men(side) < 7) return false;
    if (side.q > 1 || side.r > 2 || side.b > 2 || side.n > 2) return false;
  }
  return Math.abs(material(count.w) - material(count.b)) <= MAX_MATERIAL_EDGE;
}

const men = (side) => side.p + side.n + side.b + side.r + side.q;
const material = (side) => side.p + 3 * (side.n + side.b) + 5 * side.r + 9 * side.q;

/** Squares next to `color`'s king that are empty or hold an enemy piece and are not attacked. */
function flightSquares(chess, color) {
  const king = chess._kings[color];
  let flights = 0;
  for (const step of KING_STEPS) {
    const sq = king + step;
    if (sq & 0x88) continue;
    const piece = chess._board[sq];
    if (piece && piece.color === color) continue;
    if (!chess._attacked(other(color), sq)) flights++;
  }
  return flights;
}

// ── Amateur self-play ────────────────────────────────────────────────────────────────────────────

function makePlayer(rng) {
  return {
    noise: 4 + rng() * 14, // how far random taste outweighs the evaluation below
    careful: 0.55 + rng() * 0.4, // chance per move of checking whether the moved piece hangs
    takeMate: 0.3 + rng() * 0.5, // chance of spotting a mate in one when there is one
    aggression: 1 + rng() * 2, // taste for bringing pieces next to the enemy king
  };
}

/** Material the moved piece loses at once if the opponent takes it (a one-ply blunder check). */
function hangingValue(chess, move, us, them) {
  if (move.piece === "k" || !chess._attacked(them, move.to)) return 0;
  const value = VALUE[move.promotion ?? move.piece];
  if (!chess._attacked(us, move.to)) return value;
  let cheapest = Infinity;
  for (const sq of chess._attacked(them, move.to, true)) {
    const type = chess.get(sq).type;
    cheapest = Math.min(cheapest, type === "k" ? Infinity : VALUE[type]);
  }
  return Math.max(0, value - cheapest);
}

function playGame(rng, onPosition) {
  const chess = new Chess();
  const players = { w: makePlayer(rng), b: makePlayer(rng) };
  for (let ply = 0; ply < MAX_PLIES; ply++) {
    // Captures only ever lower the count (a promotion keeps it), so once a side is down to six
    // men no later position can become a puzzle.
    const count = pieceCounts(chess);
    if (men(count.w) < 7 || men(count.b) < 7) return;
    if (chess.isThreefoldRepetition() || chess._halfMoves >= 100) return;
    const legal = chess._moves();
    if (!legal.length) return;
    const us = chess._turn;
    const them = other(us);
    const player = players[us];
    const inCheck = chess._isKingAttacked(us);
    const careful = rng() < player.careful;
    const opening = chess._moveNumber <= 12;
    const enemyKing = chess._kings[them];

    const scored = [];
    const mates = [];
    let checks = 0;
    for (const move of legal) {
      chess._makeMove(move);
      const check = chess._isKingAttacked(them);
      const mate = check && !hasLegalMove(chess);
      const hangs = careful ? hangingValue(chess, move, us, them) : 0;
      chess._undoMove();
      if (mate) mates.push(move);
      if (check) checks++;

      let score = 0;
      if (move.captured) score += 10 * VALUE[move.captured];
      if (move.promotion) score += 10 * (VALUE[move.promotion] - 1) - (move.promotion === "q" ? 0 : 60);
      if (check) score += 3;
      score -= 10 * hangs;
      const fromRank = relativeRank(move.from, us);
      const toRank = relativeRank(move.to, us);
      if (opening) {
        if ((move.piece === "n" || move.piece === "b") && fromRank === 1) score += 4;
        if (move.piece === "p" && fromRank === 2 && "de".includes(squareName(move.from)[0])) score += 3;
        if (move.piece === "q" && chess._moveNumber <= 8) score -= 3;
        if (move.piece === "r") score -= 2;
      }
      if (move.flags & CASTLE) score += 8;
      else if (move.piece === "k" && !inCheck) score -= 5;
      if (move.piece === "p" && toRank >= 6) score += toRank - 4; // push the passers
      if ([51, 52, 67, 68].includes(move.to)) score += 1; // d5 e5 d4 e4
      if (move.piece !== "k" && move.piece !== "p") score += player.aggression * Math.max(0, 3 - distance(move.to, enemyKing));
      scored.push({ move, score: score + rng() * player.noise });
    }

    onPosition({ chess, legal, mates, checks });

    let pool = scored;
    if (mates.length) {
      if (rng() < player.takeMate) pool = scored.filter((entry) => mates.includes(entry.move));
      else if (mates.length < scored.length) pool = scored.filter((entry) => !mates.includes(entry.move));
    }
    let best = pool[0];
    for (const entry of pool) if (entry.score > best.score) best = entry;
    chess._makeMove(best.move); // what Chess#move does, minus building the SAN
    chess._incPositionCount();
  }
}

// ── Describing a puzzle: theme and rating (public API only) ─────────────────────────────────────

const uciMove = (uci) => ({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });

function kingSquare(chess, color) {
  for (const row of chess.board()) for (const cell of row) if (cell && cell.type === "k" && cell.color === color) return cell.square;
  throw new Error("no king");
}

function neighbours(square) {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]);
  const out = [];
  for (let df = -1; df <= 1; df++) {
    for (let dr = -1; dr <= 1; dr++) {
      const f = file + df;
      const r = rank + dr;
      if ((df || dr) && f >= 0 && f < 8 && r >= 1 && r <= 8) out.push(String.fromCharCode(97 + f) + r);
    }
  }
  return out;
}

/**
 * Theme of the mate just played (`mate` is the Move chess.js returned), most specific first:
 *   smothered   a knight mates and every square around the king holds one of its own men
 *   backRank    a rook or queen mates along the king's first rank, and every square in front of
 *               the king is blocked by its own men, at least two of them pawns
 *   doubleCheck two pieces give the mating check
 *   promotion   the mating move promotes
 *   mixed       a discovered mate: the piece that moved is not the one giving check
 *   otherwise   the piece that gives check: queen, rook, knight, bishop or pawn
 * Castling counts as a rook mate.
 */
function themeOf(chess, mate) {
  const mated = chess.turn();
  const king = kingSquare(chess, mated);
  const checkers = chess.attackers(king, mate.color);
  const types = checkers.map((sq) => chess.get(sq).type);
  const around = neighbours(king);
  if (types.includes("n") && around.every((sq) => chess.get(sq)?.color === mated)) return "smothered";
  const homeRank = mated === "w" ? "1" : "8";
  const forwardRank = mated === "w" ? "2" : "7";
  const alongRank = checkers.some((sq, i) => (types[i] === "r" || types[i] === "q") && sq[1] === homeRank);
  if (king[1] === homeRank && alongRank) {
    const forward = around.filter((sq) => sq[1] === forwardRank).map((sq) => chess.get(sq));
    const blocked = forward.every((piece) => piece?.color === mated);
    if (blocked && forward.filter((piece) => piece.type === "p").length >= 2) return "backRank";
  }
  if (checkers.length >= 2) return "doubleCheck";
  if (mate.promotion) return "promotion";
  if (/[kq]/.test(mate.flags)) return "rook";
  if (checkers[0] !== mate.to) return "mixed";
  return { q: "queen", r: "rook", n: "knight", b: "bishop", p: "pawn" }[types[0]];
}

/** How much the theme alone makes the mate harder to see. */
const THEME_BONUS = { queen: 0, rook: 0, backRank: 0, promotion: 50, knight: 100, bishop: 100, pawn: 100, smothered: 150, doubleCheck: 150, mixed: 200 };
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/**
 * Rough difficulty on a 400–1800 scale, from simple heuristics (rounded to 10):
 *
 * Mate in 1 starts at 400 and adds
 *   +10 per legal move beyond 20 (max +250): more candidates to look through
 *   +60 per checking move that does not mate (max +300): decoys
 *   +100 if the mate is not a capture, +100 if the mating piece moves backwards
 *   +150 if a defender other than the king attacks the mating square (it looks like it hangs)
 *   +200 for an underpromotion, plus a theme bonus (THEME_BONUS: knight, bishop, pawn,
 *        discovered and double-check mates are harder to spot than queen or rook mates)
 *
 * Mate in 2 starts at 900 and adds
 *   +250 if the key move is not a check, +100 more if it is not a capture either
 *   +200 if the key is a sacrifice: the defender can take the piece and win material
 *   +8 per defence (max +160), +40 per other checking move (max +240)
 *   +6 per legal move beyond 20 (max +150), half the theme bonus of the final mate
 */
function describe(fen, moves, mateIn) {
  const chess = new Chess(fen);
  const legal = chess.moves({ verbose: true });
  const first = legal.find((move) => move.lan === moves[0]);
  const otherChecks = legal.filter((move) => move !== first && /[+#]$/.test(move.san)).length;
  let rating;
  let theme;
  if (mateIn === 1) {
    const mate = chess.move(uciMove(moves[0]));
    theme = themeOf(chess, mate);
    const king = kingSquare(chess, chess.turn());
    const defenders = chess.attackers(mate.to, chess.turn()).filter((sq) => sq !== king);
    const backwards = mate.color === "w" ? mate.to[1] < mate.from[1] : mate.to[1] > mate.from[1];
    rating = 400 + 10 * clamp(legal.length - 20, 0, 25) + 60 * Math.min(otherChecks, 5);
    if (!mate.captured) rating += 100;
    if (backwards) rating += 100;
    if (defenders.length) rating += 150;
    if (mate.promotion && mate.promotion !== "q") rating += 200;
    rating += THEME_BONUS[theme];
  } else {
    const key = chess.move(uciMove(moves[0]));
    const replies = chess.moves({ verbose: true });
    const sacrifice = replies.some((reply) => reply.to === key.to) && VALUE[key.promotion ?? key.piece] > VALUE[key.captured ?? "k"] + 1;
    chess.move(uciMove(moves[1]));
    const mate = chess.move(uciMove(moves[2]));
    theme = themeOf(chess, mate);
    rating = 900 + 8 * Math.min(replies.length, 20) + 40 * Math.min(otherChecks, 6) + 6 * clamp(legal.length - 20, 0, 25);
    if (!/[+#]$/.test(key.san)) rating += key.captured ? 250 : 350;
    if (sacrifice) rating += 200;
    rating += THEME_BONUS[theme] / 2;
  }
  return { theme, rating: Math.round(clamp(rating, 400, 1800) / 10) * 10 };
}

// ── Verification (public API only, the same checks as the vitest test) ──────────────────────────

/** Mating moves for the side to move. A mate is a check, so only checks are played out. */
function matingMoves(chess) {
  return chess
    .moves({ verbose: true })
    .filter((move) => /[+#]$/.test(move.san))
    .filter((move) => {
      chess.move(move);
      const mate = chess.isCheckmate();
      chess.undo();
      return mate;
    });
}

function hasMate(chess) {
  return chess
    .moves({ verbose: true })
    .some((move) => {
      if (!/[+#]$/.test(move.san)) return false;
      chess.move(move);
      const mate = chess.isCheckmate();
      chess.undo();
      return mate;
    });
}

/** After the key move: the defender has a move, and every one of them allows mate. */
function forcesMate(chess) {
  const replies = chess.moves({ verbose: true });
  return (
    replies.length > 0 &&
    replies.every((reply) => {
      chess.move(reply);
      const mate = hasMate(chess);
      chess.undo();
      return mate;
    })
  );
}

function verify(puzzle) {
  const { fen, moves, mateIn } = puzzle;
  if (!validateFen(fen).ok) return "invalid FEN";
  const chess = new Chess(fen);
  if (chess.fen() !== fen) return "FEN does not round-trip";
  if (chess.isGameOver()) return "game already over";
  if (moves.length !== 2 * mateIn - 1) return "wrong solution length";
  if (mateIn === 1) {
    const mates = matingMoves(chess).map((move) => move.lan);
    if (mates.length !== 1 || mates[0] !== moves[0]) return `mating moves: ${mates.join(",")}`;
  } else {
    if (hasMate(chess)) return "has a mate in 1";
    const keys = chess.moves({ verbose: true }).filter((key) => {
      chess.move(key);
      const forced = forcesMate(chess);
      chess.undo();
      return forced;
    });
    if (keys.length !== 1 || keys[0].lan !== moves[0]) return `keys: ${keys.map((key) => key.lan).join(",")}`;
  }
  try {
    for (const uci of moves) chess.move(uciMove(uci));
  } catch {
    return "solution is not legal";
  }
  return chess.isCheckmate() ? null : "solution does not mate";
}

// ── Collecting candidates ────────────────────────────────────────────────────────────────────────

/** Mated king's square, its 3x3 neighbourhood and the move: two puzzles alike in all three repeat. */
function signature(chess, uci) {
  const defender = other(chess._turn);
  const king = chess._kings[defender];
  let zone = squareName(king);
  for (const step of KING_STEPS) {
    const piece = (king + step) & 0x88 ? null : chess._board[king + step];
    zone += piece ? (piece.color === "w" ? piece.type.toUpperCase() : piece.type) : ".";
  }
  return `${chess._turn}:${uci}:${zone}`;
}

function boardCells(fen) {
  return fen.split(" ")[0].replace(/\d/g, (n) => ".".repeat(Number(n)));
}

function differingSquares(a, b) {
  let n = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
  return n;
}

const started = performance.now();
const rng = mulberry32(SEED);
const seen = new Set();
const mateInOne = [];
const mateInTwoCandidates = [];
for (let game = 0; game < GAMES; game++) {
  playGame(rng, ({ chess, legal, mates, checks }) => {
    if (mates.length > 1 || legal.length < 10 || !realistic(chess)) return;
    const fen = chess.fen();
    const placement = fen.split(" ").slice(0, 2).join(" ");
    if (seen.has(placement)) return;
    seen.add(placement);
    if (mates.length === 1) {
      const uci = uciOf(mates[0]);
      mateInOne.push({ fen, game, moves: [uci], signature: signature(chess, uci) });
      return;
    }
    // Mate-in-2 search is costly, so only positions where the defender's king is boxed in and
    // there are checks to give (in sample runs every mate in 2 the games produced was of this kind).
    const flights = flightSquares(chess, other(chess._turn));
    if ((flights <= 2 && checks >= 2) || (flights === 0 && checks >= 1)) mateInTwoCandidates.push({ fen, game });
  });
}
const playedAt = performance.now();

const mateInTwo = [];
const gamesWithMateInTwo = new Set();
for (const { fen, game } of mateInTwoCandidates) {
  if (mateInTwo.length >= MATE_IN_TWO_POOL) break;
  if (gamesWithMateInTwo.has(game)) continue;
  const chess = new Chess(fen);
  const keys = mateInTwoKeys(chess, 2);
  if (keys.length !== 1) continue;
  const [key] = keys;
  // The most stubborn defence leaves the fewest mates; ties go to capturing the key piece, then UCI.
  chess._makeMove(key);
  const defences = chess._moves().map((reply) => {
    chess._makeMove(reply);
    const mates = chess._moves().filter((move) => matesAfter(chess, move)).map(uciOf).sort();
    chess._undoMove();
    return { uci: uciOf(reply), captures: reply.to === key.to, mates };
  });
  chess._undoMove();
  defences.sort((a, b) => a.mates.length - b.mates.length || Number(b.captures) - Number(a.captures) || (a.uci < b.uci ? -1 : 1));
  const [stubborn] = defences;
  gamesWithMateInTwo.add(game);
  mateInTwo.push({
    fen,
    game,
    moves: [uciOf(key), stubborn.uci, stubborn.mates[0]],
    finalMates: stubborn.mates.length,
    signature: signature(chess, uciOf(key)),
  });
}
const searchedAt = performance.now();

// ── Choosing a spread of puzzles ─────────────────────────────────────────────────────────────────

const chosen = [];
const chosenCells = [];
const usedSignatures = new Set();

function pick(candidates, mateIn) {
  const pickRng = mulberry32(SEED + mateIn);
  for (const candidate of candidates) Object.assign(candidate, describe(candidate.fen, candidate.moves, mateIn));
  // Per theme and side to move, a seeded shuffle (in a mate in 2, those with one final mate first).
  const queues = new Map();
  for (const theme of THEMES) {
    const members = shuffle(candidates.filter((candidate) => candidate.theme === theme), pickRng);
    members.sort((a, b) => (a.finalMates > 1 ? 1 : 0) - (b.finalMates > 1 ? 1 : 0));
    queues.set(theme, { w: members.filter((c) => c.fen.split(" ")[1] === "w"), b: members.filter((c) => c.fen.split(" ")[1] === "b") });
  }
  // Round robin over the themes, rarest first, so the rare ones get in before queen and rook mates
  // fill up; within a theme, the side that has had fewer puzzles so far goes first.
  const size = (theme) => queues.get(theme).w.length + queues.get(theme).b.length;
  const order = [...THEMES].sort((a, b) => size(a) - size(b) || THEMES.indexOf(a) - THEMES.indexOf(b));
  const cap = Math.ceil(TARGET[mateIn] * THEME_CAP);
  const taken = new Map(THEMES.map((theme) => [theme, 0]));
  const sides = { w: 0, b: 0 };
  const usedGames = new Set();
  const accept = (candidate) => {
    const cells = boardCells(candidate.fen);
    if (usedGames.has(candidate.game) || usedSignatures.has(candidate.signature)) return false;
    if (chosenCells.some((other) => differingSquares(cells, other) <= NEAR_DUPLICATE)) return false;
    usedGames.add(candidate.game);
    usedSignatures.add(candidate.signature);
    chosenCells.push(cells);
    chosen.push({ ...candidate, mateIn });
    return true;
  };
  let count = 0;
  for (let progress = true; progress && count < TARGET[mateIn]; ) {
    progress = false;
    for (const theme of order) {
      if (count >= TARGET[mateIn] || taken.get(theme) >= cap) continue;
      const queue = queues.get(theme);
      for (const side of sides.w <= sides.b ? ["w", "b"] : ["b", "w"]) {
        let found = false;
        while (queue[side].length && !(found = accept(queue[side].shift())));
        if (found) {
          taken.set(theme, taken.get(theme) + 1);
          sides[side]++;
          count++;
          progress = true;
          break;
        }
      }
    }
  }
}

// Mates in 2 first: they are rarer, and the mate in 1 a game reaches two plies later is a near-duplicate.
pick(mateInTwo, 2);
pick(mateInOne, 1);

const bank = chosen
  .map(({ fen, moves, mateIn, theme, rating }) => ({ id: `m${mateIn}-${hashId(fen)}`, fen, moves, mateIn, theme, rating }))
  .sort((a, b) => a.rating - b.rating || a.mateIn - b.mateIn || (a.id < b.id ? -1 : 1));

const failures = bank.map((puzzle) => [puzzle.id, verify(puzzle)]).filter(([, error]) => error);
if (failures.length) throw new Error(`puzzles failed verification:\n${failures.map((f) => f.join(": ")).join("\n")}`);
if (new Set(bank.map((puzzle) => puzzle.id)).size !== bank.length) throw new Error("duplicate ids");
const verifiedAt = performance.now();

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `[\n${bank.map((puzzle) => `  ${JSON.stringify(puzzle)}`).join(",\n")}\n]\n`);

// ── Report ───────────────────────────────────────────────────────────────────────────────────────

const seconds = (from, to) => `${((to - from) / 1000).toFixed(1)}s`;
const tally = (list, key) => Object.fromEntries([...new Set(list.map((item) => item[key]))].sort().map((value) => [value, list.filter((item) => item[key] === value).length]));
console.log(`games: ${GAMES} in ${seconds(started, playedAt)}; mate-in-2 search over ${mateInTwoCandidates.length} positions in ${seconds(playedAt, searchedAt)}; verification ${seconds(searchedAt, verifiedAt)}`);
console.log(`candidates: ${mateInOne.length} mate in 1, ${mateInTwo.length} mate in 2`);
console.log("candidate themes, mate in 1:", tally(mateInOne, "theme"));
console.log("candidate themes, mate in 2:", tally(mateInTwo, "theme"));
for (const mateIn of [1, 2]) {
  const list = bank.filter((puzzle) => puzzle.mateIn === mateIn);
  const ratings = list.map((puzzle) => puzzle.rating);
  const side = tally(list.map((puzzle) => ({ side: puzzle.fen.split(" ")[1] })), "side");
  console.log(`mate in ${mateIn}: ${list.length} puzzles, rating ${Math.min(...ratings)}-${Math.max(...ratings)}, to move`, side, tally(list, "theme"));
}
const duals = chosen.filter((puzzle) => puzzle.mateIn === 2 && puzzle.finalMates > 1).length;
console.log(`mate in 2 with more than one final mate after the stored defence: ${duals}`);
console.log(`wrote ${bank.length} puzzles to ${OUT} in ${seconds(started, performance.now())}`);
