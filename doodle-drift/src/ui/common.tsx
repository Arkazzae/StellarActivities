import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { ModeId, TaskKind } from "../game/types.ts";
import { useT } from "../lib/i18n.ts";
import { bitmapOf } from "../net/image.ts";
import type { Bits } from "../net/image.ts";
import { useGame } from "./context.ts";

const PATHS: Record<string, ReactNode> = {
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  check: <path d="M5 12l5 5L20 7" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  back: <path d="M15 6l-6 6 6 6" />,
  next: <path d="M9 6l6 6-6 6" />,
  close: <path d="M18 6L6 18M6 6l12 12" />,
  pen: <><path d="M4 20h4L19 9l-4-4L4 16v4z" /><path d="M13.5 6.5l4 4" /></>,
  brush: <><path d="M3 21v-4a4 4 0 1 1 4 4H3" /><path d="M21 3A16 16 0 0 0 8.2 13.2" /><path d="M21 3a16 16 0 0 1-10.2 12.8" /></>,
  marker: <><path d="M3 19h4L17.5 8.5a2.8 2.8 0 0 0-4-4L3 15v4" /><path d="M12.5 5.5l4 4" /></>,
  eraser: <><path d="M19 20H8.5l-4.2-4.3a1 1 0 0 1 0-1.4l10-10a1 1 0 0 1 1.4 0l5 5a1 1 0 0 1 0 1.4L13 19.5" /><path d="M18 13.3L11.7 7" /></>,
  fill: <><path d="M7 3l9 9-6 6a2 2 0 0 1-2.8 0L3 13.8a2 2 0 0 1 0-2.8L9 5" /><path d="M4 12h12" /><path d="M19 15s2 2.3 2 3.5a2 2 0 0 1-4 0c0-1.2 2-3.5 2-3.5z" /></>,
  line: <path d="M5 19L19 5" />,
  rect: <rect x="4" y="5" width="16" height="14" rx="2" />,
  ellipse: <ellipse cx="12" cy="12" rx="8.5" ry="7" />,
  undo: <><path d="M9 14L4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></>,
  redo: <><path d="M15 14l5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" /></>,
  trash: <><path d="M4 7h16" /><path d="M10 11v6M14 11v6" /><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12" /><path d="M9 7V4h6v3" /></>,
  crown: <path d="M4 8l4 4 4-6 4 6 4-4-2 10H6z" />,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>,
  dice: <><rect x="4" y="4" width="16" height="16" rx="4" /><circle cx="9" cy="9" r="1" fill="currentColor" /><circle cx="15" cy="15" r="1" fill="currentColor" /><circle cx="15" cy="9" r="1" fill="currentColor" /><circle cx="9" cy="15" r="1" fill="currentColor" /></>,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><path d="M3 3l18 18" /><path d="M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.2 6.3C3.6 8 2 12 2 12s3.5 7 10 7a9.6 9.6 0 0 0 4.3-1" /></>,
  play: <path d="M7 4v16l13-8z" />,
  pause: <path d="M8 5v14M16 5v14" />,
  repeat: <path d="M4 12V9a3 3 0 0 1 3-3h13l-3-3M20 12v3a3 3 0 0 1-3 3H4l3 3" />,
  restart: <><path d="M4 12a8 8 0 1 0 3-6.2" /><path d="M4 4v5h5" /></>,
  download: <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />,
  gif: <><rect x="4" y="5" width="16" height="14" rx="2" /><path d="M10 9v6l5-3z" /></>,
  lock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  logout: <><path d="M14 8V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-2" /><path d="M9 12h12M18 9l3 3-3 3" /></>,
  volume: <><path d="M15 8a5 5 0 0 1 0 8" /><path d="M6 15H4a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h2l4-4v14z" /></>,
  star: <path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.5 6.7 19.4l1.2-6L3.4 9.3l6-.7z" />,
  newLine: <><circle cx="7" cy="17" r="2" fill="currentColor" /><path d="M13 7h6M16 4v6" /></>,
  stars: <><path d="M5 18L11 7l8 9" /><circle cx="5" cy="18" r="2" fill="currentColor" /><circle cx="11" cy="7" r="2" fill="currentColor" /><circle cx="19" cy="16" r="2" fill="currentColor" /></>,
};

