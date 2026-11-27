import { isSpectating, useGameStore } from "@/state/game";
import { useUiStore } from "@/state/ui";
import { requestHint } from "@/ai/hint";
import { backToLobby, rematch, resign } from "@/game/session";
import { onlineDraw, useOnlineStore } from "@/online/sync";
import { useReviewStore } from "@/ai/review";
import { useTranslation } from "@/i18n";
import { IconBulb, IconChevron, IconFlag, IconFlip, IconHandshake, IconUndo } from "@/components/shell/Icons";

/** Phones only: the game's actions pinned to the bottom of the screen, always under the thumb. */
export function MobileBar() {
  const { t } = useTranslation();
  const phase = useGameStore((s) => s.phase);
  const solver = useGameStore((s) => s.solver);
  const chaos = useGameStore((s) => s.chaos.enabled);
  const moves = useGameStore((s) => s.moves);
  const myColor = useGameStore((s) => s.myColor);
  const online = useGameStore((s) => s.online);
  const viewPly = useGameStore((s) => s.viewPly);
  const setViewPly = useGameStore((s) => s.setViewPly);
  const takeback = useGameStore((s) => s.takeback);
  const drill = useGameStore((s) => s.drill);
  const flipBoard = useGameStore((s) => s.flipBoard);
  const spectating = useGameStore(isSpectating);
  const paused = useGameStore((s) => s.paused);
  const setPaused = useGameStore((s) => s.setPaused);
  useGameStore((s) => s.fen);
  const hintLoading = useUiStore((s) => s.hintLoading);
  const setPanelTab = useUiStore((s) => s.setPanelTab);
  const panelTab = useUiStore((s) => s.panelTab);
  const autoplay = useReviewStore((s) => s.autoplay);
  const setAutoplay = useReviewStore((s) => s.setAutoplay);
  const pending = useOnlineStore((s) => s.pending);
  if (phase === "lobby") return null;
  const current = viewPly ?? moves.length;
  const myTurn = phase === "playing" && myColor !== null && useGameStore.getState().chess.turn() === myColor;
  const back = online ? t("online.backToRoom") : t("game.newGame");

  // A puzzle drill has its own buttons in the panel under the board.
  if (drill) return null;
  if (phase === "ended" && panelTab === "review") {
    // Reviewing: the bar becomes the replay controls, the board stays in view above it.
    const step = (ply: number | null) => { setAutoplay(false); setViewPly(ply); };
    return (
      <nav className="mobile-bar" aria-label={t("panel.review")}>
        <button type="button" className="mobile-bar__new" onClick={() => { setAutoplay(false); backToLobby(); }} aria-label={back}>+</button>
        <button type="button" onClick={() => step(0)} disabled={current === 0} aria-label={t("game.first")}><IconChevron dir="first" size={22} /></button>
        <button type="button" onClick={() => step(current - 1)} disabled={current === 0} aria-label={t("game.prev")}><IconChevron dir="left" size={22} /></button>
        <button type="button" className="mobile-bar__play" onClick={() => {
          if (!autoplay && current >= moves.length) setViewPly(0);
          setAutoplay(!autoplay);
        }}>{autoplay ? "❚❚" : "▶"}</button>
        <button type="button" onClick={() => step(current + 1)} disabled={viewPly === null} aria-label={t("game.next")}><IconChevron dir="right" size={22} /></button>
        <button type="button" onClick={() => step(null)} disabled={viewPly === null} aria-label={t("game.last")}><IconChevron dir="last" size={22} /></button>
      </nav>
    );
  }
  if (phase === "ended") {
    return (
      <nav className="mobile-bar mobile-bar--ended" aria-label={t("nav.menu")}>
        <button type="button" onClick={backToLobby}>{back}</button>
        <button type="button" onClick={() => { setViewPly(0); if (!chaos) setPanelTab("review"); }}>{t(chaos ? "chaos.browse" : "panel.review")}</button>
        {(!online || myColor) && <button type="button" className="is-primary" onClick={rematch}>{t(solver ? "positions.again" : "game.rematch")}</button>}
      </nav>
    );
  }
  const browse = (
    <>
      <button type="button" onClick={flipBoard} aria-label={t("game.flip")}><IconFlip /></button>
      <button type="button" onClick={() => setViewPly(current - 1)} disabled={current === 0} aria-label={t("game.prev")}><IconChevron dir="left" size={22} /></button>
      <button type="button" onClick={() => setViewPly(current + 1)} disabled={viewPly === null} aria-label={t("game.next")}><IconChevron dir="right" size={22} /></button>
    </>
  );
  if (spectating) {
    // Watching two bots: nothing to resign, take back or hint; the play button pauses them.
    return (
      <nav className="mobile-bar" aria-label={t("nav.menu")}>
        <button type="button" className="mobile-bar__new" onClick={backToLobby} aria-label={t("game.newGame")}>+</button>
        <button type="button" className="mobile-bar__play" onClick={() => setPaused(!paused)} aria-label={paused ? t("game.resume") : t("game.pause")}>{paused ? "▶" : "❚❚"}</button>
        {browse}
      </nav>
    );
  }
  if (online) {
    return (
      <nav className="mobile-bar" aria-label={t("nav.menu")}>
        {myColor ? (
          <>
            <button type="button" onClick={resign} disabled={pending !== null} aria-label={t("game.resign")}><IconFlag /></button>
            <button type="button" onClick={onlineDraw} disabled={pending !== null} aria-label={t("online.drawOffer")}><IconHandshake /></button>
          </>
        ) : (
          <button type="button" className="mobile-bar__new" onClick={backToLobby} aria-label={back}>←</button>
        )}
        {browse}
      </nav>
    );
  }
  return (
    <nav className="mobile-bar" aria-label={t("nav.menu")}>
      <button type="button" onClick={resign} aria-label={t("game.resign")}><IconFlag /></button>
      <button type="button" onClick={() => takeback()} disabled={!moves.length || chaos} aria-label={t("game.undo")}><IconUndo /></button>
      <button type="button" onClick={() => void requestHint()} disabled={!myTurn || hintLoading} aria-label={t("game.hintShort")} className={hintLoading ? "is-loading" : ""}><IconBulb /></button>
      {browse}
    </nav>
  );
}
