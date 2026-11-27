import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { localTopic } from "../game/topics.ts";
import type { Player, Topic } from "../game/types.ts";
import type { Key } from "../i18n/index.ts";
import type { Game } from "../net/game.ts";
import type { GifImage, Participant } from "../stellarr/types.ts";

export const GameContext = createContext<Game | null>(null);
export const useGame = () => useContext(GameContext)!;
/** The sentence for a key in this player's language. */
export const useT = () => useGame().t;

/** "Round 2 of 8: voting" in the player's language. */
export function useRoundTitle(phase: Key) {
  const game = useGame();
  const s = game.state;
  return `${game.t("round", { n: s.round + 1, total: s.settings.rounds })}: ${game.t(phase)}`;
}

/** Room time, re-read every `ms`. */
export function useNow(ms = 250) {
  const game = useGame();
  const [now, setNow] = useState(() => game.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(game.now()), ms);
    return () => clearInterval(timer);
  }, [game, ms]);
  return now;
}

export const ART = {
  logo: "./art/logo.webp",
  hello: "./art/cat-hello.webp",
  search: "./art/cat-search.webp",
  win: "./art/cat-win.webp",
  wait: "./art/cat-wait.webp",
  sticker: (kind: string) => `./art/sticker-${kind}.webp`,
};

export function Header({ center, right }: { center?: ReactNode; right?: ReactNode }) {
  const game = useGame();
  const s = game.state;
  const running = !!s.match && s.phase !== "lobby" && s.phase !== "final";
  return (
    <header className="bar">
      <img className="bar-logo" src={ART.logo} alt="Gif Me a Break" />
      <div className="bar-center">{center}</div>
      <div className="bar-right">
        {right}
        {running && game.isHost && <EndGame />}
      </div>
    </header>
  );
}

/**
 * The host's way out of a match. Stellarr's frame has no `confirm()`, so it asks in place first;
 * Escape or "Keep playing" closes the question.
 */
