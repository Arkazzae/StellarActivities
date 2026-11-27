import type { CSSProperties, FocusEvent } from "react";
import type { ChaosEffectId } from "@/engine/chaos";
import { CATEGORY, RARITY, cardNumber, durationText, effect, effectIcon, effectName, effectTag, effectText, type ChaosCategory } from "./meta";

/** The card's picture: its illustration from the deck. */
export function CardArt({ id, className }: { id: ChaosEffectId; className: string }) {
  return <img className={className} src={effectIcon(id)} alt="" draggable={false} />;
}

/** A category's sigil, drawn in one line weight: arcane star, crossed blades, hourglass, eye of fate; or the void portal. */
export function Sigil({ kind, className = "sigil" }: { kind: ChaosCategory | "chaos"; className?: string }) {
  const paths: Record<typeof kind, string> = {
    arcane: "M12 2.8 13.9 10.1 21.2 12 13.9 13.9 12 21.2 10.1 13.9 2.8 12 10.1 10.1Z",
    battle: "M5 4.5 15.5 15M19 4.5 8.5 15M13 17.5l4.5-4.5M6.5 13l4.5 4.5M16.2 16.2l2.8 2.8M7.8 16.2 5 19",
    time: "M7 3.5h10M7 20.5h10M8 3.5c0 4.5 4 6 4 8.5s-4 4-4 8.5M16 3.5c0 4.5-4 6-4 8.5s4 4 4 8.5M10 18h4",
    fate: "M2.8 12s3.4-6 9.2-6 9.2 6 9.2 6-3.4 6-9.2 6-9.2-6-9.2-6ZM12 9.4a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2Z",
    chaos: "M12 3.2a8.8 8.8 0 1 0 0 17.6 8.8 8.8 0 0 0 0-17.6ZM12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8ZM12 3.2v2.4M12 18.4v2.4",
  };
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d={paths[kind]} />
    </svg>
  );
}

/** The card's colours as custom properties: the category accent and the rarity's edge. */
export function cardStyle(id: ChaosEffectId, extra?: CSSProperties): CSSProperties {
  const definition = effect(id);
  const { color, deep } = CATEGORY[definition.category];
  const rarity = RARITY[definition.rarity];
  return { "--accent": color, "--accent-deep": deep, "--edge": rarity.edge, "--rarity": rarity.label, ...extra } as CSSProperties;
}

/**
 * A card from the Chaos deck, 5 : 7, in Multiversal Chess's look: a dark plum card whose
 * illustration fades into the text, the category as a sigil and an accent, the rarity as the metal
 * of the edge.
 */
export function ChaosCard({ id, hotkey, selected, onSelect, onFocus, style }: {
  id: ChaosEffectId;
  hotkey?: string;
  selected?: boolean;
  onSelect?: () => void;
  onFocus?: (event: FocusEvent<HTMLButtonElement>) => void;
  style?: CSSProperties;
}) {
  const definition = effect(id);
  return (
    <button
      type="button"
      role="radio"
      aria-checked={!!selected}
      className={`chaos-card is-${definition.rarity}${selected ? " is-selected" : ""}`}
      onClick={onSelect}
      onFocus={onFocus}
      style={cardStyle(id, style)}
    >
      <span className="chaos-card__art"><CardArt id={id} className="chaos-card__img" /></span>
      <span className="chaos-card__body">
        <span className="chaos-card__type">
          <Sigil kind={definition.category} />
          <span>{effectTag(id)}</span>
        </span>
        <strong className="chaos-card__name">{effectName(id)}</strong>
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

/** A small face-up card: the illustration and the name (the opponent's card, the deck, the fan). */
export function ChaosMiniCard({ id, className = "", style, tag = false }: { id: ChaosEffectId; className?: string; style?: CSSProperties; tag?: boolean }) {
  const definition = effect(id);
  return (
    <span className={`card-face is-${definition.rarity}${className ? ` ${className}` : ""}`} style={cardStyle(id, style)}>
      <CardArt id={id} className="card-face__img" />
      <span className="card-face__body">
        <Sigil kind={definition.category} />
        <strong>{effectName(id)}</strong>
        {tag && <span className="card-face__tag">{effectTag(id)}</span>}
      </span>
    </span>
  );
}

/** The opponent's card from this round, with its text. */
export function PlayedCard({ id }: { id: ChaosEffectId }) {
  const definition = effect(id);
  return (
    <span className={`card-face card-face--played is-${definition.rarity}`} style={cardStyle(id)}>
      <CardArt id={id} className="card-face__img" />
      <span className="card-face__body">
        <Sigil kind={definition.category} />
        <strong>{effectName(id)}</strong>
        <span>{effectText(id)}</span>
      </span>
    </span>
  );
}
