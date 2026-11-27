import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { CHAOS_EFFECTS, type ChaosEffectId } from "@/engine/chaos";
import { CHAOS_TASTE, getOpponent, OPPONENTS, type ChaosCharacterId, type OpponentId } from "@/ai/bots";
import { BotPortrait } from "@/components/BotPortrait";
import { KingIcon, SIDES } from "@/components/play/BotSelect";
import { useHistoryStore } from "@/state/history";
import { TIME_OPTIONS, useUiStore } from "@/state/ui";
import { startGame } from "@/game/session";
import { resumeAudio } from "@/sounds";
import { ChaosCard, ChaosMiniCard, Sigil } from "./ChaosCard";
import { CATEGORY, effectName, type ChaosCategory } from "./meta";
import { t, useTranslation } from "@/i18n";

const BOTS = OPPONENTS.filter((opponent) => opponent.kind === "chaos");
const CATEGORIES: ChaosCategory[] = ["arcane", "battle", "time", "fate"];
/** Three real cards for the how-it-works strip, one of each kind of duration. */
const SAMPLE: ChaosEffectId[] = ["knight_forge", "hourglass", "phoenix_piece"];

/**
 * The Chaos Chess menu: its own opponents (each with a favourite kind of card), the game's colour
 * and clock, how a draft works, and the whole deck to browse.
 */
