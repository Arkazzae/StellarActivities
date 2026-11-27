import { BotPortrait, PersonAvatar } from "@/components/BotPortrait";
import { useEffect, useState } from "react";
import { isSpectating, useGameStore } from "@/state/game";
import { useUiStore } from "@/state/ui";
import { getOpponent } from "@/ai/bots";
import { backToLobby, reasonText, rematch } from "@/game/session";
import { useOnlineStore, matchById } from "@/online/sync";
import { useTranslation } from "@/i18n";
import type { PieceColor } from "@/engine/types";
import { presetGoal, startLabel } from "@/engine/positions";

export function GameOverDialog() {
  const phase = useGameStore((s) => s.phase);
  const result = useGameStore((s) => s.result);
  const verdict = useGameStore((s) => s.verdict);
  const solver = useGameStore((s) => s.solver);
  const chaos = useGameStore((s) => s.chaos.enabled);
  const startFen = useGameStore((s) => s.startFen);
  const myColor = useGameStore((s) => s.myColor);
  const seats = useGameStore((s) => s.seats);
  const players = useGameStore((s) => s.players);
  const online = useGameStore((s) => s.online);
  const spectating = useGameStore(isSpectating);
  const setPanelTab = useUiStore((s) => s.setPanelTab);
  const setViewPly = useGameStore((s) => s.setViewPly);
  const shownId = useGameStore((s) => s.online?.matchId ?? null);
  const match = useOnlineStore((s) => matchById(s.shared, shownId));
  const [open, setOpen] = useState(false);
  const [quip] = useState(() => Math.floor(Math.random() * 2));
  const { t } = useTranslation();

  useEffect(() => {
    if (phase !== "ended" || (!result && !verdict)) return;
    // Let the last move land before the dialog covers the board.
    const timer = setTimeout(() => setOpen(true), 450);
    return () => clearTimeout(timer);
  }, [phase, result, verdict]);
  useEffect(() => {
    if (phase !== "ended") setOpen(false);
  }, [phase]);

  if (!open || (!result && !verdict)) return null;
  // A position from the Positions tab ends with its verdict; one stopped early (a mate in 2 missed) has no chess result.
  const test = solver && verdict ? { solved: verdict === "solved", label: startLabel(startFen), goal: presetGoal(startFen) } : null;
  const watching = spectating || (!!online && !myColor);
  const won = !!result && result.winner !== null && result.winner === myColor;
  const draw = !result || result.winner === null;
  const opponent = myColor && !online ? seats[myColor === "w" ? "b" : "w"] : null;
  const rival = opponent ? getOpponent(opponent.id) : null;
  const title = test ? t(`verdict.${verdict}`)
    : draw ? t("over.draw")
    : watching ? (online ? t("online.won", { name: players[result!.winner!]?.username ?? "?" }) : t(result!.winner === "w" ? "over.whiteWon" : "over.blackWon"))
    : won ? t("over.won")
    : online ? t("online.won", { name: players[result!.winner!]?.username ?? "?" })
    : rival ? rival.text.over : t("over.lost");
  const outcome = draw ? "draw" : won ? "win" : "loss";
  const quipText = rival && !test ? rival.text.quips[outcome][quip] : watching && !online ? t(`over.quip.match.${quip}`) : null;
  const roomMatch = online && match?.id === online.matchId ? match : null;
  const rematchAsked = !!(roomMatch && myColor && roomMatch.rematch[myColor]);

  const figure = (color: PieceColor, winner: boolean) => {
    const seat = online ? null : seats[color];
    const bot = seat ? getOpponent(seat.id) : null;
    const person = online ? players[color] : null;
    // Two of the same bot are told apart by colour.
    const caption = person ? person.username : !bot ? t("player.you") : spectating && seats.w?.id === seats.b?.id ? t(`side.${color}`) : bot.name;
    return (
      <figure className={winner ? "is-winner" : ""}>
        {bot ? <span className="avatar" style={{ background: bot.tint }}><BotPortrait id={bot.id} /></span>
          : person ? <span className="avatar"><PersonAvatar name={person.username} url={person.avatarUrl} /></span>
          : <span className="avatar"><img src="avatars/player.svg" alt="" /></span>}
        <figcaption>{caption}</figcaption>
      </figure>
    );
  };
  // The player on the left; White on the left when watching.
  const left: PieceColor = myColor ?? "w";
  const right: PieceColor = left === "w" ? "b" : "w";

  return (
    <div className="game-over" role="dialog" aria-modal="true" aria-labelledby="game-over-title">
      <div className={`game-over__card${test ? (test.solved ? " is-win" : " is-loss") : won ? " is-win" : draw || watching ? " is-draw" : " is-loss"}`}>
        <button type="button" className="game-over__close" onClick={() => setOpen(false)} aria-label={t("over.close")}>×</button>
        <header>
          <span className="game-over__trophy" aria-hidden="true">{test ? (test.solved ? "🏆" : "🧩") : won || (watching && !draw) ? "🏆" : draw ? "🤝" : "🏁"}</span>
          <h2 id="game-over-title">{title}</h2>
          {test ? (
            <>
              {test.label.kind === "preset" && <p>{t(`preset.${test.label.id}`)} · {t(`preset.${test.label.id}.goal`)}</p>}
              <p className="game-over__quip">
                {result ? `${t(result.winner === null ? "over.draw" : result.winner === "w" ? "over.whiteWon" : "over.blackWon")} ${reasonText(result.reason)}`
                  : test.goal && "moves" in test.goal ? t("verdict.outOfMoves", { n: test.goal.moves }) : null}
              </p>
            </>
          ) : (
            <>
              <p>{reasonText(result!.reason)}</p>
              {quipText && <p className="game-over__quip">{quipText}</p>}
            </>
          )}
        </header>
        <div className="game-over__players">
          {figure(left, test ? test.solved && solver === left : result?.winner === left)}
          <span className="game-over__vs">vs</span>
          {figure(right, test ? test.solved && solver === right : result?.winner === right)}
        </div>
        <div className="game-over__actions">
          {/* A Chaos game is browsed move by move; the engine review needs a game that replays from its moves. */}
          <button type="button" className="btn btn--green btn--big" onClick={() => {
            setOpen(false);
            if (!chaos) setPanelTab("review");
            setViewPly(0);
            document.querySelector(".app__main")?.scrollTo({ top: 0, behavior: "smooth" });
          }}>{t(chaos ? "chaos.browse" : "review.open")}</button>
          {(!online || (roomMatch && myColor)) && (
            <button type="button" className="btn btn--big" onClick={rematch} disabled={rematchAsked}>
              {rematchAsked ? t("online.rematchWaiting") : t(solver ? "positions.again" : "game.rematch")}
            </button>
          )}
          <div className="game-over__row">
            <button type="button" className="btn" onClick={backToLobby}>{t(online ? "online.backToRoom" : "game.newGame")}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
