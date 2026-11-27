/**
 * Progress in the Puzzles section, saved with the player's Stellarr progress:
 * - for each test position, the best solving time and whether the last attempt failed;
 * - a puzzle rating that moves with every judged attempt (Elo against the puzzle's own rating);
 * - the days the puzzle of the day was solved, for the streak;
 * - the best Puzzle Rush score, and the bank puzzles solved in theme drills.
 *
 * An attempt at a test position starts when it is opened from the Puzzles page and ends with the
 * verdict the game store reaches.
 */

import { create } from "zustand";
import { PRESETS, type PresetId } from "@/engine/positions";
import { readSaved, writeSaved } from "@/stellarr/storage";
import { dayNumber } from "@/engine/puzzle-bank";
import { useGameStore } from "./game";

export interface PuzzleProgress {
  /** Best solving time in ms, if ever solved. */
  best: number | null;
  /** The last attempt failed (and has not been solved since). */
  failed: boolean;
}

/** How hard each test position is, on the same scale as the puzzle rating. */
export const PRESET_RATING: Partial<Record<PresetId, number>> = {
  backRank: 900,
  smothered: 1150,
  fork: 1000,
  queenMate: 1000,
  rookMate: 1250,
  lucena: 1650,
  philidor: 1750,
};

export const START_RATING = 1000;
const KEY = "puzzles";
const ids = PRESETS.map((preset) => preset.id);

interface Saved {
  progress: Partial<Record<PresetId, PuzzleProgress>>;
  rating: number;
  ratingLog: number[];
  days: number[];
  rushBest: number;
  rushPerfect: boolean;
  bankSolved: string[];
}

function numbers(value: unknown, limit: number): number[] {
  return Array.isArray(value) ? value.filter((item): item is number => Number.isFinite(item)).slice(-limit) : [];
}

function load(): Saved {
  const saved = readSaved(KEY) as Record<string, unknown> | null;
  // The first version saved the per-position map on its own.
  const map = (saved && typeof saved.progress === "object" ? saved.progress : saved) as Record<string, Partial<PuzzleProgress>> | null;
  const progress: Partial<Record<PresetId, PuzzleProgress>> = {};
  for (const id of ids) {
    const entry = map?.[id];
    if (!entry) continue;
    progress[id] = { best: typeof entry.best === "number" && entry.best > 0 ? entry.best : null, failed: entry.failed === true };
  }
  const rating = Number(saved?.rating);
  return {
    progress,
    rating: Number.isFinite(rating) && rating > 0 ? Math.round(rating) : START_RATING,
    ratingLog: numbers(saved?.ratingLog, 30),
    days: numbers(saved?.days, 120),
    rushBest: Number.isInteger(saved?.rushBest) ? saved!.rushBest as number : 0,
    rushPerfect: saved?.rushPerfect === true,
    bankSolved: Array.isArray(saved?.bankSolved) ? (saved!.bankSolved as unknown[]).filter((id): id is string => typeof id === "string").slice(-500) : [],
  };
}

interface PuzzleState extends Saved {
  /** The attempt in progress: which position, since when, and whether the engine played a move for the player. */
  attempt: { id: PresetId; startedAt: number; assisted: boolean } | null;
  /** The position last opened from the Puzzles page, kept after the attempt ends. */
  current: PresetId | null;
  /** How the last attempt ended: solved in this many ms (null when failed or helped). */
  lastTime: number | null;
  /** The rating change of the last judged attempt. */
  lastDelta: number | null;
  begin: (id: PresetId) => void;
  /** The player asked the engine to play a move: the attempt no longer sets a best time. */
  assist: () => void;
  finish: (solved: boolean) => void;
  /** A judged attempt at a puzzle of this rating moves the player's rating. */
  rate: (puzzleRating: number, solved: boolean) => void;
  /** A bank puzzle solved in a theme drill. */
  markSolved: (id: string) => void;
  /** A finished Puzzle Rush run. */
  recordRush: (score: number, mistakes: number) => void;
  /** Today's puzzle of the day solved: the streak goes on. */
  markDaily: () => void;
}

const initial = load();

export const usePuzzleStore = create<PuzzleState>((set, get) => {
  const persist = () => {
    const { progress, rating, ratingLog, days, rushBest, rushPerfect, bankSolved } = get();
    writeSaved(KEY, { progress, rating, ratingLog, days, rushBest, rushPerfect, bankSolved });
  };
  return {
    ...initial,
    attempt: null,
    current: null,
    lastTime: null,
    lastDelta: null,
    begin: (id) => set({ attempt: { id, startedAt: Date.now(), assisted: false }, current: id, lastTime: null }),
    assist: () => {
      const { attempt } = get();
      if (attempt) set({ attempt: { ...attempt, assisted: true } });
    },
    finish: (solved) => {
      const { attempt, progress } = get();
      if (!attempt) return;
      const time = Date.now() - attempt.startedAt;
      const before = progress[attempt.id];
      const timed = solved && !attempt.assisted;
      const entry: PuzzleProgress = timed
        ? { best: before?.best ? Math.min(before.best, time) : time, failed: false }
        : solved ? { best: before?.best ?? null, failed: false }
        : { best: before?.best ?? null, failed: true };
      set({ progress: { ...progress, [attempt.id]: entry }, attempt: null, lastTime: timed ? time : null });
      // Only the first attempt at a position moves the rating, and not one the engine helped solve.
      if (before || (attempt.assisted && solved)) persist();
      else get().rate(PRESET_RATING[attempt.id] ?? START_RATING, solved);
    },
    rate: (puzzleRating, solved) => {
      const { rating, ratingLog } = get();
      const expected = 1 / (1 + 10 ** ((puzzleRating - rating) / 400));
      // Moves fast while the rating is new, then settles.
      const k = ratingLog.length < 10 ? 40 : 24;
      const next = Math.max(100, Math.round(rating + k * ((solved ? 1 : 0) - expected)));
      set({ rating: next, ratingLog: [...ratingLog, next].slice(-30), lastDelta: next - rating });
      persist();
    },
    markSolved: (id) => {
      const { bankSolved } = get();
      if (bankSolved.includes(id)) return;
      set({ bankSolved: [...bankSolved, id].slice(-500) });
      persist();
    },
    markDaily: () => {
      const { days } = get();
      const today = dayNumber();
      if (days.includes(today)) return;
      set({ days: [...days, today].slice(-120) });
      persist();
    },
    recordRush: (score, mistakes) => {
      const { rushBest, rushPerfect } = get();
      set({ rushBest: Math.max(rushBest, score), rushPerfect: rushPerfect || (mistakes === 0 && score >= 10) });
      persist();
    },
  };
});

export { dayNumber };

/** Days in a row with the puzzle of the day solved, ending today (or yesterday, while today is still open). */
export function streak(days: readonly number[], today = dayNumber()): number {
  const solved = new Set(days);
  let day = solved.has(today) ? today : today - 1;
  let count = 0;
  while (solved.has(day)) {
    count++;
    day--;
  }
  return count;
}

/** Milliseconds until the next puzzle of the day (local midnight). */
export function untilTomorrow(now = new Date()): number {
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return midnight.getTime() - now.getTime();
}

export function formatDuration(ms: number): string {
  const seconds = Math.max(1, Math.round(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

// The game store judges a position (see useGameLifecycle); the attempt ends with that verdict.
useGameStore.subscribe((state, previous) => {
  if (state.verdict && state.verdict !== previous.verdict) usePuzzleStore.getState().finish(state.verdict === "solved");
});