function EndGame() {
  const game = useGame();
  const [asking, setAsking] = useState(false);
  useEffect(() => {
    if (!asking) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setAsking(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [asking]);
  return (
    <>
      <button type="button" className="end-btn" aria-expanded={asking} onClick={() => setAsking((v) => !v)}>
        <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="3.5" width="9" height="9" rx="2" fill="currentColor" /></svg>
        <span className="end-label">{game.t("endGame")}</span>
      </button>
      {asking && (
        <div className="card end-pop" role="dialog" aria-label={game.t("endGame")}>
          <p>{game.t("endConfirm")}</p>
          <div className="end-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setAsking(false)}>{game.t("keepPlaying")}</button>
            <button type="button" className="btn btn-primary" onClick={() => { setAsking(false); void game.endMatch(); }}>{game.t("endNow")}</button>
          </div>
        </div>
      )}
    </>
  );
}

/** The countdown ring: the orange share is the time left. */
export function Ring({ startsAt, endsAt, label }: { startsAt: number; endsAt: number; label?: string }) {
  const now = useNow();
  const t = useT();
  const total = Math.max(1, endsAt - startsAt);
  const left = Math.max(0, endsAt - now);
  const seconds = Math.ceil(left / 1000);
  const share = Math.round((left / total) * 100);
  return (
    <div className="ring-wrap">
      <span className="muted">{label ?? t("left")}</span>
      <span className={`ring${seconds <= 5 ? " ring-low" : ""}`} role="timer" aria-label={t("timerAria", { n: seconds })} style={{ ["--share" as string]: `${share}%` }}>
        <span>{seconds}</span>
      </span>
    </div>
  );
}

const COLORS = ["#FFB38A", "#8FE3C8", "#F2A7E0", "#C3D2FF", "#FFE79A", "#C7F08A", "#FFC2AE", "#B8E1FF"];

export function colorFor(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}

export function initial(name: string) {
  return [...name.trim()][0]?.toUpperCase() ?? "?";
}

export function Avatar({ who, size = 40, tick, dim, outline, title }: { who: Player | Participant | undefined; size?: number; tick?: boolean; dim?: boolean; outline?: string; title?: string }) {
  const name = who?.name ?? "?";
  const style = {
    width: size,
    height: size,
    fontSize: Math.round(size * 0.4),
    background: colorFor(who?.id ?? name),
    opacity: dim ? 0.5 : 1,
    boxShadow: outline ? `0 0 0 3px var(--bg), 0 0 0 5px ${outline}` : undefined,
  };
  return (
    <span className="avatar" style={style} title={title ?? name}>
      {who?.avatar ? <img src={who.avatar} alt="" /> : <span aria-hidden="true">{initial(name)}</span>}
      {tick && (
        <svg className="tick" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="8" fill="#5FEFC4" />
          <path d="M4.5 8.2l2.3 2.3 4.7-4.8" fill="none" stroke="#111733" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}

/** A topic in this player's language, with the player's name in pink. */
export function TopicText({ topic: shared }: { topic: Topic | null }) {
  const game = useGame();
  if (!shared) return null;
  const topic = localTopic(shared, game.lang);
  if (!topic.name) return <>{topic.text}</>;
  const at = topic.text.indexOf(topic.name);
  if (at < 0) return <>{topic.text}</>;
  return (
    <>
      {topic.text.slice(0, at)}
      <span className="name">{topic.name}</span>
      {topic.text.slice(at + topic.name.length)}
    </>
  );
}

/**
 * One GIF, loaded through the room. Shows a placeholder while loading or when it can't be shown.
 * `lazy` waits until the GIF scrolls into view; a load refused for the rate limit is tried again.
 */
export function GifView({ id, size = "preview", alt, className = "", lazy = false }: { id: string | null | undefined; size?: "preview" | "full"; alt?: string; className?: string; lazy?: boolean }) {
  const game = useGame();
  const box = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(!lazy);
  const [image, setImage] = useState<GifImage | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (visible || !box.current) return;
    const watch = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setVisible(true);
        watch.disconnect();
      }
    }, { rootMargin: "120px" });
    watch.observe(box.current);
    return () => watch.disconnect();
  }, [visible]);

  useEffect(() => {
    setImage(null);
    setFailed(false);
    setAttempt(0);
  }, [id, size]);

  useEffect(() => {
    let live = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    if (!id || !visible) return;
    game.image(id, size).then(
      (img) => { if (live) setImage(img); },
      (error) => {
        if (!live) return;
        if ((error as { code?: string })?.code === "rateLimited" && attempt < 6) {
          retry = setTimeout(() => setAttempt((n) => n + 1), 2_500 + attempt * 1_500);
        } else {
          setFailed(true);
        }
      },
    );
    return () => { live = false; clearTimeout(retry); };
  }, [game, id, size, visible, attempt]);

  if (!id) return <span className={`gif gif-empty ${className}`} />;
  if (failed) {
    return (
      <span className={`gif gif-empty ${className}`}>
        <span>{game.gifProblem === "declined" ? game.t("gifDeclinedShort") : game.t("gifFailed")}</span>
      </span>
    );
  }
  return (
    <span ref={box} className={`gif ${className}`}>
      {image ? <img src={image.url} alt={alt ?? image.alt ?? "GIF"} /> : <span className="gif-loading" aria-label={game.t("loadingGif")} />}
    </span>
  );
}

/**
 * A painted layer behind a screen's content: the lobby's sofa, the reveal's spotlight, or
 * confetti for winners. Inline styles resolve the picture next to index.html in every build.
 */
export function Backdrop({ kind }: { kind: "lobby" | "stage" | "confetti" }) {
  const file = kind === "confetti" ? "confetti.webp" : `bg-${kind}.webp`;
  return <div className={`backdrop backdrop-${kind}`} aria-hidden="true" style={{ backgroundImage: `url(./art/${file})` }} />;
}

export function Cat({ pose, className = "" }: { pose: "hello" | "search" | "win" | "wait"; className?: string }) {
  return <img className={`cat ${className}`} src={ART[pose]} alt="" draggable={false} />;
}

