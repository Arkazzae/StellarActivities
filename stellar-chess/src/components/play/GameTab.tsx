import { useMemo, useState } from "react";
import { ChaosBody, ChaosHeader, type ChaosTab } from "@/components/chaos/ChaosPanel";
import { BotPortrait, PersonAvatar } from "@/components/BotPortrait";
import { isSpectating, useGameStore } from "@/state/game";
import { useChatStore } from "@/state/chat";
import { useSettingsStore } from "@/state/settings";
import { useUiStore } from "@/state/ui";
import { getOpponent, seatSubtitle } from "@/ai/bots";
import { requestHint } from "@/ai/hint";
import { useOpeningName } from "@/hooks/useOpeningName";
import { backToLobby, reasonText, rematch, resign } from "@/game/session";
import { onlineAbandon, onlineDecline, onlineDraw, useOnlineStore } from "@/online/sync";
import { useTranslation } from "@/i18n";
import { presetGoal, startLabel } from "@/engine/positions";
import type { PieceColor } from "@/engine/types";
import { MoveTable } from "./MoveTable";
import { IconBulb, IconChevron, IconDownload, IconFlag, IconFlip, IconGear, IconHandshake, IconUndo } from "@/components/shell/Icons";

/** The game's starting position by name: the usual one, a test position, a Chess960 start or a set-up one. */
function StartName({ fen }: { fen: string }) {
  const { t } = useTranslation();
  const label = useMemo(() => startLabel(fen), [fen]);
  if (label.kind === "preset") return <>{t(`preset.${label.id}`)} <em>· {t(`preset.${label.id}.goal`)}</em></>;
  if (label.kind === "chess960") return <>{t("start.chess960Number", { n: label.number })}</>;
  return <>{t(label.kind === "custom" ? "start.customPosition" : "game.startPosition")}</>;
}

/** The bot's speech bubble, or its name when the bots are told to keep quiet. */
function BotChat() {
  const phase = useGameStore((s) => s.phase);
  const myColor = useGameStore((s) => s.myColor);
  const seats = useGameStore((s) => s.seats);
  const paused = useGameStore((s) => s.paused);
  const turn = useGameStore((s) => (s.fen.split(" ")[1] === "b" ? "b" : "w"));
  const log = useChatStore((s) => s.log);
  const botChat = useSettingsStore((s) => s.botChat);
  const last = log.at(-1);
  // The bubble belongs to whoever spoke last; before anyone has, to the bot the player faces (White's in a match).
  const fallback = myColor ? seats[myColor === "w" ? "b" : "w"] : seats.w;
  const speakerSeat = [seats.w, seats.b].find((seat) => seat && seat.id === last?.speaker) ?? fallback;
  const speaker = getOpponent(speakerSeat?.id ?? last?.speaker);
  const thinking = phase === "playing" && !paused && !!speakerSeat && seats[turn] === speakerSeat;
  return (
    <div className="bot-chat">
      <div className="bot-chat__portrait" style={{ background: speaker.tint }}><BotPortrait thinking={thinking} id={speaker.id} /></div>
      {botChat
        ? <div className="speech" key={last?.timestamp ?? 0}><p>{last?.text ?? "…"}</p></div>
        : <div className="bot-hero__name"><strong>{speaker.name}</strong> <span>{speakerSeat ? seatSubtitle(speakerSeat) : speaker.short}</span></div>}
    </div>
  );
}