export function Icon({ name, size = 20, label, style }: { name: keyof typeof PATHS | string; size?: number; label?: string; style?: React.CSSProperties }) {
  return (
    <svg className="i" viewBox="0 0 24 24" width={size} height={size} style={{ width: size, height: size, ...style }} aria-hidden={label ? undefined : true} aria-label={label} role={label ? "img" : undefined}>
      {PATHS[name]}
    </svg>
  );
}

const AVATAR_COLORS = ["#ff6847", "#b5cf3b", "#f2b84b", "#8fb8e8", "#f7e8c9", "#c9b0ec", "#f4a3b4", "#4f9d69", "#e9b765", "#8b9099"];

function colorFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

export function Avatar({ person, size = 34 }: { person: { id: string; name: string; avatar: string | null } | undefined; size?: number }) {
  const [broken, setBroken] = useState(false);
  if (!person) return <span className="av" style={{ width: size, height: size, background: "#8b9099" }} aria-hidden="true">?</span>;
  const initial = person.name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span className="av" style={{ width: size, height: size, background: colorFor(person.id), fontSize: Math.max(10, size * 0.4) }} aria-hidden="true">
      {person.avatar && !broken ? <img src={person.avatar} alt="" onError={() => setBroken(true)} /> : initial}
    </span>
  );
}

/** Re-render every `ms` while mounted (for clocks). */
export function useTick(ms = 250) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
}

export function Timer({ endsAt, total }: { endsAt: number; total: number }) {
  const game = useGame();
  const t = useT();
  useTick(250);
  const left = Math.max(0, Math.ceil((endsAt - game.now()) / 1000));
  const fraction = total > 0 ? Math.min(1, left / total) : 0;
  const urgent = left <= 10;
  const label = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  return (
    <div className={`timer${urgent ? " urgent" : ""}`} role="timer" aria-label={t("round.left", { s: left })}>
      <svg viewBox="0 0 36 36" aria-hidden="true">
        <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,245,223,.16)" strokeWidth="4" />
        <circle cx="18" cy="18" r="15" fill="none" stroke={urgent ? "#ff6847" : "#b5cf3b"} strokeWidth="4" strokeLinecap="round" strokeDasharray={`${fraction * 94.2} 95`} />
      </svg>
      <b>{label}</b>
    </div>
  );
}

const TEXT_STEP: ReadonlySet<TaskKind> = new Set(["write", "continue", "describe", "guess"]);

/** Round number and the chain of upcoming steps, for task screens. */
export function RoundBar({ children, onMenu }: { children?: ReactNode; onMenu: () => void }) {
  const game = useGame();
  const t = useT();
  const { match, round } = game.state;
  if (!match || !round) return null;
  const kinds = match.plan.rounds.map((r) => r.kind);
  const showChain = kinds.length <= 10;
  return (
    <header className="bar">
      <img src="./logo-mark.webp" alt="Doodle Drift" className="logo-mark" />
      <div className="round-no"><span>{t("round.label")}</span> {round.index + 1} <span>{t("round.of")} {kinds.length}</span></div>
      {showChain ? (
        <ol className="chain" aria-label={t("round.label")}>
          {kinds.map((kind, i) => (
            <li key={i}>
              {i > 0 ? <span className={`link${i <= round.index ? " done" : ""}`} /> : null}
              <span className={`step${i < round.index ? " done" : i === round.index ? " now" : ""}`}>
                {i < round.index ? <Icon name="check" size={13} /> : TEXT_STEP.has(kind) ? "Aa" : <Icon name="pen" size={12} />}
              </span>
            </li>
          ))}
        </ol>
      ) : null}
      {children}
      <div className="bar-end">
        <Timer endsAt={round.endsAt} total={match.plan.rounds[round.index].seconds} />
        <button type="button" className="icon-btn" onClick={onMenu} aria-label={t("settings.menu")}><Icon name="menu" /></button>
      </div>
    </header>
  );
}

