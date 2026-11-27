import { useMemo } from "react";
import { BotPortrait } from "@/components/BotPortrait";
import { useTranslation } from "@/i18n";
import { ENGINE_MOVE_TIMES, getOpponent, OPPONENTS, type EngineConfig, type Opponent, type OpponentId } from "@/ai/bots";
import { useSettingsStore } from "@/state/settings";
import { hasBeaten, useStatsStore } from "@/state/stats";
import { TIME_OPTIONS, useUiStore, type EngineSlot, type SideChoice } from "@/state/ui";
import { startGame, startPosition } from "@/game/session";
import { chosenStart } from "@/engine/positions";
import type { PieceColor } from "@/engine/types";
import { PositionGallery } from "./PositionGallery";

export const SIDES: SideChoice[] = ["w", "random", "b"];
const COLORS: PieceColor[] = ["w", "b"];
const LADDER = OPPONENTS.filter((opponent) => opponent.kind === "character");
const ENGINE = OPPONENTS.find((opponent) => opponent.kind === "engine")!;

export function KingIcon({ side }: { side: SideChoice }) {
  if (side === "random") {
    return (
      <span className="side-king side-king--random">
        <img src="pieces/wk.webp" alt="" />
        <img src="pieces/bk.webp" alt="" />
      </span>
    );
  }
  return <span className="side-king"><img src={`pieces/${side}k.webp`} alt="" /></span>;
}

function BotCard({ opponent, selected, subtitle, beaten, onSelect }: { opponent: Opponent; selected: boolean; subtitle: string; beaten: boolean; onSelect: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      className={`bot-card${selected ? " is-selected" : ""}${beaten ? " is-beaten" : ""}`}
      onClick={onSelect}
      title={`${opponent.name}: ${opponent.description}`}
    >
      <span className="bot-card__img" style={{ background: opponent.tint }}>
        <BotPortrait id={opponent.id} />
        {beaten && <span className="bot-card__badge" aria-label={t("home.beaten")}>✓</span>}
      </span>
      <span className="bot-card__name">{opponent.name}</span>
      <span className="bot-card__rating">{subtitle}</span>
    </button>
  );
}

/** Stockfish's strength for one place at the board: skill level, depth and time per move. */
function EngineSettings({ slot, config }: { slot: EngineSlot; config: EngineConfig }) {
  const setEngine = useUiStore((s) => s.setEngine);
  const { t } = useTranslation();
  return (
    <div className="engine-config">
      <label className="range">
        <span>{t("engine.skill")}</span>
        <input type="range" min={0} max={20} step={1} value={config.skill} onChange={(e) => setEngine(slot, { skill: Number(e.target.value) })} />
        <output>{config.skill}</output>
      </label>
      <label className="range">
        <span>{t("engine.depth")}</span>
        <input type="range" min={1} max={20} step={1} value={config.depth} onChange={(e) => setEngine(slot, { depth: Number(e.target.value) })} />
        <output>{config.depth}</output>
      </label>
      <label className="select">
        <span>{t("engine.time")}</span>
        <select value={config.moveTimeMs} onChange={(e) => setEngine(slot, { moveTimeMs: Number(e.target.value) })}>
          {ENGINE_MOVE_TIMES.map((ms) => <option key={ms} value={ms}>{t("engine.seconds", { s: ms / 1000 })}</option>)}
        </select>
      </label>
      <p className="bot-select__note">{t("engine.note")}</p>
    </div>
  );
}

/**
 * The pre-game screen: play a bot, pair two bots and watch, or play a position against a bot. The
 * same picker seats the opponent, or whichever side of the match is selected.
 */
