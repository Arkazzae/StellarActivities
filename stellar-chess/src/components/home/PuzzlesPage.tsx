import { useEffect, useState } from "react";
import { MiniBoard } from "@/components/play/PositionGallery";
import { PRESETS, type PresetId } from "@/engine/positions";
import { dailyBankPuzzle, THEMES, themePuzzles } from "@/engine/puzzle-bank";
import { dayNumber, formatDuration, streak, untilTomorrow, usePuzzleStore } from "@/state/puzzles";
import { RUSH_LIVES, useDrillStore } from "@/state/drill";
import { useUiStore } from "@/state/ui";
import { startPuzzle } from "@/game/session";
import { formatLocale, tn, useTranslation } from "@/i18n";

const clock = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${Math.floor(total / 3600)}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
};

/** The longest run of consecutive days in a list of day numbers. */
function longestRun(days: readonly number[]): number {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  sorted.forEach((day, i) => {
    run = i > 0 && day === sorted[i - 1] + 1 ? run + 1 : 1;
    best = Math.max(best, run);
  });
  return best;
}

/**
 * The Puzzles page: the puzzle rating and the streak of daily puzzles, the puzzle of the day with
 * the week behind it, Puzzle Rush, drills by theme on real positions, the test positions and
 * endgames with best times, badges, and the way to Chess960 or a pasted position.
 */
