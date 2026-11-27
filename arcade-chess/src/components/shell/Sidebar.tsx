import { useEffect, useRef, useState } from "react";
import { useUiStore, type PlayMode, type View } from "@/state/ui";
import { useGameStore } from "@/state/game";
import { hasBeaten, useStatsStore } from "@/state/stats";
import { canReview, useHistoryStore } from "@/state/history";
import { useDrillStore } from "@/state/drill";
import { CHAOS_ENABLED } from "@/features";
import { leaveRoomGame, openRoom, useOnlineStore } from "@/online/sync";
import { getOpponent, OPPONENTS } from "@/ai/bots";
import { BotPortrait, PersonAvatar } from "@/components/BotPortrait";
import { session } from "@/stellarr/sdk";
import { resumeAudio } from "@/sounds";
import { useTranslation } from "@/i18n";
import { IconGear } from "./Icons";

const LADDER = OPPONENTS.filter((opponent) => opponent.kind === "character");

/** The menu's own icons (generated, see ARTWORK.md). */
const icon = (name: string) => `icons/nav/${name}.webp`;

/** The app icon (a pixel-art knight on an arcade screen) as the logo mark, at 32 px so each of its 32 × 32 pixels is one screen pixel. */
function Mark() {
  return <img className="sidebar__mark" src="icon.png" alt="" width={32} height={32} draggable={false} />;
}

/**
 * The main menu: Play (with its options in a flyout), Puzzles, Chaos Chess, the voice channel,
 * the ladder and the player's statistics, then the player, the language and the settings.
 */
