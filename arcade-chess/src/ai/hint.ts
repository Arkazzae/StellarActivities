/**
 * Hint for the player: Stockfish at full skill looks at the player's position for a moment.
 * Not offered in games against another person.
 */

import { stockfishPlayer } from "./stockfish-player";
import { enginePosition, useGameStore } from "@/state/game";
import { useUiStore } from "@/state/ui";
import type { Move, Square } from "@/engine/types";
import { makeMove } from "@/engine/chess";
import { playMoveSound } from "@/sounds";
import { usePuzzleStore } from "@/state/puzzles";
import { t } from "@/i18n";

export async function requestHint(): Promise<void> {
  const ui = useUiStore.getState();
  const game = useGameStore.getState();
  if (ui.hintLoading || game.online || game.phase !== "playing" || !game.myColor || game.chess.turn() !== game.myColor) return;
  const fen = game.chess.fen();
  ui.setHintLoading(true);
  try {
    const { startFen, moves } = enginePosition(game);
    const result = await stockfishPlayer.search({ startFen, moves, skill: 20, depth: 14, moveTimeMs: 900, lines: 1 });
    if (useGameStore.getState().chess.fen() !== fen || !result.best) return;
    useUiStore.getState().setHint({ from: result.best.slice(0, 2) as Square, to: result.best.slice(2, 4) as Square });
  } catch (error) {
    useUiStore.getState().showToast(t("toast.hintFailed"));
    console.error(error);
  } finally {
    useUiStore.getState().setHintLoading(false);
  }
}

/** Puzzles: the engine plays the player's next move (the attempt then sets no best time). */
export async function playBestMove(): Promise<void> {
  const ui = useUiStore.getState();
  const game = useGameStore.getState();
  if (ui.hintLoading || game.online || game.phase !== "playing" || !game.myColor || game.chess.turn() !== game.myColor) return;
  const fen = game.chess.fen();
  ui.setHintLoading(true);
  try {
    const { startFen, moves } = enginePosition(game);
    const result = await stockfishPlayer.search({ startFen, moves, skill: 20, depth: 14, moveTimeMs: 900, lines: 1 });
    const live = useGameStore.getState();
    if (live.chess.fen() !== fen || live.phase !== "playing" || !result.best) return;
    const move = makeMove(live.chess, result.best.slice(0, 2) as Square, result.best.slice(2, 4) as Square, result.best[4]);
    if (!move) return;
    usePuzzleStore.getState().assist();
    live.applyMove(move as unknown as Move);
    playMoveSound(move);
  } catch (error) {
    useUiStore.getState().showToast(t("toast.hintFailed"));
    console.error(error);
  } finally {
    useUiStore.getState().setHintLoading(false);
  }
}

// A hint belongs to one position: any move clears it.
useGameStore.subscribe((state, previous) => {
  if (state.fen !== previous.fen && useUiStore.getState().hint) useUiStore.getState().setHint(null);
});
