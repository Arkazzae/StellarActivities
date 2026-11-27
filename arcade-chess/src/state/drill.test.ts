import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Square } from "@/engine/types";
import { useGameStore } from "./game";
import { RUSH_LIVES, useDrillStore } from "./drill";
import { streak, usePuzzleStore, START_RATING } from "./puzzles";
import { withTaste } from "@/hooks/useChaosBotDraft";

const play = (uci: string) => {
  const result = useGameStore.getState().tryMove(uci.slice(0, 2) as Square, uci.slice(2, 4) as Square);
  if (result === "promotion") useGameStore.getState().confirmPromotion(uci[4] ?? "q");
};
const current = () => useDrillStore.getState().queue[useDrillStore.getState().index];

describe("Puzzle Rush", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    useDrillStore.getState().stop();
    vi.useRealTimers();
  });

  it("scores a mate, takes back a wrong move with the solution drawn, and ends after three mistakes", () => {
    useDrillStore.getState().start("rush");
    const first = current();
    expect(useGameStore.getState().drill).toBe(true);
    expect(useGameStore.getState().fen).toBe(first.fen);
    play(first.moves[0]);
    expect(useDrillStore.getState()).toMatchObject({ score: 1, feedback: "good" });
    // A mate in a drill is not a finished game: no result, no game-over card.
    expect(useGameStore.getState().result).toBeNull();
    vi.advanceTimersByTime(500);
    expect(useDrillStore.getState().index).toBe(1);

    for (let mistake = 1; mistake <= RUSH_LIVES; mistake++) {
      const puzzle = current();
      const wrong = useGameStore.getState().chess.moves({ verbose: true }).find((move) => `${move.from}${move.to}` !== puzzle.moves[0].slice(0, 4) && !move.san.includes("#"))!;
      play(`${wrong.from}${wrong.to}${wrong.promotion ?? ""}`);
      expect(useDrillStore.getState()).toMatchObject({ mistakes: mistake, feedback: "bad" });
      vi.advanceTimersByTime(0);
      // Taken back, with the right move drawn.
      expect(useGameStore.getState().fen).toBe(puzzle.fen);
      expect(useGameStore.getState().arrows[0]).toMatchObject({ from: puzzle.moves[0].slice(0, 2), to: puzzle.moves[0].slice(2, 4) });
      vi.advanceTimersByTime(1200);
    }
    expect(useDrillStore.getState().over).toBe(true);
    expect(usePuzzleStore.getState().rushBest).toBeGreaterThanOrEqual(1);
  });

  it("answers the key move of a mate in two with the defence", () => {
    useDrillStore.getState().start("theme", "queen");
    const queue = useDrillStore.getState().queue;
    const index = queue.findIndex((puzzle) => puzzle.mateIn === 2);
    expect(index).toBeGreaterThanOrEqual(0);
    useDrillStore.setState({ index: index - 1 });
    useDrillStore.getState().next();
    const puzzle = current();
    play(puzzle.moves[0]);
    expect(useDrillStore.getState().step).toBe(2);
    vi.advanceTimersByTime(400);
    expect(useGameStore.getState().moves).toHaveLength(2);
    play(puzzle.moves[2]);
    expect(useDrillStore.getState()).toMatchObject({ feedback: "good", score: 1 });
    expect(usePuzzleStore.getState().bankSolved).toContain(puzzle.id);
  });
});

describe("puzzle of the day", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    useDrillStore.getState().stop();
    vi.useRealTimers();
  });

  it("counts toward the streak once solved, and the board stops taking moves", () => {
    usePuzzleStore.setState({ days: [] });
    useDrillStore.getState().start("daily");
    const puzzle = current();
    play(puzzle.moves[0]);
    if (puzzle.mateIn === 2) {
      vi.advanceTimersByTime(400);
      play(puzzle.moves[2]);
    }
    expect(useDrillStore.getState().feedback).toBe("good");
    expect(usePuzzleStore.getState().days).toHaveLength(1);
    expect(useGameStore.getState().phase).toBe("ended");
  });
});

describe("puzzle progress", () => {
  it("counts the daily streak up to today, or yesterday while today is open", () => {
    expect(streak([10, 11, 12], 12)).toBe(3);
    expect(streak([10, 11], 12)).toBe(2);
    expect(streak([9, 11], 12)).toBe(1);
    expect(streak([5], 12)).toBe(0);
  });

  it("moves the rating up for a solved puzzle and down for a missed one", () => {
    usePuzzleStore.setState({ rating: START_RATING, ratingLog: [] });
    usePuzzleStore.getState().rate(1200, true);
    const up = usePuzzleStore.getState().rating;
    expect(up).toBeGreaterThan(START_RATING);
    usePuzzleStore.getState().rate(800, false);
    expect(usePuzzleStore.getState().rating).toBeLessThan(up);
  });
});

describe("Chaos bots' taste in cards", () => {
  it("reaches for a favourite-category card, unless the roll says otherwise", () => {
    // Iskra likes Arcane cards: blink is Arcane, hourglass is Time.
    expect(withTaste("iskra", ["hourglass", "blink", "time_thief"], "hourglass", 0.1)).toBe("blink");
    expect(withTaste("iskra", ["hourglass", "blink", "time_thief"], "hourglass", 0.99)).toBe("hourglass");
    // Nox always takes the engine's card; a ladder bot too.
    expect(withTaste("nox", ["hourglass", "blink"], "hourglass", 0)).toBe("hourglass");
    expect(withTaste("glut", ["hourglass", "blink"], "hourglass", 0)).toBe("hourglass");
  });
});