export function BotSelect() {
  const mode = useUiStore((s) => s.mode);
  const opponentId = useUiStore((s) => s.opponent);
  const match = useUiStore((s) => s.match);
  const matchSide = useUiStore((s) => s.matchSide);
  const setMatchSide = useUiStore((s) => s.setMatchSide);
  const swapMatch = useUiStore((s) => s.swapMatch);
  const engine = useUiStore((s) => s.engine);
  const choose = useUiStore((s) => s.choose);
  const side = useUiStore((s) => s.side);
  const setSide = useUiStore((s) => s.setSide);
  const timeId = useUiStore((s) => s.timeId);
  const setTimeId = useUiStore((s) => s.setTimeId);
  const showEval = useUiStore((s) => s.showEval);
  const setShowEval = useUiStore((s) => s.setShowEval);
  const botChat = useSettingsStore((s) => s.botChat);
  const bots = useStatsStore((s) => s.bots);
  const positionPick = useUiStore((s) => s.positionPick);
  const chess960 = useUiStore((s) => s.chess960);
  const customFen = useUiStore((s) => s.customFen);
  const startOk = useMemo(() => chosenStart({ mode, positionPick, chess960, customFen }).ok, [mode, positionPick, chess960, customFen]);
  const { t } = useTranslation();

  const isMatch = mode === "match";
  const isPositions = mode === "positions";
  const slot: EngineSlot = isMatch ? matchSide : "vs";
  const selectedId: OpponentId = isMatch ? match[matchSide] : opponentId;
  const opponent = getOpponent(opponentId);
  const pair = COLORS.map((color) => getOpponent(match[color]));
  // A new greeting every time a different bot is picked.
  const greeting = useMemo(() => Math.floor(Math.random() * 3), [opponentId]);
  const subtitle = (bot: Opponent) => bot.kind === "engine"
    ? t("engine.summary", { skill: engine[slot].skill, depth: engine[slot].depth })
    : String(bot.rating);

  return (
    <div className="bot-select">
      <div className="bot-hero" title={isMatch ? undefined : opponent.description}>
        {isMatch ? (
          <div className="bot-hero__pair">
            {pair.map((bot, i) => (
              <span key={COLORS[i]} className="bot-hero__seat" style={{ background: bot.tint }}><BotPortrait id={bot.id} /></span>
            ))}
          </div>
        ) : (
          <div className="bot-hero__portrait" style={{ background: opponent.tint }}>
            <BotPortrait id={opponent.id} />
          </div>
        )}
        <div className="bot-hero__text">
          <div className="bot-hero__name">
            {isMatch
              ? <><strong>{pair[0].name}</strong> <span>vs</span> <strong>{pair[1].name}</strong></>
              : <><strong>{opponent.name}</strong> <span>{opponent.rating ?? opponent.short}</span></>}
          </div>
          {isMatch ? (
            <p className="bot-hero__about">{t("select.matchAbout")}</p>
          ) : botChat ? (
            <div className="speech"><p>{opponent.text.greetings[greeting]}</p></div>
          ) : (
            <p className="bot-hero__about">{opponent.short}</p>
          )}
        </div>
      </div>

      {isMatch && (
        <div className="bot-select__section">
          <h3>{t("select.matchTitle")}</h3>
          <div className="match-seats">
            {COLORS.map((color, i) => (
              <button
                key={color}
                type="button"
                aria-pressed={matchSide === color}
                className={`match-seat match-seat--${color}${matchSide === color ? " is-selected" : ""}`}
                onClick={() => setMatchSide(color)}
                title={t("select.seatTitle", { side: t(`side.${color}`) })}
              >
                <span className="match-seat__img" style={{ background: pair[i].tint }}><BotPortrait id={pair[i].id} /></span>
                <span className="match-seat__name">{pair[i].name}</span>
                <span className="match-seat__side"><img src={`pieces/${color}k.webp`} alt="" />{t(`side.${color}`)}</span>
              </button>
            ))}
            <button type="button" className="match-swap" onClick={swapMatch} title={t("select.swap")} aria-label={t("select.swap")}>⇄</button>
          </div>
          <p className="bot-select__note">{t("select.matchNote", { side: t(`side.${matchSide}`) })}</p>
        </div>
      )}

      {isPositions && <PositionGallery />}

      <div className="bot-select__section">
        <h3>{t(isPositions ? "positions.opponent" : "select.ladder")} <span className="model-subtitle">{t("select.ladderNote")}</span></h3>
        <div className="bot-grid" role="radiogroup" aria-label={t("select.ladder")}>
          {LADDER.map((item) => (
            <BotCard key={item.id} opponent={item} selected={item.id === selectedId} subtitle={subtitle(item)} beaten={hasBeaten(bots, item.id)} onSelect={() => choose(item.id)} />
          ))}
          <BotCard opponent={ENGINE} selected={selectedId === ENGINE.id} subtitle={subtitle(ENGINE)} beaten={hasBeaten(bots, ENGINE.id)} onSelect={() => choose(ENGINE.id)} />
        </div>
        {selectedId === "stockfish"
          ? <EngineSettings slot={slot} config={engine[slot]} />
          : <p className="bot-select__note">{getOpponent(selectedId).description}</p>}
      </div>

      {mode === "vsBot" && (
        <div className="bot-select__section">
          <h3>{t("select.playAs")}</h3>
          <div className="side-pick" role="radiogroup" aria-label={t("select.colorAria")}>
            {SIDES.map((item) => (
              <button key={item} type="button" role="radio" aria-checked={side === item} className={side === item ? "is-selected" : ""} onClick={() => setSide(item)} title={t(`side.${item}`)} aria-label={t(`side.${item}`)}>
                <KingIcon side={item} />
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="bot-select__section bot-select__row">
        {/* A position has no clock: it is a puzzle, not a race. */}
        {!isPositions && (
          <label className="select">
            <span>{t("select.time")}</span>
            <select value={timeId} onChange={(e) => setTimeId(e.target.value)}>
              {TIME_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.id === "none" ? t("time.none") : option.label}</option>)}
            </select>
          </label>
        )}
        <label className="toggle">
          <input type="checkbox" checked={showEval} onChange={(e) => setShowEval(e.target.checked)} />
          <span className="toggle__track" />
          <span>{t("settings.evalBar")}</span>
        </label>
      </div>

      <div className="bot-select__footer">
        {isPositions ? (
          <button type="button" className="btn-play" onClick={() => startPosition()} disabled={!startOk}>
            {t("positions.play", { name: opponent.name })}
          </button>
        ) : (
          <button type="button" className="btn-play" onClick={() => startGame()}>
            {t(isMatch ? "select.watch" : "select.play")}
          </button>
        )}
      </div>
    </div>
  );
}