export function ChaosPage() {
  useTranslation();
  const chaosOpponent = useUiStore((s) => s.chaosOpponent);
  const chooseChaos = useUiStore((s) => s.chooseChaos);
  const side = useUiStore((s) => s.side);
  const setSide = useUiStore((s) => s.setSide);
  const timeId = useUiStore((s) => s.timeId);
  const setTimeId = useUiStore((s) => s.setTimeId);
  const games = useHistoryStore((s) => s.games);
  const [filter, setFilter] = useState<ChaosCategory | null>(null);
  const [shown, setShown] = useState<ChaosEffectId | null>(null);

  const chaosGames = useMemo(() => games.filter((game) => game.kind === "chaos"), [games]);
  const record = (id: OpponentId | null) => {
    const list = id ? chaosGames.filter((game) => game.opponentId === id) : chaosGames;
    return { w: list.filter((g) => g.outcome === "w").length, d: list.filter((g) => g.outcome === "d").length, l: list.filter((g) => g.outcome === "l").length, n: list.length };
  };
  const total = record(null);
  const bot = getOpponent(chaosOpponent);
  const greeting = useMemo(() => Math.floor(Math.random() * 3), [chaosOpponent]);
  const deck = filter ? CHAOS_EFFECTS.filter((item) => item.category === filter) : CHAOS_EFFECTS;

  const play = () => {
    resumeAudio();
    useUiStore.getState().setMode("chaos");
    startGame();
  };

  return (
    <div className="chaos-page">
      <header className="chaos-hero">
        <img className="chaos-hero__art" src="chaos/hero.webp" alt="" />
        <div className="chaos-hero__text">
          <h1>Chaos Chess</h1>
          <p>{t("chaosPage.lead")}</p>
          {total.n > 0 && <p className="chaos-hero__record">{t("chaosPage.record", { w: total.w, d: total.d, l: total.l })}</p>}
        </div>
      </header>

      <div className="chaos-page__main">
        <section className="chaos-rivals" aria-labelledby="chaos-rivals">
          <h2 id="chaos-rivals">{t("chaosPage.rivals")}</h2>
          <div className="chaos-rivals__grid" role="radiogroup" aria-labelledby="chaos-rivals">
            {BOTS.map((rival) => {
              const taste = CHAOS_TASTE[rival.id as ChaosCharacterId];
              const mine = record(rival.id);
              const selected = rival.id === chaosOpponent;
              return (
                <button
                  key={rival.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={`chaos-rival${selected ? " is-selected" : ""}`}
                  onClick={() => chooseChaos(rival.id)}
                >
                  <span className="chaos-rival__art" style={{ background: rival.tint }}><BotPortrait id={rival.id} /></span>
                  <span className="chaos-rival__name"><strong>{rival.name}</strong><span>{rival.rating}</span></span>
                  <span className="chaos-rival__short">{rival.short}</span>
                  <span className="chaos-rival__taste" style={taste.favorite ? { color: CATEGORY[taste.favorite].color } : undefined}>
                    <Sigil kind={taste.favorite ?? "chaos"} />
                    <span>{t(taste.favorite ? `chaosPage.taste.${taste.favorite}` : "chaosPage.taste.best")}</span>
                  </span>
                  {mine.n > 0 && <span className="chaos-rival__record">{t("chaosPage.vs", { w: mine.w, d: mine.d, l: mine.l })}</span>}
                </button>
              );
            })}
          </div>
        </section>

        <aside className="chaos-setup" aria-label={t("chaosPage.setup")}>
          <div className="chaos-setup__who">
            <span className="chaos-setup__portrait" style={{ background: bot.tint }}><BotPortrait id={bot.id} /></span>
            <div>
              <strong>{bot.name} <span>{bot.rating}</span></strong>
              <div className="speech"><p>{bot.text.greetings[greeting]}</p></div>
            </div>
          </div>
          <p className="chaos-setup__about">{bot.description}</p>
          <div className="chaos-setup__row">
            <span>{t("select.playAs")}</span>
            <div className="side-pick" role="radiogroup" aria-label={t("select.colorAria")}>
              {SIDES.map((item) => (
                <button key={item} type="button" role="radio" aria-checked={side === item} className={side === item ? "is-selected" : ""} onClick={() => setSide(item)} title={t(`side.${item}`)} aria-label={t(`side.${item}`)}>
                  <KingIcon side={item} />
                </button>
              ))}
            </div>
          </div>
          <label className="select chaos-setup__row">
            <span>{t("select.time")}</span>
            <select value={timeId} onChange={(event) => setTimeId(event.target.value)}>
              {TIME_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.id === "none" ? t("time.none") : option.label}</option>)}
            </select>
          </label>
          <button type="button" className="chaos-setup__play" onClick={play}>{t("chaosPage.play", { name: bot.name })}</button>
        </aside>
      </div>

      <section className="chaos-how" aria-labelledby="chaos-how">
        <div className="chaos-how__cards" aria-hidden="true">
          {SAMPLE.map((id, i) => (
            <ChaosMiniCard key={id} id={id} className="chaos-how__card" style={{ "--tilt": `${(i - 1) * 9}deg`, "--shift": `${(i - 1) * 46}%` } as CSSProperties} />
          ))}
        </div>
        <div>
          <h2 id="chaos-how">{t("chaosPage.howTitle")}</h2>
          <ol className="chaos-how__steps">
            <li><strong>{t("chaosPage.how1")}</strong> {t("chaosPage.how1Text")}</li>
            <li><strong>{t("chaosPage.how2")}</strong> {t("chaosPage.how2Text")}</li>
            <li><strong>{t("chaosPage.how3")}</strong> {t("chaosPage.how3Text")}</li>
          </ol>
        </div>
      </section>

      <section className="chaos-deck" aria-labelledby="chaos-deck">
        <div className="chaos-deck__head">
          <h2 id="chaos-deck">{t("chaosPage.deck", { n: CHAOS_EFFECTS.length })}</h2>
          <div className="segmented" role="radiogroup" aria-label={t("chaosPage.filter")}>
            <button type="button" role="radio" aria-checked={filter === null} className={filter === null ? "is-selected" : ""} onClick={() => setFilter(null)}>{t("stats.all")}</button>
            {CATEGORIES.map((category) => (
              <button key={category} type="button" role="radio" aria-checked={filter === category} className={filter === category ? "is-selected" : ""} onClick={() => setFilter(category)}>
                <Sigil kind={category} />{t(`chaos.cat.${category}`)}
              </button>
            ))}
          </div>
        </div>
        <div className="chaos-deck__grid">
          {deck.map((item) => (
            <button key={item.id} type="button" className="deck-card" onClick={() => setShown(item.id)} aria-label={effectName(item.id)}>
              <ChaosMiniCard id={item.id} tag />
            </button>
          ))}
        </div>
      </section>

      {shown && <CardDialog id={shown} onClose={() => setShown(null)} />}
    </div>
  );
}

/** One card at full size, read-only, over the page. */
function CardDialog({ id, onClose }: { id: ChaosEffectId; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="card-dialog" role="dialog" aria-modal="true" aria-label={effectName(id)} onClick={onClose}>
      <div onClick={(event) => event.stopPropagation()}>
        <ChaosCard id={id} selected onSelect={onClose} />
        <button type="button" className="btn" onClick={onClose}>{t("chaosPage.close")}</button>
      </div>
    </div>
  );
}
