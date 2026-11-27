import { useEffect, useRef, useState } from "react";
import { CHAOS_EFFECTS, getChaosTargetCount, type ChaosEffectId } from "@/engine/chaos";
import { useGameStore } from "@/state/game";
import { getOpponent } from "@/ai/bots";
import { BotPortrait } from "@/components/BotPortrait";
import { ChaosCard, PlayedCard } from "./ChaosCard";
import { effectIcon, effectName } from "./meta";
import { t, tn, useTranslation } from "@/i18n";

const FAN = [-7, 0, 7];

/**
 * The Chaos draft: the game stops and the chooser draws one of three cards. The player sees the
 * three cards as a hand, the deck beside it and the opponent's card from this round; while a bot
 * chooses, its three cards lie face down.
 */
export function DraftOverlay() {
  useTranslation();
  const draft = useGameStore((s) => s.chaos.draft);
  const pending = useGameStore((s) => s.chaos.pendingChoice);
  const history = useGameStore((s) => s.chaos.history);
  const picked = useGameStore((s) => s.chaos.pickedEffectIds);
  const seats = useGameStore((s) => s.seats);
  const players = useGameStore((s) => s.players);
  const phase = useGameStore((s) => s.phase);
  const viewPly = useGameStore((s) => s.viewPly);
  const choose = useGameStore((s) => s.chooseChaosEffect);
  const [index, setIndex] = useState(1);
  const handRef = useRef<HTMLDivElement | null>(null);

  // Every new hand starts on its middle card.
  useEffect(() => setIndex(1), [draft?.round, draft?.chooser]);

  const human = !!draft && !seats[draft.chooser];
  const open = !!draft && !pending && phase === "playing" && viewPly === null;

  // On a phone the hand scrolls sideways: keep the chosen card in view.
  useEffect(() => {
    const card = handRef.current?.children[index] as HTMLElement | undefined;
    card?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [index, open]);

  useEffect(() => {
    if (!open || !human || !draft) return;
    const onKey = (event: KeyboardEvent) => {
      const number = Number(event.key);
      if (number >= 1 && number <= draft.options.length) setIndex(number - 1);
      else if (event.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
      else if (event.key === "ArrowRight") setIndex((i) => Math.min(draft.options.length - 1, i + 1));
      // Enter on a focused card is that button's own click.
      else if (event.key === "Enter" && !(event.target instanceof HTMLButtonElement)) choose(draft.options[Math.min(index, draft.options.length - 1)]);
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, human, draft, index, choose]);

  if (!open || !draft) return null;

  const chooser = draft.chooser;
  const seat = seats[chooser];
  const name = players[chooser]?.username ?? t(`side.${chooser}`);
  const other = chooser === "w" ? "b" : "w";
  const deck = CHAOS_EFFECTS.length - picked[chooser].length;
  // The opponent's card from this round, if they chose first.
  const theirs = [...history].reverse().find((entry) => entry.kind === "picked" && entry.owner === other);
  const theirsThisRound = theirs && draft.remainingChoosers.length === 0 ? theirs.effectId : null;
  const current = draft.options[Math.min(index, draft.options.length - 1)];

  return (
    <div className="draft" role="dialog" aria-modal="true" aria-labelledby="draft-title">
      <p className="draft__status" role="status">{t("chaos.paused", { round: draft.round })}</p>
      <div className="draft__title">
        {seat ? (
          <span className="draft__who" style={{ background: getOpponent(seat.id).tint }}><BotPortrait id={seat.id} /></span>
        ) : (
          <img className="draft__who draft__who--deck" src="chaos/card_back.webp" alt="" />
        )}
        <h1 id="draft-title">{seat ? t("chaos.botDrawing", { name }) : t("chaos.draw")}</h1>
      </div>

      <div className="draft__table">
        <div className="draft__side draft__side--deck">
          <span className="draft__deck" aria-hidden="true">
            <i /><i />
            <span><img src="chaos/card_back.webp" alt="" draggable={false} /></span>
          </span>
          <span>{tn("chaos.deck", deck)}</span>
        </div>

        {human ? (
          <div className="draft__hand" role="radiogroup" aria-label={t("chaos.cards")} ref={handRef}>
            {draft.options.map((id: ChaosEffectId, i) => (
              <ChaosCard
                key={id}
                id={id}
                hotkey={String(i + 1)}
                selected={i === index}
                onSelect={() => (i === index ? choose(id) : setIndex(i))}
                // Keyboard focus picks the card; a mouse click selects first and plays on the second click.
                onFocus={(event) => { if (event.currentTarget.matches(":focus-visible")) setIndex(i); }}
                style={{ "--fan": `${FAN[i] ?? 0}deg`, "--drop": i === 1 ? "0px" : "18px" } as React.CSSProperties}
              />
            ))}
          </div>
        ) : (
          <div className="draft__hand draft__hand--hidden" aria-label={t("chaos.botThinking", { name })}>
            {draft.options.map((id, i) => (
              <span key={id} className="draft__back" style={{ "--fan": `${FAN[i] ?? 0}deg`, "--drop": i === 1 ? "0px" : "18px" } as React.CSSProperties}>
                <img src="chaos/card_back.webp" alt="" draggable={false} />
              </span>
            ))}
          </div>
        )}

        <div className="draft__side draft__side--played">
          {theirsThisRound ? (
            <>
              <PlayedCard id={theirsThisRound} />
              <span>{t("chaos.theyPlayed", { name: players[other]?.username ?? t(`side.${other}`) })}</span>
            </>
          ) : null}
        </div>
      </div>

      {human && (
        <div className="draft__actions">
          <span>{t("chaos.keys")}</span>
          <button type="button" className="draft__play" onClick={() => choose(current)}>{t("chaos.play", { name: effectName(current) })}</button>
        </div>
      )}
    </div>
  );
}

/** What to point at for each step of a targeted card. */
const PROMPTS: Partial<Record<ChaosEffectId, string[]>> = {
  blink: ["piece", "square"],
  gravity_well: ["piece", "center"],
  knight_forge: ["forge"],
  bishop_forge: ["forge"],
  rook_forge: ["forge"],
  queens_gambit: ["sacrifice"],
  blood_price: ["sacrifice"],
  tactical_reset: ["first", "second"],
  chaos_swap: ["own", "enemy"],
};

/** While a card waits for its square: what to point at, and the way back to the hand. */
export function TargetBanner() {
  useTranslation();
  const pending = useGameStore((s) => s.chaos.pendingChoice);
  const cancel = useGameStore((s) => s.cancelChaosTarget);
  if (!pending) return null;
  const steps = getChaosTargetCount(pending.effectId);
  const step = pending.selectedSquares.length;
  const prompt = PROMPTS[pending.effectId]?.[step] ?? "piece";
  return (
    <div className="target-banner" role="status">
      <img src={effectIcon(pending.effectId)} alt="" />
      <span className="target-banner__text">
        <strong>{effectName(pending.effectId)}</strong>
        <span>{t(`chaos.target.${prompt}`)}{steps > 1 ? ` · ${step + 1}/${steps}` : ""}</span>
      </span>
      <button type="button" className="btn" onClick={cancel}>{t("chaos.backToCards")}</button>
    </div>
  );
}
