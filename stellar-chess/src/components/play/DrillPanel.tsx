import { useEffect, useState } from "react";
import { RUSH_LIVES, useDrillStore } from "@/state/drill";
import { usePuzzleStore } from "@/state/puzzles";
import { useUiStore } from "@/state/ui";
import { useGameStore } from "@/state/game";
import { themePuzzles } from "@/engine/puzzle-bank";
import { tn, useTranslation } from "@/i18n";

const clock = (ms: number) => {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

/** Beside the board during Puzzle Rush or a theme drill: time, score, mistakes, and what to do next. */
export function DrillPanel() {
  const { t } = useTranslation();
  const drill = useDrillStore();
  const rating = usePuzzleStore((s) => s.rating);
  const lastDelta = usePuzzleStore((s) => s.lastDelta);
  const rushBest = usePuzzleStore((s) => s.rushBest);
  const bankSolved = usePuzzleStore((s) => s.bankSolved);
  const [now, setNow] = useState(Date.now());
  const puzzle = drill.queue[drill.index];

  useEffect(() => {
    if (!drill.endsAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [drill.endsAt]);

  const leave = () => {
    drill.stop();
    useGameStore.getState().reset();
    useUiStore.getState().setView("puzzles");
  };
  const rush = drill.kind === "rush";
  const daily = drill.kind === "daily";
  const title = rush ? t("drill.rush") : daily ? t("puzzles.daily") : t(`drill.theme.${drill.theme}`);
  const left = drill.endsAt ? drill.endsAt - now : 0;
  const themeSolved = drill.theme ? themePuzzles(drill.theme).filter((item) => bankSolved.includes(item.id)).length : 0;
  const themeTotal = drill.theme ? themePuzzles(drill.theme).length : 0;
  const goal = puzzle ? t(puzzle.mateIn === 1 ? "drill.mate1" : "drill.mate2", { side: t(`side.${puzzle.fen.split(" ")[1] === "b" ? "b" : "w"}`) }) : "";

  return (
    <section className={`drill${rush ? " drill--rush" : ""}`} aria-label={title}>
      <header className="drill__head">
        <img src={rush ? "icons/puzzles/rush.webp" : daily ? "icons/puzzles/calendar.webp" : "icons/nav/puzzles.webp"} alt="" />
        <h2>{title}</h2>
        {!rush && <span className="drill__rating">{t("drill.rating", { rating })}{lastDelta ? <b className={lastDelta > 0 ? "is-up" : "is-down"}> {lastDelta > 0 ? "+" : ""}{lastDelta}</b> : null}</span>}
      </header>

      {rush ? (
        <div className="drill__board-info">
          <div className={`drill__clock${left < 20_000 && !drill.over ? " is-low" : ""}`} role="timer">{drill.over ? "0:00" : clock(left)}</div>
          <div className="drill__score">
            <span><strong>{drill.score}</strong>{t("drill.solved")}</span>
            <span className="drill__lives" aria-label={t("drill.mistakes", { n: drill.mistakes, max: RUSH_LIVES })}>
              {Array.from({ length: RUSH_LIVES }, (_, i) => <i key={i} className={i < drill.mistakes ? "is-lost" : ""} />)}
            </span>
          </div>
        </div>
      ) : daily ? null : (
        <p className="drill__progress">{t("drill.themeProgress", { solved: themeSolved, total: themeTotal })}</p>
      )}

      {drill.over ? (
        <div className="drill__over">
          <img src="icons/puzzles/badge-rush.webp" alt="" />
          <strong>{tn("drill.finalScore", drill.score)}</strong>
          <span>{drill.score >= rushBest && drill.score > 0 ? t("drill.newBest") : t("drill.best", { best: rushBest })}</span>
        </div>
      ) : (
        <div className={`drill__feedback${drill.feedback ? ` is-${drill.feedback}` : ""}`} role="status">
          <strong>{drill.feedback === "good" ? t("drill.good") : drill.feedback === "bad" ? t("drill.bad") : goal}</strong>
          <span>{drill.feedback === "bad" ? t("drill.shown") : drill.feedback === "good" && daily ? t("drill.dailyDone") : puzzle ? t("drill.puzzleRating", { rating: puzzle.rating }) : ""}</span>
        </div>
      )}

      <div className="drill__spacer" />
      <div className="drill__actions">
        {drill.over ? (
          <button type="button" className="btn btn--green btn--big" onClick={() => drill.start("rush")}>{t("drill.again")}</button>
        ) : daily ? (
          drill.revealed ? <button type="button" className="btn btn--green btn--big" onClick={drill.retry}>{t("coach.restart")}</button> : null
        ) : !rush ? (
          <button type="button" className="btn btn--green btn--big" onClick={drill.next} disabled={drill.feedback === "good"}>
            {t(drill.revealed ? "drill.next" : "drill.skip")}
          </button>
        ) : null}
        <button type="button" className="btn" onClick={leave}>{t("coach.allPuzzles")}</button>
      </div>
    </section>
  );
}