/** Small pictures for each mode, used on cards, pills and the reveal. */
export function ModeArt({ mode, className }: { mode: ModeId; className?: string }) {
  const k = { stroke: "currentColor", strokeWidth: 3, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const petals = [0, 60, 120, 180, 240, 300];
  const art: Record<ModeId, ReactNode> = {
    classic: <><rect x="8" y="18" width="26" height="32" rx="3" fill="#f7e8c9" {...k} /><rect x="47" y="14" width="26" height="32" rx="3" fill="#ff6847" {...k} /><rect x="86" y="18" width="26" height="32" rx="3" fill="#b5cf3b" {...k} /></>,
    mix: <><rect x="22" y="16" width="40" height="40" rx="8" fill="#f7e8c9" {...k} transform="rotate(-10 42 36)" /><circle cx="35" cy="29" r="3.5" fill="#162a46" /><circle cx="48" cy="42" r="3.5" fill="#162a46" /><rect x="64" y="24" width="36" height="36" rx="8" fill="#ff6847" {...k} transform="rotate(12 82 42)" /><circle cx="78" cy="38" r="3.5" fill="#162a46" /></>,
    story: <path fill="none" {...k} d="M20 18h80M20 32h64M20 46h72M20 60h40" />,
    stars: <><path d="M16 58L38 22L62 42L88 14L106 50" fill="none" stroke="#b5cf3b" strokeWidth="3.5" strokeLinecap="round" /><g fill="currentColor"><circle cx="16" cy="58" r="4.5" /><circle cx="38" cy="22" r="4.5" /><circle cx="62" cy="42" r="4.5" /><circle cx="88" cy="14" r="4.5" /><circle cx="106" cy="50" r="4.5" /></g></>,
    oneline: <path d="M10 60C24 14 50 10 46 40S68 70 78 36S106 18 110 54" fill="none" stroke="#ff6847" strokeWidth="4.5" strokeLinecap="round" />,
    kaleido: <>{petals.map((a) => <path key={a} d="M60 38q-7-14 0-28q7 14 0 28Z" fill="#ff6847" transform={`rotate(${a} 60 38)`} />)}<circle cx="60" cy="38" r="5" fill="#b5cf3b" /></>,
    crayons: <><path d="M18 18h62l14 7-14 7H18z" fill="#ff6847" /><path d="M18 34h62l14 7-14 7H18z" fill="#c9b0ec" /><path d="M18 50h62l14 7-14 7H18z" fill="#8a5a3c" /></>,
    blind: <><rect x="14" y="8" width="92" height="60" rx="6" fill="#162a46" stroke="currentColor" strokeWidth="3" /><path d="M38 38q22 16 44 0" fill="none" stroke="#fff5df" strokeWidth="3.5" strokeLinecap="round" /></>,
    telegram: <><rect x="4" y="28" width="24" height="20" rx="4" fill="#f7e8c9" {...k} strokeWidth={2} /><rect x="32" y="28" width="24" height="20" rx="4" fill="#f7e8c9" {...k} strokeWidth={2} /><rect x="60" y="28" width="24" height="20" rx="4" fill="#f7e8c9" {...k} strokeWidth={2} /><rect x="88" y="28" width="24" height="20" rx="4" fill="none" {...k} strokeWidth={2} strokeDasharray="4 3" /></>,
    memory: <><rect x="6" y="14" width="44" height="48" rx="4" fill="#fff5df" {...k} /><circle cx="28" cy="38" r="11" fill="#f2b84b" /><rect x="72" y="14" width="44" height="48" rx="4" fill="none" {...k} strokeDasharray="5 4" /></>,
    sandwich: <><rect x="4" y="20" width="24" height="34" rx="3" fill="#f7e8c9" {...k} strokeWidth={2} /><rect x="34" y="20" width="24" height="34" rx="3" fill="#ff6847" /><rect x="62" y="20" width="24" height="34" rx="3" fill="#ff6847" /><rect x="92" y="20" width="24" height="34" rx="3" fill="#f7e8c9" {...k} strokeWidth={2} /></>,
    same: <><rect x="42" y="4" width="36" height="22" rx="3" fill="#f7e8c9" {...k} strokeWidth={2} /><rect x="16" y="44" width="28" height="26" rx="3" fill="#fff5df" {...k} strokeWidth={2} /><rect x="46" y="44" width="28" height="26" rx="3" fill="#fff5df" {...k} strokeWidth={2} /><rect x="76" y="44" width="28" height="26" rx="3" fill="#fff5df" {...k} strokeWidth={2} /></>,
    scribble: <><path d="M16 50q10-34 30-12t30-4t28-18" fill="none" stroke="#ff6847" strokeWidth="4.5" strokeLinecap="round" /><circle fill="none" {...k} cx="52" cy="30" r="3" /><circle fill="none" {...k} cx="64" cy="30" r="3" /></>,
    score: <><circle cx="60" cy="38" r="28" fill="#b5cf3b" /><path d="M60 22l5 10 11 2-8 8 2 11-10-5-10 5 2-11-8-8 11-2z" fill="#fff5df" stroke="#162a46" strokeWidth="2" /></>,
    missing: <><rect x="14" y="8" width="92" height="60" rx="5" fill="#fff5df" {...k} /><rect x="54" y="22" width="36" height="28" rx="3" fill="#ffffff" {...k} strokeDasharray="5 4" stroke="#ff6847" /><path d="M24 54q14-22 28-6" fill="none" stroke="#162a46" strokeWidth="3" strokeLinecap="round" /></>,
    masterpiece: <><rect x="22" y="6" width="76" height="62" rx="4" fill="#e8bd5a" /><rect x="32" y="15" width="56" height="44" fill="#fff5df" /><path d="M38 52l14-16 10 10 8-8 12 14" fill="none" stroke="#162a46" strokeWidth="3" strokeLinejoin="round" /><circle cx="74" cy="26" r="5" fill="#ff6847" /></>,
    flipbook: <><rect x="10" y="10" width="54" height="44" rx="4" fill="#fff5df" opacity=".4" /><rect x="30" y="18" width="54" height="44" rx="4" fill="#fff5df" opacity=".7" /><rect x="50" y="26" width="54" height="44" rx="4" fill="#fff5df" /><circle cx="70" cy="56" r="7" fill="#ff6847" /></>,
    relay: <><rect x="8" y="14" width="40" height="48" rx="4" fill="#fff5df" opacity=".45" /><rect x="40" y="10" width="40" height="48" rx="4" fill="#fff5df" opacity=".75" /><rect x="72" y="6" width="40" height="48" rx="4" fill="#fff5df" /><path d="M14 70h92" stroke="#b5cf3b" strokeWidth="5" strokeLinecap="round" /></>,
    background: <><rect x="14" y="8" width="92" height="60" rx="5" fill="#8fb8e8" /><path d="M14 52q24-14 46 0t46-4V68H14z" fill="#4f9d69" /><circle cx="84" cy="24" r="8" fill="#f2b84b" /><circle cx="44" cy="34" r="7" fill="#ff6847" stroke="#162a46" strokeWidth="2" /></>,
    corpse: <><rect x="30" y="4" width="60" height="20" rx="3" fill="#c9b0ec" /><rect x="30" y="28" width="60" height="20" rx="3" fill="#8fb8e8" /><rect x="30" y="52" width="60" height="20" rx="3" fill="#ff6847" /></>,
    custom: <><path {...k} d="M16 20h88M16 38h88M16 56h88" strokeWidth={3} /><circle cx="40" cy="20" r="7" fill="#ff6847" stroke="#162a46" strokeWidth="2" /><circle cx="78" cy="38" r="7" fill="#b5cf3b" stroke="#162a46" strokeWidth="2" /><circle cx="54" cy="56" r="7" fill="#f2b84b" stroke="#162a46" strokeWidth="2" /></>,
    mosaic: <><rect x="14" y="6" width="28" height="30" rx="3" fill="#fff5df" opacity=".6" /><rect x="46" y="6" width="28" height="30" rx="3" fill="#ff6847" /><rect x="78" y="6" width="28" height="30" rx="3" fill="#fff5df" opacity=".6" /><rect x="14" y="40" width="28" height="30" rx="3" fill="#fff5df" opacity=".6" /><rect x="46" y="40" width="28" height="30" rx="3" fill="#fff5df" opacity=".6" /><rect x="78" y="40" width="28" height="30" rx="3" fill="#fff5df" opacity=".6" /></>,
  };
  return <svg viewBox="0 0 120 76" className={className} aria-hidden="true">{art[mode]}</svg>;
}

/** The reaction stamps shipped with the game. */
export const STAMPS = ["laugh", "love", "wow", "fire", "clap"] as const;
export const stampUrl = (stamp: string) => `./illustrations/reaction-${stamp}.webp`;

/**
 * A stored picture painted on a canvas. Pictures are decoded from bytes instead of shown
 * through `blob:` URLs, which a strict activity Content-Security-Policy may block.
 */
export function Bitmap({ bits, alt, className, style }: { bits: Bits | undefined | null; alt: string; className?: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!bits) return;
    let cancelled = false;
    bitmapOf(bits).then((bitmap) => {
      const canvas = ref.current;
      if (cancelled || !canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [bits]);
  return <canvas ref={ref} width={960} height={720} className={className} style={style} role="img" aria-label={alt} />;
}
