import { BotPortrait } from "@/components/BotPortrait";
import { getCharacter, OPPONENTS, type OpponentId } from "@/ai/bots";
import { hasBeaten, useStatsStore } from "@/state/stats";
import { useUiStore } from "@/state/ui";
import { useTranslation } from "@/i18n";

const LADDER = OPPONENTS.filter((opponent) => opponent.kind === "character");
const ENGINE = OPPONENTS.find((opponent) => opponent.kind === "engine")!;

/** The ladder: every bot with its rating and style, the ones beaten, and the next rung. */
export function LadderPage() {
  const { t } = useTranslation();
  const bots = useStatsStore((s) => s.bots);
  const setMode = useUiStore((s) => s.setMode);
  const setView = useUiStore((s) => s.setView);
  const choose = useUiStore((s) => s.choose);
  const beaten = LADDER.filter((bot) => hasBeaten(bots, bot.id)).length;
  const next = LADDER.find((bot) => !hasBeaten(bots, bot.id));

  const play = (id: OpponentId) => {
    setMode("vsBot");
    choose(id);
    setView("play");
  };

  return (
    <div className="ladder-page">
      <header className="stats__head">
        <div>
          <h1>{t("ladder.title")}</h1>
          <p>{t("ladder.lead")}</p>
        </div>
        <div className="ladder-page__progress">
          <span>{t("ladder.beaten")}</span>
          <strong>{t("stats.ladder", { beaten, total: LADDER.length })}</strong>
          <span className="ladder-page__meter"><i style={{ width: `${(beaten / LADDER.length) * 100}%` }} /></span>
        </div>
      </header>
      <div className="ladder-grid">
        {[...LADDER, ENGINE].map((bot) => {
          const record = bots[bot.id];
          const style = getCharacter(bot.id)?.style;
          return (
            <button key={bot.id} type="button" className={`ladder-card${next?.id === bot.id ? " is-next" : ""}`} onClick={() => play(bot.id)}>
              <span className="ladder-card__art" style={{ background: bot.tint }}>
                <BotPortrait id={bot.id} />
                {hasBeaten(bots, bot.id) && <span className="ladder-card__badge" aria-label={t("home.beaten")}>✓</span>}
              </span>
              <span className="ladder-card__name"><strong>{bot.name}</strong><span>{bot.rating ?? "0–20"}</span></span>
              <span className="ladder-card__short">{bot.short}</span>
              <span className="ladder-card__meta">
                {style ? t("ladder.depth", { depth: style.depth }) : t("ladder.engine")}
                {record ? ` · ${record.w}–${record.d}–${record.l}` : ""}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