export function PuzzlesPage() {
  const { t } = useTranslation();
  const progress = usePuzzleStore((s) => s.progress);
  const rating = usePuzzleStore((s) => s.rating);
  const ratingLog = usePuzzleStore((s) => s.ratingLog);
  const days = usePuzzleStore((s) => s.days);
  const rushBest = usePuzzleStore((s) => s.rushBest);
  const rushPerfect = usePuzzleStore((s) => s.rushPerfect);
  const bankSolved = usePuzzleStore((s) => s.bankSolved);
  const startDrill = useDrillStore((s) => s.start);
  const setMode = useUiStore((s) => s.setMode);
  const setView = useUiStore((s) => s.setView);
  const setPositionPick = useUiStore((s) => s.setPositionPick);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const daily = dailyBankPuzzle(now);
  const dailySide = daily.fen.split(" ")[1] === "b" ? "b" : "w";
  const today = dayNumber(now);
  const solvedPresets = PRESETS.filter((preset) => progress[preset.id]?.best || (progress[preset.id] && !progress[preset.id]!.failed)).length;
  const solvedTotal = solvedPresets + bankSolved.length;
  const currentStreak = streak(days, today);
  const change = ratingLog.length >= 2 ? ratingLog[ratingLog.length - 1] - ratingLog[Math.max(0, ratingLog.length - 6)] : 0;
  const dailyDone = days.includes(today);
  const week = Array.from({ length: 7 }, (_, i) => today - 6 + i);
  const endgames = PRESETS.filter((preset) => preset.group === "endgame");

  const badges = [
    { id: "first", icon: "badge-first", earned: solvedTotal > 0 || rushBest > 0 },
    { id: "streak", icon: "badge-streak", earned: longestRun(days) >= 3 },
    { id: "rush", icon: "badge-rush", earned: rushBest >= 10 },
    { id: "endgames", icon: "badge-endgames", earned: endgames.every((preset) => progress[preset.id]?.best) },
    { id: "perfect", icon: "badge-perfect", earned: rushPerfect },
    { id: "all", icon: "badge-all", earned: PRESETS.every((preset) => progress[preset.id]?.best) && bankSolved.length >= 50 },
  ];

  const status = (id: PresetId) => {
    const entry = progress[id];
    if (entry?.failed && !entry.best) return { text: t("puzzles.retry"), tone: "is-bad" };
    if (entry?.best) return { text: t("puzzles.solvedIn", { time: formatDuration(entry.best) }), tone: "is-good" };
    return { text: t("puzzles.new"), tone: "is-new" };
  };
  const card = (id: PresetId) => {
    const preset = PRESETS.find((item) => item.id === id)!;
    const state = status(id);
    return (
      <button key={id} type="button" className="puzzle-card" onClick={() => startPuzzle(id)}>
        <MiniBoard fen={preset.fen} />
        <span className="puzzle-card__text">
          <strong>{t(`preset.${id}`)}</strong>
          <span>{t(`preset.${id}.goal`)}</span>
          <span className={`puzzle-card__status ${state.tone}`}>{state.text}</span>
        </span>
      </button>
    );
  };
  const openOther = (pick: "chess960" | "custom") => {
    setMode("positions");
    setPositionPick(pick);
    setView("play");
  };

  return (
    <div className="puzzles">
      <header className="puzzles__head">
        <div className="puzzles__title">
          <img src="icons/nav/puzzles.webp" alt="" />
          <div><h1>{t("nav.puzzles")}</h1><p>{t("puzzles.lead")}</p></div>
        </div>
        <dl className="puzzles__stats">
          <div className="puzzle-stat">
            <img src="icons/puzzles/rating.webp" alt="" />
            <dt>{t("puzzles.rating")}</dt>
            <dd><strong>{rating}</strong>{change !== 0 && <span className={change > 0 ? "is-up" : "is-down"}>{change > 0 ? "+" : ""}{change}</span>}</dd>
          </div>
          <div className="puzzle-stat">
            <img src="icons/puzzles/streak.webp" alt="" />
            <dt>{t("puzzles.streak")}</dt>
            <dd><strong>{currentStreak}</strong><span>{tn("puzzles.days", currentStreak)}</span></dd>
          </div>
          <div className="puzzle-stat">
            <img src="icons/puzzles/mate.webp" alt="" />
            <dt>{t("puzzles.solvedTotal")}</dt>
            <dd><strong>{solvedTotal}</strong></dd>
          </div>
        </dl>
      </header>

      <section className="puzzles__top">
        <div className="puzzle-daily">
          <MiniBoard fen={daily.fen} />
          <div className="puzzle-daily__text">
            <span className="puzzle-daily__label">{t("puzzles.daily")}</span>
            <h2>{t(`drill.theme.${daily.theme}`)}</h2>
            <p>{t(daily.mateIn === 1 ? "drill.mate1" : "drill.mate2", { side: t(`side.${dailySide}`) })} · {t("drill.puzzleRating", { rating: daily.rating })}</p>
            <button type="button" className="btn btn--green btn--big" onClick={() => startDrill("daily")}>{dailyDone ? t("puzzles.again") : t("puzzles.solve")}</button>
            <p className="puzzle-daily__next">{dailyDone ? t("puzzles.dailyDone", { time: clock(untilTomorrow(now)) }) : t("puzzles.dailyLeft", { time: clock(untilTomorrow(now)) })}</p>
            <ol className="puzzle-week" aria-label={t("puzzles.week")}>
              {week.map((day) => {
                const done = days.includes(day);
                const date = new Date(day * 864e5);
                return (
                  <li key={day} className={`${done ? "is-done" : ""}${day === today ? " is-today" : ""}`} title={date.toLocaleDateString(formatLocale(), { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}>
                    <span>{date.toLocaleDateString(formatLocale(), { weekday: "short", timeZone: "UTC" })}</span>
                    <i aria-label={done ? t("puzzles.dayDone") : t("puzzles.dayOpen")}>
                      {done && <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                    </i>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
        <div className="puzzle-rush">
          <img src="icons/puzzles/rush.webp" alt="" />
          <h2>{t("drill.rush")}</h2>
          <p>{t("puzzles.rushLead", { lives: RUSH_LIVES })}</p>
          <p className="puzzle-rush__best">{rushBest ? t("puzzles.rushBest", { best: rushBest }) : t("puzzles.rushNone")}</p>
          <button type="button" className="puzzle-rush__start" onClick={() => startDrill("rush")}>{t("puzzles.rushStart")}</button>
        </div>
      </section>

      <section className="puzzles__group">
        <h2>{t("puzzles.themes")}</h2>
        <div className="theme-grid">
          {THEMES.filter((theme) => themePuzzles(theme).length).map((theme) => {
            const list = themePuzzles(theme);
            const solved = list.filter((item) => bankSolved.includes(item.id)).length;
            const sample = [...list].sort((a, b) => a.rating - b.rating)[0];
            return (
              <button key={theme} type="button" className="theme-card" onClick={() => startDrill("theme", theme)}>
                <MiniBoard fen={sample.fen} />
                <span className="theme-card__text">
                  <strong>{t(`drill.theme.${theme}`)}</strong>
                  <span>{t("puzzles.themeCount", { solved, total: list.length })}</span>
                  <span className="theme-card__bar" aria-hidden="true"><i style={{ width: `${(solved / list.length) * 100}%` }} /></span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="puzzles__group">
        <h2>{t("positions.puzzles")}</h2>
        <div className="puzzle-grid">{PRESETS.filter((preset) => preset.group === "puzzle").map((preset) => card(preset.id))}</div>
      </section>
      <section className="puzzles__group">
        <h2>{t("positions.endgames")}</h2>
        <div className="puzzle-grid">{endgames.map((preset) => card(preset.id))}</div>
      </section>

      <section className="puzzles__group">
        <h2>{t("puzzles.badges", { earned: badges.filter((badge) => badge.earned).length, total: badges.length })}</h2>
        <ul className="badges">
          {badges.map((badge) => (
            <li key={badge.id} className={badge.earned ? "is-earned" : ""}>
              <img src={`icons/puzzles/${badge.icon}.webp`} alt="" />
              <strong>{t(`badge.${badge.id}`)}</strong>
              <span>{t(badge.earned ? "badge.earned" : `badge.${badge.id}.how`)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="puzzle-other">
        <div>
          <h2>{t("puzzles.otherTitle")}</h2>
          <p>{t("puzzles.otherLead")}</p>
        </div>
        <button type="button" className="puzzle-other__item" onClick={() => openOther("chess960")}>
          <strong>Chess960</strong><span>{t("puzzles.chess960")}</span>
        </button>
        <button type="button" className="puzzle-other__item" onClick={() => openOther("custom")}>
          <strong>{t("positions.custom")}</strong><span>{t("positions.fenHint")}</span>
        </button>
      </section>
    </div>
  );
}
