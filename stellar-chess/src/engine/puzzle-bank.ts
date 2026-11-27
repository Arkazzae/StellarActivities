/**
 * The generated puzzle bank (scripts/puzzle-bank.mjs, checked by src/data/puzzle-bank.test.ts):
 * mates in one and two from game-like positions, each with a single solution, a theme and a rating.
 */

import bank from "@/data/puzzle-bank.json";

export type PuzzleTheme = "backRank" | "smothered" | "queen" | "rook" | "knight" | "bishop" | "pawn" | "promotion" | "doubleCheck" | "mixed";

export interface BankPuzzle {
  id: string;
  fen: string;
  /** The solution in UCI: the mate, or the key move, the defence and the mate. */
  moves: string[];
  mateIn: 1 | 2;
  theme: PuzzleTheme;
  rating: number;
}

export const BANK = bank as BankPuzzle[];

/** The themes in the order the Puzzles page shows them, with how many puzzles each has. */
export const THEMES: PuzzleTheme[] = ["backRank", "smothered", "promotion", "doubleCheck", "queen", "rook", "knight", "bishop", "pawn", "mixed"];

export function themePuzzles(theme: PuzzleTheme): BankPuzzle[] {
  return BANK.filter((puzzle) => puzzle.theme === theme);
}

/** Puzzle Rush: mates in one, easiest first, shuffled within bands of similar rating. */
export function rushQueue(random = Math.random): BankPuzzle[] {
  const mates = BANK.filter((puzzle) => puzzle.mateIn === 1).sort((a, b) => a.rating - b.rating);
  const bands: BankPuzzle[][] = [];
  for (let i = 0; i < mates.length; i += 12) bands.push(mates.slice(i, i + 12));
  return bands.flatMap((band) => [...band].sort(() => random() - 0.5));
}

/** Days since 1970 for the player's local date (the day boundary of the puzzle of the day and the streak). */
export function dayNumber(now = new Date()): number {
  return Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 864e5);
}

/** The puzzles that can be a puzzle of the day: every mate in two and the harder mates in one. */
const DAILY = BANK.filter((puzzle) => puzzle.mateIn === 2 || puzzle.rating >= 900).sort((a, b) => (a.id < b.id ? -1 : 1));

/** The puzzle of the day: the same for everyone on a given date, a different one every day for months. */
export function dailyBankPuzzle(now = new Date()): BankPuzzle {
  // A fixed stride through the list, so neighbouring days do not get neighbouring puzzles.
  return DAILY[(dayNumber(now) * 37) % DAILY.length];
}
