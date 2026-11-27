import type { CSSProperties } from "react";
import type { Key } from "../lib/i18n.ts";
import { useT } from "../lib/i18n.ts";
import { play } from "../lib/sfx.ts";
import { STAMPS, stampUrl } from "./common.tsx";
import { useGame, usePrefs } from "./context.ts";
import { Floaters } from "./Reveal.tsx";

type Spot = CSSProperties & Record<`--${string}`, string>;

/** Where each loose paper piece floats, how fast and how far it sways. */
const STARS: { tone: "lime" | "coral" | "navy"; style: Spot }[] = [
  { tone: "lime", style: { left: "16%", top: "70%", width: "clamp(34px, 6.5cqw, 58px)", "--t": "7.5s", "--d": "-1s", "--r": "-12deg", "--dr": "14deg" } },
  { tone: "coral", style: { right: "17%", top: "4%", width: "clamp(30px, 5.5cqw, 50px)", "--t": "6.2s", "--d": "-3s", "--r": "10deg", "--dr": "-12deg" } },
  { tone: "lime", style: { right: "3%", top: "46%", width: "clamp(22px, 4cqw, 36px)", "--t": "8.8s", "--d": "-5s", "--r": "4deg", "--dr": "18deg" } },
  { tone: "coral", style: { left: "4%", top: "40%", width: "clamp(20px, 3.6cqw, 32px)", "--t": "5.6s", "--d": "-2s", "--r": "-6deg", "--dr": "-16deg" } },
];

const STAMP_SPOTS: Spot[] = [
  { left: "20%", top: "2%", "--t": "6.8s", "--d": "-0.5s", "--r": "-10deg", "--dy": "-14px" },
  { right: "4%", top: "20%", "--t": "7.6s", "--d": "-2.4s", "--r": "9deg", "--dy": "-10px" },
  { left: "1%", top: "62%", "--t": "8.2s", "--d": "-4s", "--r": "6deg", "--dy": "-12px" },
  { right: "22%", bottom: "1%", "--t": "6.4s", "--d": "-1.6s", "--r": "-7deg", "--dy": "-16px" },
  { left: "27%", bottom: "0%", "--t": "7.2s", "--d": "-3.3s", "--r": "12deg", "--dy": "-11px" },
];

/**
 * The lobby's paper-cut stage: the animated drawing print in the middle, the game's own
 * cutouts floating around it. The reaction stickers are buttons: tapping one sends it to
 * everyone in the lobby.
 */
export function MenuStage() {
  const game = useGame();
  const t = useT();
  const { prefs } = usePrefs();
  return (
    <div className="stage">
      <div className="stage-print float" style={{ "--t": "11s", "--dy": "-7px", "--dr": "0.8deg" } as Spot}>
        {prefs.lessMotion ? (
          <img src="./artwork/menu-print.webp" alt="" />
        ) : (
          <video src="./artwork/menu-print.mp4" poster="./artwork/menu-print.webp" autoPlay muted loop playsInline aria-hidden="true" />
        )}
      </div>
      <img className="float prop prop-icon" src="./artwork/icon-v2.png" alt="" style={{ "--t": "6.6s", "--r": "-9deg", "--dr": "7deg", "--dy": "-14px" } as Spot} />
      <img className="float prop prop-notebook" src="./illustrations/countdown-notebook.webp" alt="" style={{ "--t": "9s", "--d": "-2s", "--r": "10deg", "--dr": "-5deg", "--dy": "-9px" } as Spot} />
      {STARS.map((star, i) => <span key={i} className={`float prop sticker-${star.tone}`} style={star.style} aria-hidden="true" />)}
      {STAMPS.map((stamp, i) => (
        <button
          key={stamp}
          type="button"
          className="float prop prop-stamp"
          style={STAMP_SPOTS[i]}
          aria-label={t(`stamp.${stamp}` as Key)}
          title={t(`stamp.${stamp}` as Key)}
          onClick={() => { play("pop"); game.react(stamp); }}
        >
          <img src={stampUrl(stamp)} alt="" />
        </button>
      ))}
      <Floaters />
    </div>
  );
}
