import { useEffect, useState } from "react";
import { usePieceUrl } from "@/board-style";
import { BotPortrait, PersonAvatar } from "@/components/BotPortrait";
import { useChatStore } from "@/state/chat";
import { useTranslation } from "@/i18n";
import { useGameStore } from "@/state/game";
import { useUiStore } from "@/state/ui";
import { getOpponent, seatSubtitle, type Seat } from "@/ai/bots";
import { lobbySeats } from "@/game/session";
import { useOnlineStore } from "@/online/sync";
import { Clock } from "@/components/Clock";
import { EffectIcons } from "@/components/chaos/ChaosPanel";
import type { PieceColor, PieceType } from "@/engine/types";

const VALUE: Record<PieceType, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const ORDER: PieceType[] = ["p", "n", "b", "r", "q"];

function Captured({ pieces, color }: { pieces: PieceType[]; color: PieceColor }) {
  const pieceUrl = usePieceUrl();
  const groups = ORDER.map((type) => ({ type, count: pieces.filter((p) => p === type).length })).filter((g) => g.count);
  return (
    <span className="captured">
      {groups.map(({ type, count }) => (
        <span key={type} className="captured__group">
          {Array.from({ length: count }, (_, i) => <img key={i} src={pieceUrl(color, type)} alt="" />)}
        </span>
      ))}
    </span>
  );
}

/** In a Chaos game the bot speaks beside its name for a few seconds (its panel holds the cards). */
function BarSpeech({ id }: { id: string }) {
  const last = useChatStore((s) => s.log.at(-1));
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!last || last.speaker !== id) return;
    setVisible(true);
    const timer = window.setTimeout(() => setVisible(false), 5000);
    return () => window.clearTimeout(timer);
  }, [last, id]);
  if (!visible || !last || last.speaker !== id) return null;
  return <span className="bar-speech" role="status" key={last.timestamp}>{last.text}</span>;
}

export function PlayerBar({ side }: { side: PieceColor }) {
  const phase = useGameStore((s) => s.phase);
  const gameSeats = useGameStore((s) => s.seats);
  const online = useGameStore((s) => s.online);
  const players = useGameStore((s) => s.players);
  const myColor = useGameStore((s) => s.myColor);
  const paused = useGameStore((s) => s.paused);
  const captured = useGameStore((s) => s.capturedPieces);
  const chess = useGameStore((s) => s.chess);
  const flipped = useGameStore((s) => s.flipped);
  const chaosGame = useGameStore((s) => s.chaos.enabled);
  useGameStore((s) => s.fen);
  // Before the game the bars preview the choices on the bot screen (a random colour shows as White).
  const view = useUiStore((s) => s.view);
  const mode = useUiStore((s) => s.mode);
  useUiStore((s) => s.opponent);
  useUiStore((s) => s.match);
  useUiStore((s) => s.engine);
  useUiStore((s) => s.positionPick);
  useUiStore((s) => s.chess960);
  useUiStore((s) => s.customFen);
  const uiSide = useUiStore((s) => s.side);
  const participants = useOnlineStore((s) => s.participants);
  const { t } = useTranslation();
  const room = view === "online" && phase === "lobby";
  const seat: Seat | null = room || online ? null
    : phase === "lobby" ? lobbySeats(mode === "positions" ? undefined : uiSide === "random" ? "w" : uiSide)[side] : gameSeats[side];
  const bot = seat ? getOpponent(seat.id) : null;
  const person = online ? players[side] : null;
  const away = !!person && !participants.some((entry) => entry.id === person.userId && entry.connected);
  const opponent: PieceColor = side === "w" ? "b" : "w";
  // Pieces this side has taken are the opponent's lost pieces.
  const taken = captured[opponent];
  let material = 0;
  for (const row of chess.board()) for (const piece of row) if (piece) material += (piece.color === side ? 1 : -1) * VALUE[piece.type as PieceType];
  // A bot (or the other person) with the move is thinking.
  const thinking = phase === "playing" && !paused && chess.turn() === side && (!!bot || (!!person && side !== myColor));
  const drill = useGameStore((s) => s.drill);
  // In a puzzle drill the bars say who is who: the player and the defence.
  const name = room ? t(`side.${side}`) : person ? person.username : bot ? bot.name : drill ? players[side]?.username ?? t("player.you") : t("player.you");

  return (
    <div className={`player-bar${thinking ? " is-thinking" : ""}`}>
      <div className="player-bar__avatar" style={bot ? { background: bot.tint } : undefined}>
        {bot ? <BotPortrait id={bot.id} /> : person ? <PersonAvatar name={person.username} url={person.avatarUrl} /> : <img src="avatars/player.svg" alt="" />}
      </div>
      <div className="player-bar__info">
        <div className="player-bar__name">
          <strong>{name}</strong>
          {seat && <span className="player-bar__rating">{seatSubtitle(seat)}</span>}
          {person && side === myColor && <span className="player-bar__rating">{t("online.you")}</span>}
          {away && <span className="player-bar__away">{t("online.away")}</span>}
          {phase !== "lobby" && <EffectIcons side={side} below={side === (flipped ? "w" : "b")} />}
          {thinking && <span className="player-bar__thinking">{t("player.thinking")}…</span>}
          {chaosGame && bot && phase !== "lobby" && <BarSpeech id={bot.id} />}
        </div>
        <div className="player-bar__material">
          <Captured pieces={taken} color={opponent} />
          {material > 0 && <span className="player-bar__adv">+{material}</span>}
        </div>
      </div>
      {phase !== "lobby" && <Clock side={side} />}
    </div>
  );
}
