import type { CSSProperties } from "react";
import type { ChaosEffectId } from "@/engine/chaos";
import {
  CATEGORY,
  RARITY,
  cardNumber,
  categoryIcon,
  durationText,
  effect,
  effectArt,
  effectIcon,
  effectName,
  effectTag,
  effectText,
} from "./meta";
import { t } from "@/i18n";

/** The card's picture: its illustration, or its icon on the category colour when it has none. */
export function CardArt({ id, className }: { id: ChaosEffectId; className: string }) {
  const art = effectArt(id);
  if (art) return <img className={className} src={art} alt="" draggable={false} />;
  const { color, deep } = CATEGORY[effect(id).category];
  return (
    <span className={`${className} card-art--icon`} style={{ background: `radial-gradient(circle at 50% 45%, ${color}55, ${deep}aa 70%)` }}>
      <img src={effectIcon(id)} alt="" draggable={false} />
    </span>
  );
}

/** A full-size playing card from the Chaos deck, 5 : 7. */
export function ChaosCard({ id, hotkey, selected, onSelect, onFocus, style }: {
  id: ChaosEffectId;
  hotkey?: string;
  selected?: boolean;
  onSelect?: () => void;
  onFocus?: (event: React.FocusEvent<HTMLButtonElement>) => void;
  style?: CSSProperties;
}) {
  const definition = effect(id);
  const { color, deep, band } = CATEGORY[definition.category];
  const rarity = RARITY[definition.rarity];
  const kind = t(`chaos.kind.${definition.duration}`);
  return (
    <button
      type="button"
      role="radio"
      aria-checked={!!selected}
      className={`chaos-card${selected ? " is-selected" : ""}`}
      onClick={onSelect}
      onFocus={onFocus}
      style={{ "--card": color, "--card-deep": deep, "--card-band": band, "--card-inner": rarity.inner, ...style } as CSSProperties}
    >
      <span className="chaos-card__face">
        <span className="chaos-card__head">
          <img src={effectIcon(id)} alt="" draggable={false} />
          <strong>{effectName(id)}</strong>
          <span className="chaos-card__gems" aria-label={t(`chaos.rarity.${definition.rarity}`)}>
            {Array.from({ length: rarity.gems }, (_, i) => <i key={i} style={{ background: rarity.color, boxShadow: `0 0 6px ${rarity.color}` }} />)}
          </span>
        </span>
        <CardArt id={id} className="chaos-card__art" />
        <span className="chaos-card__band">
          <img src={categoryIcon(definition.category)} alt="" draggable={false} />
          <span>{effectTag(id)}</span>
          <span className="chaos-card__kind">{kind}</span>
        </span>
        <span className="chaos-card__text">{effectText(id)}</span>
        <span className="chaos-card__foot">
          <span>{durationText(id)}</span>
          <span>{cardNumber(id)}</span>
        </span>
      </span>
      {hotkey && <span className="chaos-card__key" aria-hidden="true">{hotkey}</span>}
    </button>
  );
}

/** A small face-up card: the one the opponent just played. */
export function ChaosMiniCard({ id }: { id: ChaosEffectId }) {
  const { color, deep } = CATEGORY[effect(id).category];
  return (
    <span className="chaos-played" style={{ "--card": color, "--card-deep": deep } as CSSProperties}>
      <span className="chaos-played__face">
        <strong>{effectName(id)}</strong>
        <CardArt id={id} className="chaos-played__art" />
        <span>{effectText(id)}</span>
      </span>
    </span>
  );
}
