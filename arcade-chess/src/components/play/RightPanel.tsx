import { useGameStore } from "@/state/game";
import { useUiStore } from "@/state/ui";
import { getOpponent } from "@/ai/bots";
import { lobbySeats } from "@/game/session";
import { BotSelect } from "./BotSelect";
import { GameTab } from "./GameTab";
import { ReviewTab } from "./ReviewTab";
import { PuzzleCoach, useCoachShown } from "./PuzzleCoach";
import { DrillPanel } from "./DrillPanel";
import { useDrillStore } from "@/state/drill";
import { useTranslation } from "@/i18n";

export function RightPanel() {
  const phase = useGameStore((s) => s.phase);
  const gameSeats = useGameStore((s) => s.seats);
  const online = useGameStore((s) => s.online);
  const players = useGameStore((s) => s.players);
  const view = useUiStore((s) => s.view);
  const mode = useUiStore((s) => s.mode);
  const solver = useGameStore((s) => s.solver);
  const chaos = useGameStore((s) => s.chaos.enabled);
  const coached = useCoachShown();
  const drilling = useDrillStore((s) => s.kind !== null);
  const drillBoard = useGameStore((s) => s.drill);
  useUiStore((s) => s.opponent);
  useUiStore((s) => s.match);
  const tab = useUiStore((s) => s.panelTab);
  const setTab = useUiStore((s) => s.setPanelTab);
  const { t } = useTranslation();
  const room = view === "online" && phase === "lobby";
  const seats = phase === "lobby" ? lobbySeats("w") : gameSeats;
  const bots = [seats.w, seats.b].filter((seat) => !!seat).map((seat) => getOpponent(seat!.id));
  const solving = phase === "lobby" ? mode === "positions" : solver !== null;
  const title = room ? t("online.title")
    : online ? t("online.gameTitle", { white: players.w?.username ?? "?", black: players.b?.username ?? "?" })
    : solving ? t("panel.titleSolve")
    : bots.length === 2 ? t("panel.titleMatch")
    : bots[0] ? t("panel.titleBot", { name: bots[0].name }) : t("panel.title");
  const shown = tab === "review" && (phase !== "ended" || chaos) ? "game" : tab;

  // Puzzle Rush and theme drills, and a puzzle from the Puzzles page, have their own panels; a Chaos
  // game's panel opens with the Chaos header.
  if (drilling && drillBoard) return <aside className="right-panel"><DrillPanel /></aside>;
  if (coached && phase !== "lobby") return <aside className="right-panel"><PuzzleCoach /></aside>;
  const chaosGame = chaos && phase !== "lobby";
  return (
    <aside className="right-panel">
      {!chaosGame && (
        <header className="right-panel__header">
          <h2>{title}</h2>
        </header>
      )}
      {/* The tabs appear once there is something to review. */}
      {phase === "ended" && !chaos && (
        <div className="panel-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={shown === "game"} className={shown === "game" ? "is-active" : ""} onClick={() => setTab("game")}>
            {t("panel.game")}
          </button>
          {phase === "ended" && !chaos && (
            <button type="button" role="tab" aria-selected={shown === "review"} className={shown === "review" ? "is-active" : ""} onClick={() => setTab("review")}>
              {t("panel.review")}
            </button>
          )}
        </div>
      )}
      <div className="right-panel__body">
        {phase === "lobby" ? <BotSelect /> : shown === "review" ? <ReviewTab /> : <GameTab />}
      </div>
    </aside>
  );
}
