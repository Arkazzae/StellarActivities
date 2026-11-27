import { useEffect } from "react";
import { isWatching, useGameStore } from "@/state/game";
import { useUiStore } from "@/state/ui";
import { chosenStart, sideToMove } from "@/engine/positions";
import { lobbyStart } from "@/game/session";
import { Board } from "@/components/Board/Board";
import { BoardOverlays } from "./BoardOverlays";
import { GameOverDialog } from "./GameOverDialog";
import { PlayerBar } from "./PlayerBar";
import { RightPanel } from "./RightPanel";
import { EvalBar } from "./EvalBar";
import { MobileBar } from "./MobileBar";
import { MoveStrip } from "./MoveStrip";
import { DraftOverlay, TargetBanner } from "@/components/chaos/DraftOverlay";
import { CHAOS_ENABLED } from "@/features";

/** The board with its player bars, and the panel beside it: the bot screen, the room, or the game. */
export function PlayPage() {
  const phase = useGameStore((s) => s.phase);
  const flipped = useGameStore((s) => s.flipped);
  const watching = useGameStore(isWatching);
  const online = useGameStore((s) => s.online !== null);
  const view = useUiStore((s) => s.view);
  const mode = useUiStore((s) => s.mode);
  const side = useUiStore((s) => s.side);
  const showEval = useUiStore((s) => s.showEval);
  const positionPick = useUiStore((s) => s.positionPick);
  const chess960 = useUiStore((s) => s.chess960);
  const customFen = useUiStore((s) => s.customFen);
  // No engine help while people play each other (it comes back for the review), nor on the channel's empty board.
  const drill = useGameStore((s) => s.drill);
  // No engine help in a puzzle drill either: the bar would give the mate away.
  const evalShown = showEval && !drill && !(online && phase === "playing") && !(view === "online" && phase === "lobby");

  // On a phone the player scrolls down to the Play button; the game itself must start with the
  // board in view, and so must the bot screen after a game.
  useEffect(() => {
    document.querySelector(".app__main")?.scrollTo({ top: 0 });
  }, [phase === "lobby"]);

  // The Chaos Chess lobby is its own page: the bot screen never runs in Chaos mode.
  useEffect(() => {
    if (view !== "play" || phase !== "lobby" || mode !== "chaos") return;
    // While Chaos Chess is hidden, a Chaos lobby is an ordinary bot game.
    if (CHAOS_ENABLED) useUiStore.getState().setView("chaos");
    else useUiStore.getState().setMode("vsBot");
  }, [view, phase, mode]);

  // Before the game the board faces the colour the player picked; White when two bots play; in the
  // Positions tab the side to move, which the player takes.
  useEffect(() => {
    if (phase !== "lobby" || view !== "play") return;
    const flipped = mode === "positions" ? sideToMove(lobbyStart() ?? "") === "b" : (mode === "vsBot" || mode === "chaos") && side === "b";
    useGameStore.setState({ flipped });
  }, [phase, view, mode, side, positionPick, chess960, customFen]);

  // Before the game the board shows where it will start; while a pasted FEN is unplayable it keeps the last good one.
  useEffect(() => {
    if (phase !== "lobby") return;
    const choice = chosenStart({ mode: view === "play" ? mode : "vsBot", positionPick, chess960, customFen });
    if (choice.ok) useGameStore.getState().previewStart(choice.fen);
  }, [phase, view, mode, positionPick, chess960, customFen]);

  const top = flipped ? "w" : "b";
  const bottom = flipped ? "b" : "w";
  return (
    <div className={`play-page${evalShown ? " has-eval" : ""}${phase === "lobby" ? " is-lobby" : ""}`}>
      <div className="board-column">
        <MoveStrip />
        <PlayerBar side={top} />
        <div className="board-area">
          {evalShown && <EvalBar />}
          {/* Watching two bots or someone else's game, the board is for looking only (arrows can still be drawn). */}
          <Board interactive={phase !== "lobby" && !watching}>
            <BoardOverlays />
          </Board>
          <TargetBanner />
          <GameOverDialog />
        </div>
        <PlayerBar side={bottom} />
      </div>
      <RightPanel />
      <MobileBar />
      <DraftOverlay />
    </div>
  );
}
