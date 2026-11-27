import type { ActiveChaosEffect } from "@/engine/chaos";
import type { PieceMark } from "@/engine/chaos-marks";
import type { PieceColor, Square } from "@/engine/types";
import { useGameStore } from "@/state/game";
import { categoryColor, effectIcon, effectLeft, effectName, effectTag, effectText } from "./meta";
import { t } from "@/i18n";

type Active = Record<PieceColor, ActiveChaosEffect[]>;

/** Squares a Cursed Square card marked, with the card. */
export function cursedSquares(active: Active): Map<Square, ActiveChaosEffect> {
  const out = new Map<Square, ActiveChaosEffect>();
  for (const item of [...active.w, ...active.b]) if (item.markedSquare) out.set(item.markedSquare, item);
  return out;
}

/** Files a Frozen File card marked, with the card. */
export function frozenFiles(active: Active): Map<string, ActiveChaosEffect> {
  const out = new Map<string, ActiveChaosEffect>();
  for (const item of [...active.w, ...active.b]) if (item.markedFile) out.set(item.markedFile, item);
  return out;
}

/** The story of a square, on hover: the piece an effect made, or the curse lying on it. */
export function ChaosSquareTip({ square, mark, curse, below, edge }: {
  square: Square;
  mark?: PieceMark;
  curse?: ActiveChaosEffect;
  below: boolean;
  edge: "left" | "right" | null;
}) {
  const players = useGameStore((s) => s.players);
  const name = (side: PieceColor) => players[side]?.username ?? t(`side.${side}`);
  const place = `fx-tip fx-tip--square${below ? " is-below" : ""}${edge ? ` is-${edge}` : ""}`;
  return (
    <>
      {curse && <img className="square__curse" src={effectIcon(curse.effectId)} alt="" />}
      <span className={place} role="tooltip">
        {mark && (
          <span className="fx-tip__part">
            <strong>{t(`chaos.variant.${mark.variant}`)} · {square}</strong>
            <span className="fx-tip__tag" style={{ color: categoryColor(mark.effectId) }}>
              {effectName(mark.effectId)} · {name(mark.owner)}
            </span>
            {t(`chaos.variantText.${mark.variant}`, { move: Math.max(1, Math.ceil(mark.ply / 2)) })}
          </span>
        )}
        {curse && (
          <span className="fx-tip__part">
            <strong>{effectName(curse.effectId)} · {square}</strong>
            <span className="fx-tip__tag" style={{ color: categoryColor(curse.effectId) }}>{effectTag(curse.effectId)} · {name(curse.owner)}</span>
            {effectText(curse.effectId)}
            <span className="fx-tip__left">{effectLeft(curse)}</span>
          </span>
        )}
      </span>
    </>
  );
}
