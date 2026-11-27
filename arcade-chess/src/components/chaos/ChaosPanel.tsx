import { useState } from "react";
import { CHAOS_DRAFT_INTERVAL, CHAOS_EFFECTS, type ActiveChaosEffect, type ChaosHistoryEntry } from "@/engine/chaos";
import { useGameStore } from "@/state/game";
import { getOpponent } from "@/ai/bots";
import { BotPortrait, PersonAvatar } from "@/components/BotPortrait";
import type { PieceColor } from "@/engine/types";
import { CardArt, Sigil, cardStyle } from "./ChaosCard";
import { categoryColor, effect, effectIcon, effectLeft, effectName, effectTag, effectText, turnPips } from "./meta";
import { t, tn, useTranslation } from "@/i18n";

/** "12" for White's move, "12…" for Black's: the ply an entry happened on. */
function moveLabel(ply: number): string {
  return ply % 2 === 1 ? String((ply + 1) / 2) : `${ply / 2}…`;
}

/** A side's active effects as icons beside its name, each explained on hover. */
export function EffectIcons({ side, below }: { side: PieceColor; below: boolean }) {
  useTranslation();
  const enabled = useGameStore((s) => s.chaos.enabled);
  const active = useGameStore((s) => s.chaos.activeEffects[side]);
  if (!enabled || !active.length) return null;
  return (
    <span className="fx-row">
      {active.map((item) => (
        <span key={item.instanceId} className="fx" tabIndex={0} aria-label={`${effectName(item.effectId)}: ${effectLeft(item)}`}>
          <img src={effectIcon(item.effectId)} alt="" />
          <EffectTip active={item} below={below} />
        </span>
      ))}
    </span>
  );
}

function EffectTip({ active, below }: { active: ActiveChaosEffect; below: boolean }) {
  return (
    <span className={`fx-tip${below ? " is-below" : ""}`} role="tooltip">
      <strong>{effectName(active.effectId)}</strong>
      <span className="fx-tip__tag" style={{ color: categoryColor(active.effectId) }}>{effectTag(active.effectId)}</span>
      {effectText(active.effectId)}
      <span className="fx-tip__left">{effectLeft(active)}{markText(active)}</span>
    </span>
  );
}

/** The square or file an effect marked, when it has one. */
function markText(active: ActiveChaosEffect): string {
  if (active.markedSquare) return ` · ${t("chaos.markedSquare", { square: active.markedSquare })}`;
  if (active.markedFile) return ` · ${t("chaos.markedFile", { file: active.markedFile })}`;
  return "";
}

export type ChaosTab = "chaos" | "moves";

/**
 * The top of a Chaos game's panel, in place of the usual title: the deck, when the next draft
 * comes, and the switch between the cards in play and the move list.
 */
export function ChaosHeader({ tab, onTab }: { tab: ChaosTab; onTab: (tab: ChaosTab) => void }) {
  useTranslation();
  const chaos = useGameStore((s) => s.chaos);
  const moves = useGameStore((s) => s.moves.length);
  const myColor = useGameStore((s) => s.myColor);
  const phase = useGameStore((s) => s.phase);
  const done = moves % CHAOS_DRAFT_INTERVAL;
  const nextPly = moves - done + CHAOS_DRAFT_INTERVAL;
  const left = CHAOS_DRAFT_INTERVAL - done;
  const deck = CHAOS_EFFECTS.length - chaos.pickedEffectIds[myColor ?? "w"].length;
  return (
    <header className="chaos-panel__head">
      <div className="chaos-panel__title">
        <img className="chaos-panel__deck" src="chaos/card_back.webp" alt="" />
        <h2>Chaos Chess</h2>
        <span>{tn("chaos.deck", deck)}</span>
      </div>
      {phase === "playing" && (
        <div className="chaos-panel__next">
          <div>
            <span>{chaos.draft ? t("chaos.drafting", { round: chaos.draft.round }) : t("chaos.nextDraft", { round: chaos.round + 1, move: nextPly / 2 })}</span>
            {!chaos.draft && <strong>{tn("chaos.inPlies", left)}</strong>}
          </div>
          <div className="chaos-panel__pips" aria-hidden="true">
            {Array.from({ length: CHAOS_DRAFT_INTERVAL }, (_, i) => <i key={i} className={chaos.draft || i < done ? "is-on" : ""} />)}
          </div>
        </div>
      )}
      <div className="chaos-panel__tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "chaos"} className={tab === "chaos" ? "is-active" : ""} onClick={() => onTab("chaos")}>{t("chaos.tabEffects")}</button>
        <button type="button" role="tab" aria-selected={tab === "moves"} className={tab === "moves" ? "is-active" : ""} onClick={() => onTab("moves")}>{t("chaos.tabMoves", { n: Math.ceil(moves / 2) })}</button>
      </div>
    </header>
  );
}

