import { useMemo, type CSSProperties } from "react";
import { BotPortrait } from "@/components/BotPortrait";
import { MiniBoard } from "@/components/play/PositionGallery";
import { ChaosMiniCard } from "@/components/chaos/ChaosCard";
import { OPPONENTS, type OpponentId } from "@/ai/bots";
import { hasBeaten, useStatsStore } from "@/state/stats";
import { useUiStore } from "@/state/ui";
import { RUSH_LIVES, useDrillStore } from "@/state/drill";
import { CHAOS_ENABLED } from "@/features";
import { dailyBankPuzzle } from "@/engine/puzzle-bank";
import type { ChaosEffectId } from "@/engine/chaos";
import { useTranslation } from "@/i18n";

const LADDER = OPPONENTS.filter((opponent) => opponent.kind === "character");
/** Three real cards from the Chaos deck, fanned. */
const CARDS: ChaosEffectId[] = ["knight_forge", "hourglass", "phoenix_piece"];

/**
 * The statistics page before the first game: no empty charts, but where to start. The next rung of
 * the ladder greets the player, the whole ladder lies ahead, and the puzzle of the day and Chaos Chess
 * wait beside it. Every picture is real: portraits, today's position, cards from the deck.
 */
export function StatsEmpty() {
  const { t } = useTranslation();
  const bots = useStatsStore((s) => s.bots);
  const setMode = useUiStore((s) => s.setMode);
  const setView = useUiStore((s) => s.setView);
  const choose = useUiStore((s) => s.choose);
  const startDrill = useDrillStore((s) => s.start);
  const next = LADDER.find((bot) => !hasBeaten(bots, bot.id)) ?? LADDER[LADDER.length - 1];
  const beaten = LADDER.filter((bot) => hasBeaten(bots, bot.id)).length;
  const greeting = useMemo(() => next.text.greetings[Math.floor(Math.random() * next.text.greetings.length)], [next]);
  const daily = dailyBankPuzzle();
  const dailySide = daily.fen.split(" ")[1] === "b" ? "b" : "w";

  const play = (id: OpponentId) => {
    setMode("vsBot");
    choose(id);
    setView("play");
  };

  return (
    <div className="stats stats--empty">
      <header className="stats__head">
        <div><h1>{t("stats.title")}</h1><p>{t("stats.emptyLead")}</p></div>
      </header>

      <section className="first-game">
        <div className="first-game__text">
          <h2>{t("stats.empty.title")}</h2>
          <p>{t("stats.empty.text")}</p>
          <p className="first-game__who">{t("stats.ladderNext", { name: next.name, rating: next.rating ?? "" })} · {next.short}</p>
          <div className="first-game__actions">
            <button type="button" className="btn btn--green btn--big" onClick={() => play(next.id)}>{t("stats.empty.play", { name: next.name })}</button>
            <button type="button" className="btn btn--big" onClick={() => setView("ladder")}>{t("stats.empty.allRivals")}</button>
          </div>
        </div>
        <div className="first-game__art" style={{ background: next.tint }}>
          <div className="speech first-game__speech"><p>{greeting}</p></div>
          <BotPortrait id={next.id} />
        </div>
      </section>

      <section className="ladder-path" aria-labelledby="ladder-path">
        <div className="ladder-path__head">
          <h2 id="ladder-path">{t("stats.empty.ladder", { beaten, total: LADDER.length })}</h2>
          <span>{t("stats.empty.ladderHint")}</span>
        </div>
        <ol>
          {LADDER.map((bot) => {
            const done = hasBeaten(bots, bot.id);
            const isNext = bot.id === next.id && !done;
            return (
              <li key={bot.id} className={`${done ? "is-done" : ""}${isNext ? " is-next" : ""}`}>
                <button type="button" onClick={() => play(bot.id)} title={`${bot.name} · ${bot.short}`}>
                  <span className="ladder-path__art" style={{ background: bot.tint }}><BotPortrait id={bot.id} /></span>
                  <strong>{bot.name}</strong>
                  <span>{isNext ? t("stats.empty.nextLabel") : bot.rating}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      <div className="first-steps">
        <section className="first-step">
          <MiniBoard fen={daily.fen} />
          <div>
            <h2>{t("stats.empty.warmup")}</h2>
            <p>{t("puzzles.daily")}: {t(daily.mateIn === 1 ? "drill.mate1" : "drill.mate2", { side: t(`side.${dailySide}`) })}</p>
            <button type="button" className="btn btn--green" onClick={() => startDrill("daily")}>{t("puzzles.solve")}</button>
          </div>
        </section>
        {CHAOS_ENABLED ? (
        <section className="first-step first-step--chaos">
            <div className="first-step__cards" aria-hidden="true">
              {CARDS.map((id, i) => (
                <ChaosMiniCard key={id} id={id} className="chaos-how__card" style={{ "--tilt": `${(i - 1) * 9}deg`, "--shift": `${(i - 1) * 34}%` } as CSSProperties} />
              ))}
            </div>
            <div>
              <h2>{t("stats.empty.chaos")}</h2>
              <p>{t("flyout.chaosNote")}</p>
              <button type="button" className="btn" onClick={() => setView("chaos")}>{t("stats.empty.chaosOpen")}</button>
            </div>
          </section>
        ) : (
          <section className="first-step first-step--rush">
            <img className="first-step__icon" src="icons/puzzles/rush.webp" alt="" />
            <div>
              <h2>{t("stats.empty.faster")}</h2>
              <p>{t("puzzles.rushLead", { lives: RUSH_LIVES })}</p>
              <button type="button" className="btn" onClick={() => startDrill("rush")}>{t("drill.rush")}</button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