export function Sidebar() {
  const view = useUiStore((s) => s.view);
  const mode = useUiStore((s) => s.mode);
  const opponentId = useUiStore((s) => s.opponent);
  const setView = useUiStore((s) => s.setView);
  const setMode = useUiStore((s) => s.setMode);
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);
  const online = useOnlineStore((s) => s.available);
  const drilling = useGameStore((s) => s.drill);
  const gamePhase = useGameStore((s) => s.phase);
  const chaosGame = useGameStore((s) => s.chaos.enabled);
  const solving = useGameStore((s) => s.solver !== null);
  // Something to do in Multiplayer: a game being played, or someone else's table waiting for an opponent.
  const live = useOnlineStore((s) => s.shared.tables.some((table) => (table.match ? !table.match.result : table.host !== s.me)));
  const challenger = useOnlineStore((s) => s.shared.tables.find((table) => !table.match && table.host !== s.me)?.hostName ?? null);
  const bots = useStatsStore((s) => s.bots);
  const elo = useStatsStore((s) => s.rating.elo);
  const lastGame = useHistoryStore((s) => s.games.find(canReview) ?? null);
  const { t, locale, setLocale } = useTranslation();
  const [open, setOpen] = useState(false);
  const playRef = useRef<HTMLLIElement>(null);
  const opponent = getOpponent(opponentId);
  // The flyout's pictures are fetched ahead, so it opens complete.
  useEffect(() => {
    for (const src of [icon("botmatch"), icon("review"), opponent.avatarUrl]) if (src) new Image().src = src;
  }, [opponent.avatarUrl]);
  const beaten = LADDER.filter((bot) => hasBeaten(bots, bot.id)).length;
  const me = session().context.me;
  const myName = online ? me.name : t("player.you");

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !playRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", close);
    };
  }, [open]);

  const go = (next: View, nextMode?: PlayMode) => {
    resumeAudio();
    setOpen(false);
    // Any other screen ends a puzzle drill.
    if (useDrillStore.getState().kind) {
      useDrillStore.getState().stop();
      useGameStore.getState().reset();
    }
    if (next === "online") return openRoom();
    // A Chaos game in progress is where the Chaos entry leads; otherwise its menu.
    if (next === "chaos") {
      const game = useGameStore.getState();
      if (game.phase === "playing" && game.chaos.enabled && !game.online) return setView("play");
    }
    // Another screen needs the board: the room's game leaves it (and carries on in the room).
    leaveRoomGame();
    if (nextMode) {
      // A finished or running game of another kind gives way to the new choice.
      if (useGameStore.getState().phase !== "playing" || useUiStore.getState().mode !== nextMode) useGameStore.getState().reset();
      setMode(nextMode);
    }
    setView(next);
  };
  const reviewLast = () => {
    setOpen(false);
    if (lastGame) useHistoryStore.getState().openReview(lastGame.id);
  };

  // On the board, the highlight follows the game being shown; before a game, the chosen mode.
  const active = view !== "play" ? view
    : drilling ? "puzzles"
    : gamePhase !== "lobby" ? (chaosGame ? "chaos" : solving ? "puzzles" : "play")
    : mode === "chaos" ? "chaos" : mode === "positions" ? "puzzles" : "play";
  const item = (id: string) => `sidebar__item${active === id ? " is-active" : ""}`;

  return (
    <nav className="sidebar" aria-label={t("nav.menu")}>
      <button type="button" className="sidebar__logo" onClick={() => go("home")} aria-label={t("nav.stats")}>
        <Mark />
        <span className="logo__word">Arcade<b>Chess</b></span>
      </button>
      <ul className="sidebar__nav">
        <li ref={playRef} className="sidebar__play" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
          <button type="button" className={item("play")} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(!open)} title={t("nav.play")}>
            <img src={icon("play")} alt="" /><span>{t("nav.play")}</span>
            <svg className="sidebar__chevron" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="m9 6 6 6-6 6" /></svg>
          </button>
          {open && (
            <div className="flyout" role="menu" aria-label={t("nav.play")}>
              <button type="button" role="menuitem" className="flyout__item" onClick={() => go("play", "vsBot")}>
                <span className="flyout__art" style={{ background: opponent.tint }}><BotPortrait id={opponent.id} /></span>
                <span><strong>{t("flyout.bot")}</strong><small>{t("flyout.botNote", { name: opponent.name, rating: opponent.rating ?? "–", beaten, total: LADDER.length })}</small></span>
              </button>
              <button type="button" role="menuitem" className="flyout__item" onClick={() => go("online")}>
                <img src={icon("room")} alt="" />
                <span><strong>{t("flyout.room")}</strong><small>{challenger ? t("flyout.roomChallenge", { name: challenger }) : live ? t("flyout.roomLive") : t("flyout.roomNote")}</small></span>
              </button>
              {CHAOS_ENABLED && (
              <button type="button" role="menuitem" className="flyout__item" onClick={() => go("chaos")}>
                  <img src={icon("chaos")} alt="" />
                  <span><strong>{t("flyout.chaos")}</strong><small>{t("flyout.chaosNote")}</small></span>
                </button>
              )}
              <button type="button" role="menuitem" className="flyout__item" onClick={() => go("play", "match")}>
                <img src={icon("botmatch")} alt="" />
                <span><strong>{t("flyout.match")}</strong><small>{t("flyout.matchNote")}</small></span>
              </button>
              <hr />
              <button type="button" role="menuitem" className="flyout__item" onClick={() => go("puzzles")}>
                <img src={icon("puzzles")} alt="" />
                <span><strong>{t("flyout.puzzles")}</strong><small>{t("flyout.puzzlesNote")}</small></span>
              </button>
              {lastGame && (
                <button type="button" role="menuitem" className="flyout__item" onClick={reviewLast}>
                  <img src={icon("review")} alt="" />
                  <span><strong>{t("flyout.review")}</strong><small>{t("flyout.reviewNote", { name: lastGame.opponent })}</small></span>
                </button>
              )}
            </div>
          )}
        </li>
        <li>
          <button type="button" className={item("puzzles")} onClick={() => go("puzzles")} title={t("nav.puzzles")}>
            <img src={icon("puzzles")} alt="" /><span>{t("nav.puzzles")}</span>
          </button>
        </li>
        {CHAOS_ENABLED && (
          <li>
          <button type="button" className={item("chaos")} onClick={() => go("chaos")} title={t("nav.chaos")}>
            <img src={icon("chaos")} alt="" /><span>{t("nav.chaos")}</span>
          </button>
        </li>
        )}
        {/* Multiplayer is always listed; outside a shared session its page explains how to play together. */}
        <li>
          <button type="button" className={item("online")} onClick={() => go("online")} title={t("nav.online")}>
            <img src={icon("room")} alt="" /><span>{t("nav.online")}</span>
            {live && <i className="sidebar__dot" aria-label={t("nav.onlineLive")} />}
          </button>
        </li>
        <li>
          <button type="button" className={item("ladder")} onClick={() => go("ladder")} title={t("nav.ladder")}>
            <img src={icon("ladder")} alt="" /><span>{t("nav.ladder")}</span>
          </button>
        </li>
        <li>
          <button type="button" className={item("home")} onClick={() => go("home")} title={t("nav.stats")}>
            <img src={icon("stats")} alt="" /><span>{t("nav.stats")}</span>
          </button>
        </li>
      </ul>
      <div className="sidebar__bottom">
        <div className="sidebar__me">
          <PersonAvatar name={myName} url={online ? me.avatar : null} />
          <div><strong>{myName}</strong><small>{online ? t("sidebar.elo", { elo }) : t("sidebar.offline")}</small></div>
        </div>
        <div className="sidebar__tools">
          <button type="button" aria-label={t("nav.language")} title={t("nav.language")} onClick={() => setLocale(locale === "en" ? "pl" : "en")}>
            {locale === "en" ? "EN" : "PL"}
          </button>
          <button type="button" aria-label={t("nav.settings")} title={t("nav.settings")} onClick={() => setSettingsOpen(true)}>
            <IconGear size={20} />
          </button>
        </div>
      </div>
    </nav>
  );
}