/** The cards each side has in play, the one picked explained, and the chronicle. Scrolls on its own. */
export function ChaosBody() {
  useTranslation();
  const chaos = useGameStore((s) => s.chaos);
  const players = useGameStore((s) => s.players);
  const seats = useGameStore((s) => s.seats);
  const flipped = useGameStore((s) => s.flipped);
  const [picked, setPicked] = useState<string | null>(null);

  const sides: PieceColor[] = flipped ? ["w", "b"] : ["b", "w"];
  const all = [...chaos.activeEffects.w, ...chaos.activeEffects.b];
  const detail = all.find((item) => item.instanceId === picked)
    ?? [...all].sort((a, b) => b.acquiredAtMove - a.acquiredAtMove)[0]
    ?? null;
  const name = (side: PieceColor) => players[side]?.username ?? t(`side.${side}`);

  return (
    <div className="chaos-panel">
      <div className="chaos-panel__effects">
        <h4>{t("chaos.active")}</h4>
        {sides.map((side) => {
          const seat = seats[side];
          const bot = seat ? getOpponent(seat.id) : null;
          const list = chaos.activeEffects[side];
          return (
            <div key={side} className="chaos-side">
              <div className="chaos-side__who">
                <span className="chaos-side__avatar" style={bot ? { background: bot.tint } : undefined}>
                  {bot ? <BotPortrait id={bot.id} /> : <PersonAvatar name={name(side)} url={players[side]?.avatarUrl ?? null} />}
                </span>
                <strong>{name(side)}</strong>
                <span>{t(`chaos.side.${side}`)}</span>
              </div>
              <div className="chaos-side__cards">
                {list.length ? list.map((item) => {
                  const pips = turnPips(item);
                  const definition = effect(item.effectId);
                  return (
                    <button
                      key={item.instanceId}
                      type="button"
                      className={`mini-card is-${definition.rarity}${detail?.instanceId === item.instanceId ? " is-selected" : ""}`}
                      aria-pressed={detail?.instanceId === item.instanceId}
                      onClick={() => setPicked(item.instanceId)}
                      style={cardStyle(item.effectId)}
                    >
                      <CardArt id={item.effectId} className="mini-card__img" />
                      <span className="mini-card__body">
                        <Sigil kind={definition.category} />
                        <strong>{effectName(item.effectId)}</strong>
                        <span className="mini-card__foot">
                          <span className="mini-card__pips">{pips.map((on, i) => <i key={i} className={on ? "is-on" : ""} />)}</span>
                          <b>{item.remainingTurns !== null ? `${item.remainingTurns}/${definition.turns ?? item.remainingTurns}` : item.charges !== null ? "1×" : "∞"}</b>
                        </span>
                      </span>
                    </button>
                  );
                }) : <p className="chaos-side__none">{t("chaos.none")}</p>}
              </div>
            </div>
          );
        })}
        {detail && (
          <div className="chaos-detail">
            <img src={effectIcon(detail.effectId)} alt="" />
            <span>
              <span className="chaos-detail__head">
                <strong>{effectName(detail.effectId)}</strong>
                <span style={{ color: categoryColor(detail.effectId) }}>{effectTag(detail.effectId)}</span>
              </span>
              <span className="chaos-detail__text">{effectText(detail.effectId)}</span>
              <span className="chaos-detail__status">
                {t("chaos.owner", { name: name(detail.owner) })} · {effectLeft(detail)}{markText(detail)}
                {(() => {
                  const fired = chaos.history.filter((entry) => entry.kind === "triggered" && entry.owner === detail.owner && entry.effectId === detail.effectId && entry.move >= detail.acquiredAtMove).length;
                  return fired ? ` · ${tn("chaos.fired", fired)}` : "";
                })()}
              </span>
            </span>
          </div>
        )}
      </div>
      <Chronicle history={chaos.history} name={name} />
    </div>
  );
}

type Row =
  | { kind: "draft"; key: string; ply: number; round: number; picks: ChaosHistoryEntry[] }
  | { kind: "triggered" | "expired"; key: string; ply: number; entry: ChaosHistoryEntry };

function Chronicle({ history, name }: { history: ChaosHistoryEntry[]; name: (side: PieceColor) => string }) {
  const rows: Row[] = [];
  let round = 0;
  for (const entry of history) {
    if (entry.kind === "picked") {
      const last = rows[rows.length - 1];
      if (last?.kind === "draft" && last.ply === entry.move) last.picks.push(entry);
      else rows.push({ kind: "draft", key: entry.id, ply: entry.move, round: ++round, picks: [entry] });
    } else {
      rows.push({ kind: entry.kind, key: entry.id, ply: entry.move, entry });
    }
  }
  return (
    <div className="chronicle">
      <h4>{t("chaos.chronicle")}</h4>
      {!rows.length && <p className="chronicle__empty">{t("chaos.chronicleEmpty", { move: CHAOS_DRAFT_INTERVAL / 2 })}</p>}
      <ol>
        {rows.reverse().map((row) => (
          <li key={row.key} className={`chronicle__row is-${row.kind}`}>
            <span className="chronicle__move">{row.kind === "draft" ? row.ply / 2 : moveLabel(row.ply)}</span>
            {row.kind === "draft" ? (
              <span className="chronicle__draft">
                <b>{t("chaos.round", { round: row.round })}</b>
                {row.picks.map((pick) => (
                  <span key={pick.id} className="chronicle__pick">
                    <img src={effectIcon(pick.effectId)} alt="" />
                    <span><span className="chronicle__who">{name(pick.owner)}</span> {effectName(pick.effectId)}</span>
                  </span>
                ))}
              </span>
            ) : (
              <span className="chronicle__event">
                <img src={effectIcon(row.entry.effectId)} alt="" />
                <span>
                  {row.kind === "expired" ? <s>{effectName(row.entry.effectId)}</s> : <b>{effectName(row.entry.effectId)}</b>}
                  {" · "}
                  {t(row.kind === "expired" ? "chaos.expired" : "chaos.triggered", { name: name(row.entry.owner) })}
                </span>
              </span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