/** An online game's header: who plays whom, a draw offer to answer, an opponent who left. */
function RoomStrip() {
  const { t } = useTranslation();
  const phase = useGameStore((s) => s.phase);
  const myColor = useGameStore((s) => s.myColor);
  const players = useGameStore((s) => s.players);
  const match = useOnlineStore((s) => s.shared.match);
  const participants = useOnlineStore((s) => s.participants);
  const pending = useOnlineStore((s) => s.pending);
  const opponentColor: PieceColor | null = myColor ? (myColor === "w" ? "b" : "w") : null;
  const opponentId = opponentColor ? players[opponentColor]?.userId : null;
  const opponentHere = !opponentId || participants.some((person) => person.id === opponentId && person.connected);
  const offer = phase === "playing" ? match?.drawOffer ?? null : null;
  return (
    <div className="room-strip">
      <div className="room-strip__players">
        {(["w", "b"] as const).map((color) => (
          <span key={color} className={`room-strip__player${color === myColor ? " is-me" : ""}`}>
            <PersonAvatar name={players[color]?.username ?? "?"} url={players[color]?.avatarUrl} />
            <span>{players[color]?.username ?? "?"}</span>
          </span>
        ))}
      </div>
      {!myColor && phase === "playing" && <p className="room-strip__note">{t("online.watching")}</p>}
      {offer && myColor && offer !== myColor && (
        <div className="room-strip__offer" role="alert">
          <p><strong>{t("online.drawOffered", { name: players[offer]?.username ?? "?" })}</strong><span>{t("online.drawHint")}</span></p>
          <div className="room-strip__choices">
            <button type="button" className="btn btn--green" disabled={pending !== null} onClick={onlineDraw}>{t("online.drawAccept")}</button>
            <button type="button" className="btn" disabled={pending !== null} onClick={onlineDecline}>{t("online.drawDecline")}</button>
          </div>
        </div>
      )}
      {offer && offer === myColor && <p className="room-strip__note">{t("online.drawSent")}</p>}
      {phase === "playing" && myColor && !opponentHere && (
        <div className="room-strip__offer">
          <p><strong>{t("online.opponentLeft")}</strong></p>
          <button type="button" className="btn btn--green" disabled={pending !== null} onClick={onlineAbandon}>{t("online.claim")}</button>
        </div>
      )}
    </div>
  );
}

