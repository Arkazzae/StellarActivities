import { PersonAvatar } from "@/components/BotPortrait";
import { TIME_OPTIONS, timeOption, useUiStore, type SideChoice } from "@/state/ui";
import { acceptChallenge, cancelChallenge, myColorIn, postChallenge, useOnlineStore, watchMatch } from "@/online/sync";
import { useTranslation } from "@/i18n";
import type { TimeControl } from "@/engine/types";

const SIDES: SideChoice[] = ["w", "random", "b"];

function tcLabel(tc: TimeControl, unlimited: string): string {
  if (tc.initial === 0 && tc.increment === 0) return unlimited;
  return `${Math.round(tc.initial / 60)}${tc.increment ? ` | ${tc.increment}` : " min"}`;
}

function KingIcon({ side }: { side: SideChoice }) {
  if (side === "random") {
    return (
      <span className="side-king side-king--random">
        <img src="pieces/wk.webp" alt="" />
        <img src="pieces/bk.webp" alt="" />
      </span>
    );
  }
  return <span className="side-king"><img src={`pieces/${side}k.webp`} alt="" /></span>;
}

/**
 * The voice channel's board before a game: who is here, the open challenge, and the game being played.
 * Anyone posts a challenge with a time control and a colour; anyone else in the room accepts it.
 */
export function OnlineLobby() {
  const { t } = useTranslation();
  const shared = useOnlineStore((s) => s.shared);
  const participants = useOnlineStore((s) => s.participants);
  const me = useOnlineStore((s) => s.me);
  const host = useOnlineStore((s) => s.host);
  const pending = useOnlineStore((s) => s.pending);
  const connection = useOnlineStore((s) => s.connection);
  const timeId = useUiStore((s) => s.onlineTimeId);
  const setTimeId = useUiStore((s) => s.setOnlineTimeId);
  const side = useUiStore((s) => s.onlineSide);
  const setSide = useUiStore((s) => s.setOnlineSide);
  const { challenge, match } = shared;
  const live = match && !match.result ? match : null;
  const mine = myColorIn(live, me);
  const nameOf = (id: string) => participants.find((person) => person.id === id)?.name ?? "?";
  const busy = pending !== null || connection !== "connected";
  const available = useOnlineStore((s) => s.available);

  // Outside a shared Stellarr session there is nobody to play: say how multiplayer works.
  if (!available) {
    return (
      <div className="online-lobby online-lobby--alone">
        <img src="icons/nav/room.webp" alt="" />
        <p>{t("online.unavailable")}</p>
      </div>
    );
  }

  return (
    <div className="online-lobby">
      <section className="bot-select__section">
        <h3>{t("online.inRoom", { count: participants.length })}</h3>
        <ul className="room-people">
          {participants.map((person) => (
            <li key={person.id} className={person.connected ? "" : "is-away"}>
              <PersonAvatar name={person.name} url={person.avatar} />
              <span>{person.name}{person.id === me && <em> · {t("online.you")}</em>}</span>
              {live && (live.players.w === person.id || live.players.b === person.id) && <small>{t("online.playing")}</small>}
              {!live && person.id === host && <small>{t("online.host")}</small>}
            </li>
          ))}
        </ul>
        {participants.length < 2 && <p className="bot-select__note">{t("online.alone")}</p>}
      </section>

      {live && (
        <section className="bot-select__section room-live">
          <h3>{t("online.liveTitle")}</h3>
          <p><strong>{live.names.w}</strong> <span>vs</span> <strong>{live.names.b}</strong> · {tcLabel(live.tc, t("time.none"))}</p>
          <button type="button" className="btn btn--green btn--wide" onClick={watchMatch}>{mine ? t("online.backToGame") : t("online.watch")}</button>
        </section>
      )}

      {!live && challenge && (
        <section className="bot-select__section room-challenge">
          <h3>{challenge.by === me ? t("online.yourChallenge") : t("online.challengeFrom", { name: nameOf(challenge.by) })}</h3>
          <p className="room-challenge__terms">
            <KingIcon side={challenge.by === me ? challenge.color : challenge.color === "random" ? "random" : challenge.color === "w" ? "b" : "w"} />
            <span>{tcLabel(challenge.tc, t("time.none"))} · {t(challenge.color === "random" ? "online.colorRandom" : challenge.by === me ? `online.youPlay.${challenge.color}` : `online.youPlay.${challenge.color === "w" ? "b" : "w"}`)}</span>
          </p>
          {challenge.by === me ? (
            <>
              <p className="bot-select__note">{t("online.waiting")}</p>
              <button type="button" className="btn btn--wide" disabled={busy} onClick={() => void cancelChallenge().catch(() => undefined)}>{t("online.cancel")}</button>
            </>
          ) : (
            <button type="button" className="btn-play" disabled={busy} onClick={() => void acceptChallenge(challenge.id).catch(() => undefined)}>{t("online.accept")}</button>
          )}
        </section>
      )}

      {!live && !challenge && (
        <>
          <section className="bot-select__section">
            <h3>{t("online.newChallenge")}</h3>
            <div className="time-pick" role="radiogroup" aria-label={t("select.time")}>
              {TIME_OPTIONS.map((option) => (
                <button key={option.id} type="button" role="radio" aria-checked={timeId === option.id} className={timeId === option.id ? "is-selected" : ""} onClick={() => setTimeId(option.id)}>
                  {option.id === "none" ? t("time.none") : option.label}
                </button>
              ))}
            </div>
          </section>
          <section className="bot-select__section">
            <h3>{t("select.playAs")}</h3>
            <div className="side-pick" role="radiogroup" aria-label={t("select.colorAria")}>
              {SIDES.map((item) => (
                <button key={item} type="button" role="radio" aria-checked={side === item} className={side === item ? "is-selected" : ""} onClick={() => setSide(item)} title={t(`side.${item}`)} aria-label={t(`side.${item}`)}>
                  <KingIcon side={item} />
                </button>
              ))}
            </div>
          </section>
          <div className="bot-select__footer">
            <button type="button" className="btn-play" disabled={busy} onClick={() => void postChallenge(timeOption(timeId).tc, side).catch(() => undefined)}>
              {t("online.post")}
            </button>
          </div>
        </>
      )}

      {match?.result && !live && (
        <p className="bot-select__note">{t("online.lastGame", { white: match.names.w, black: match.names.b, score: match.result.winner === null ? "½–½" : match.result.winner === "w" ? "1–0" : "0–1" })}</p>
      )}
      {connection !== "connected" && <p className="bot-select__note room-connection">{t(`online.connection.${connection}`)}</p>}
    </div>
  );
}
