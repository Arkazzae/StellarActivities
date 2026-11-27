import { useGameStore } from "@/state/game";
import { useUiStore } from "@/state/ui";
import { formatDuration, usePuzzleStore } from "@/state/puzzles";
import { PRESETS } from "@/engine/positions";
import { playBestMove, requestHint } from "@/ai/hint";
import { startPuzzle } from "@/game/session";
import { useTranslation } from "@/i18n";
import { MoveTable } from "./MoveTable";

/**
 * The coach beside a puzzle opened from the Puzzles page: where the attempt stands, a hint arrow or
 * the engine's move when stuck, a fresh start, and the next puzzle once this one is solved.
 */
/** Whether the coach is beside this game: a puzzle opened from the Puzzles page. */
export function useCoachShown(): boolean {
  const solver = useGameStore((s) => s.solver);
  const startFen = useGameStore((s) => s.startFen);
  const current = usePuzzleStore((s) => s.current);
  return !!solver && PRESETS.some((item) => item.id === current && item.fen === startFen);
}

export function PuzzleCoach() {
  const { t } = useTranslation();
  const solver = useGameStore((s) => s.solver);
  const startFen = useGameStore((s) => s.startFen);
  const verdict = useGameStore((s) => s.verdict);
  const phase = useGameStore((s) => s.phase);
  const moves = useGameStore((s) => s.moves.length);
  const turn = useGameStore((s) => s.chess.turn());
  useGameStore((s) => s.fen);
  const current = usePuzzleStore((s) => s.current);
  const progress = usePuzzleStore((s) => s.progress);
  const lastTime = usePuzzleStore((s) => s.lastTime);
  const assisted = usePuzzleStore((s) => s.attempt?.assisted ?? false);
  const hint = useUiStore((s) => s.hint);
  const setHint = useUiStore((s) => s.setHint);
  const hintLoading = useUiStore((s) => s.hintLoading);
  const setView = useUiStore((s) => s.setView);

  const preset = PRESETS.find((item) => item.id === current && item.fen === startFen);
  if (!solver || !preset) return null;
  const group = PRESETS.filter((item) => item.group === preset.group);
  const index = group.findIndex((item) => item.id === preset.id);
  const next = group[(index + 1) % group.length];
  const myTurn = phase === "playing" && turn === solver && !verdict;

  const feedback = verdict === "solved"
    ? { tone: "is-good", mark: "✓", title: t("coach.solved"), text: lastTime ? t("coach.solvedIn", { time: formatDuration(lastTime) }) : t("coach.solvedHelped") }
    : verdict === "failed"
    ? { tone: "is-bad", mark: "✗", title: t("coach.failed"), text: t("coach.failedText") }
    : myTurn
    ? { tone: "", mark: moves ? "→" : "?", title: t(moves ? "coach.again" : "coach.start"), text: t(`preset.${preset.id}.goal`) }
    : { tone: "", mark: "…", title: t("coach.defending"), text: t("coach.defendingText") };

  return (
    <section className="coach" aria-label={t("nav.puzzles")}>
      <header className="coach__head">
        <img src="icons/nav/puzzles.webp" alt="" />
        <h2>{t(preset.group === "puzzle" ? "coach.puzzle" : "coach.endgame", { n: index + 1, total: group.length })}</h2>
        <span className="coach__dots" aria-hidden="true">
          {group.map((item) => {
            const entry = progress[item.id];
            const state = item.id === preset.id ? "is-current" : entry?.best || (entry && !entry.failed) ? "is-good" : entry?.failed ? "is-bad" : "";
            return <i key={item.id} className={state} />;
          })}
        </span>
      </header>
      <div className="coach__status">
        <div className={`coach__feedback ${feedback.tone}`} role="status">
          <span className="coach__mark" aria-hidden="true">{feedback.mark}</span>
          <span><strong>{feedback.title}</strong><span>{feedback.text}</span></span>
        </div>
        {hint && !verdict && <p className="coach__hint"><b>{t("coach.hint")}:</b> {t("coach.hintText")}</p>}
        {assisted && !verdict && <p className="coach__note">{t("coach.assisted")}</p>}
      </div>
      <div className="coach__moves">
        <h3>{t("coach.solution")}</h3>
        {moves ? <MoveTable /> : <p className="coach__empty">{t("coach.noMoves")}</p>}
      </div>
      <div className="coach__actions">
        {verdict === "solved" ? (
          <button type="button" className="btn btn--green btn--big" onClick={() => startPuzzle(next.id)}>{t("coach.next")}</button>
        ) : (
          <button type="button" className="btn btn--green btn--big" onClick={() => void playBestMove()} disabled={!myTurn || hintLoading}>{t("coach.playMove")}</button>
        )}
        <div className="coach__row">
          <button type="button" className="btn" onClick={() => (hint ? setHint(null) : void requestHint())} disabled={!hint && (!myTurn || hintLoading)}>
            {t(hint ? "coach.hideHint" : "coach.hint")}
          </button>
          <button type="button" className="btn" onClick={() => startPuzzle(preset.id)}>{t("coach.restart")}</button>
        </div>
        <button type="button" className="link coach__back" onClick={() => { useGameStore.getState().reset(); setView("puzzles"); }}>{t("coach.allPuzzles")}</button>
      </div>
    </section>
  );
}