export function GameTab() {
  const phase = useGameStore((s) => s.phase);
  const fen = useGameStore((s) => s.fen);
  const moves = useGameStore((s) => s.moves);
  const result = useGameStore((s) => s.result);
  const myColor = useGameStore((s) => s.myColor);
  const viewPly = useGameStore((s) => s.viewPly);
  const setViewPly = useGameStore((s) => s.setViewPly);
  const takeback = useGameStore((s) => s.takeback);
  const flipBoard = useGameStore((s) => s.flipBoard);
  const seats = useGameStore((s) => s.seats);
  const players = useGameStore((s) => s.players);
  const online = useGameStore((s) => s.online);
  const spectating = useGameStore(isSpectating);
  const paused = useGameStore((s) => s.paused);
  const setPaused = useGameStore((s) => s.setPaused);
  const hintLoading = useUiStore((s) => s.hintLoading);
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);
  const setPgnOpen = useUiStore((s) => s.setPgnOpen);
  const showToast = useUiStore((s) => s.showToast);
  const startFen = useGameStore((s) => s.startFen);
  const solver = useGameStore((s) => s.solver);
  const chaos = useGameStore((s) => s.chaos.enabled);
  const verdict = useGameStore((s) => s.verdict);
  const [chaosTab, setChaosTab] = useState<ChaosTab>("chaos");
  const match = useOnlineStore((s) => s.shared.match);
  const pending = useOnlineStore((s) => s.pending);
  const opening = useOpeningName(fen, startFen);
  const { t } = useTranslation();
  const opponent = myColor && !online ? seats[myColor === "w" ? "b" : "w"] : null;
  const current = viewPly ?? moves.length;
  const myTurn = phase === "playing" && myColor !== null && useGameStore.getState().chess.turn() === myColor;
  const watching = spectating || (online !== null && !myColor);
  // The room's game this one shows, while the room still has it.
  const roomMatch = online && match?.id === online.matchId ? match : null;
  const rematchAsked = !!(roomMatch && myColor && roomMatch.rematch[myColor]);
  const rematchOffered = !!(roomMatch && myColor && roomMatch.rematch[myColor === "w" ? "b" : "w"]);

  const undo = () => {
    if (!takeback()) showToast(t("toast.undo"));
  };

  const winnerText = (winner: PieceColor) => {
    if (watching) return t(winner === "w" ? "game.whiteWon" : "game.blackWon");
    if (winner === myColor) return t("game.youWon");
    if (online) return t("online.won", { name: players[winner]?.username ?? "?" });
    return opponent ? getOpponent(opponent.id).text.won : t("game.youLost");
  };

  return (
    <div className="game-tab">
      {/* A Chaos game's panel is the cards in play (the bot speaks beside its bar); the moves are a tab away. */}
      {chaos ? <ChaosHeader tab={chaosTab} onTab={setChaosTab} /> : online ? <RoomStrip /> : <BotChat />}
      {chaos && chaosTab === "chaos" ? <ChaosBody /> : <>
      <div className="opening-row">
        <span>{opening ? <><b>{opening.eco}</b> {opening.name}</> : <StartName fen={startFen} />}</span>
        {solver && presetGoal(startFen) && (
          <span className={`verdict verdict--${verdict ?? "pending"}`} role="status">{t(`verdict.${verdict ?? "pending"}`)}</span>
        )}
      </div>
      <MoveTable />
      </>}
      {phase === "ended" && result && (
        <div className="result-row">
          <strong>{result.winner === null ? "½–½" : result.winner === "w" ? "1–0" : "0–1"}</strong>
          <span>{result.winner === null ? t("game.draw") : winnerText(result.winner)} {reasonText(result.reason)}</span>
        </div>
      )}
      <div className="game-tab__controls">
        {phase === "ended" ? (
          <>
            <button type="button" className="btn btn--wide" onClick={backToLobby}>{t(online ? "online.backToRoom" : "game.newGame")}</button>
            <button type="button" className="btn btn--wide" onClick={() => { if (!chaos) useUiStore.getState().setPanelTab("review"); setViewPly(0); }}>{t(chaos ? "chaos.browse" : "panel.review")}</button>
            {(!online || (roomMatch && myColor)) && (
              <button type="button" className="btn btn--green btn--wide" onClick={rematch} disabled={rematchAsked || pending !== null}>
                {rematchAsked ? t("online.rematchWaiting") : rematchOffered ? t("online.rematchAccept") : t(solver ? "positions.again" : "game.rematch")}
              </button>
            )}
          </>
        ) : spectating ? (
          <>
            <button type="button" className="btn btn--wide" onClick={backToLobby}>{t("game.newGame")}</button>
            <button type="button" className={`btn btn--wide${paused ? " btn--green" : ""}`} onClick={() => setPaused(!paused)}>
              {paused ? `▶ ${t("game.resume")}` : `❚❚ ${t("game.pause")}`}
            </button>
          </>
        ) : online && !myColor ? (
          <button type="button" className="btn btn--wide" onClick={backToLobby}>{t("online.backToRoom")}</button>
        ) : online ? (
          <>
            <button type="button" className="btn btn--icon" onClick={resign} title={t("game.resign")} aria-label={t("game.resign")} disabled={phase !== "playing" || pending !== null}><IconFlag /></button>
            <button type="button" className="btn btn--icon" onClick={onlineDraw} title={t("online.drawOffer")} aria-label={t("online.drawOffer")} disabled={phase !== "playing" || pending !== null || roomMatch?.drawOffer === myColor}><IconHandshake /></button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn--icon" onClick={resign} title={t("game.resign")} aria-label={t("game.resign")} disabled={phase !== "playing"}><IconFlag /></button>
            <button type="button" className="btn btn--icon" onClick={undo} title={t("game.undo")} aria-label={t("game.undo")} disabled={phase !== "playing" || moves.length === 0 || chaos}><IconUndo /></button>
            <button type="button" className={`btn btn--icon${hintLoading ? " is-loading" : ""}`} onClick={() => void requestHint()} title={t("game.hint")} aria-label={t("game.hintShort")} disabled={!myTurn || hintLoading}><IconBulb /></button>
          </>
        )}
      </div>
      <div className="game-tab__footer">
        <button type="button" onClick={() => setPgnOpen(true)} title={t("game.pgn")} aria-label={t("game.pgn")}><IconDownload /></button>
        <button type="button" onClick={() => setSettingsOpen(true)} title={t("settings.title")} aria-label={t("settings.title")}><IconGear /></button>
        <button type="button" onClick={flipBoard} title={t("game.flip")} aria-label={t("game.flip")}><IconFlip /></button>
        <span className="game-tab__nav">
          <button type="button" onClick={() => setViewPly(0)} disabled={current === 0} aria-label={t("game.first")}><IconChevron dir="first" /></button>
          <button type="button" onClick={() => setViewPly(current - 1)} disabled={current === 0} aria-label={t("game.prev")}><IconChevron dir="left" /></button>
          <button type="button" onClick={() => setViewPly(current + 1)} disabled={viewPly === null} aria-label={t("game.next")}><IconChevron dir="right" /></button>
          <button type="button" onClick={() => setViewPly(null)} disabled={viewPly === null} aria-label={t("game.last")}><IconChevron dir="last" /></button>
        </span>
      </div>
    </div>
  );
}
