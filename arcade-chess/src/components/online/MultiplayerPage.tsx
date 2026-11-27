import { useMemo } from "react";
import { PersonAvatar } from "@/components/BotPortrait";
import { MiniBoard } from "@/components/play/PositionGallery";
import { usePieceUrl } from "@/board-style";
import { TIME_OPTIONS, timeOption, useUiStore, type SideChoice } from "@/state/ui";
import { closeTable, hostTable, joinTable, myColorIn, tableOf, useOnlineStore, watchTable } from "@/online/sync";
import { replay, type Table } from "@/online/protocol";
import { useTranslation } from "@/i18n";
import type { TimeControl } from "@/engine/types";

const SIDES: SideChoice[] = ["w", "random", "b"];

function tcLabel(tc: TimeControl, unlimited: string): string {
  if (tc.initial === 0 && tc.increment === 0) return unlimited;
  return `${Math.round(tc.initial / 60)}${tc.increment ? ` | ${tc.increment}` : " min"}`;
}

function KingIcon({ side }: { side: SideChoice }) {
  const pieceUrl = usePieceUrl();
  if (side === "random") {
    return (
      <span className="side-king side-king--random">
        <img src={pieceUrl("w", "k")} alt="" />
        <img src={pieceUrl("b", "k")} alt="" />
      </span>
    );
  }
  return <span className="side-king"><img src={pieceUrl(side, "k")} alt="" /></span>;
}

/** A table waiting for an opponent: who hosts it, the clock, the colour you would get. */
function OpenTable({ table, me, busy, playing }: { table: Table; me: string; busy: boolean; playing: boolean }) {
  const { t } = useTranslation();
  const mine = table.host === me;
  // The colour you would get by joining: the opposite of the host's.
  const yours: SideChoice = table.color === "random" ? "random" : table.color === "w" ? "b" : "w";
  return (
    <li className={`mp-table mp-open${mine ? " is-mine" : ""}`}>
      <PersonAvatar name={table.hostName} url={table.hostAvatar} />
      <span className="mp-table__text">
        <strong>{mine ? t("online.yourTable") : table.hostName}</strong>
        <span>{mine ? t("online.waitingOpponent") : t(yours === "random" ? "online.colorRandom" : `online.youPlay.${yours}`)}</span>
      </span>
      <span className="mp-open__clock">{tcLabel(table.tc, t("time.none"))}</span>
      <KingIcon side={mine ? table.color : yours} />
      {/* Your own table is closed from the card beside the list. */}
      {mine
        ? <span className="mp-open__mine">{t("online.you")}</span>
        : <button type="button" className="btn btn--green" disabled={busy || playing} onClick={() => void joinTable(table.id).catch(() => undefined)}>{t("online.join")}</button>}
    </li>
  );
}

/** A game at a table: both players, the live position, the clock and the move, and the way in. */
function GameTable({ table, me }: { table: Table; me: string }) {
  const { t } = useTranslation();
  const match = table.match!;
  const fen = useMemo(() => {
    try {
      return replay(match).fen();
    } catch {
      return match.startFen;
    }
  }, [match]);
  const mine = myColorIn(match, me) !== null;
  const score = match.result ? (match.result.winner === null ? "½–½" : match.result.winner === "w" ? "1–0" : "0–1") : null;
  return (
    <li className={`mp-table mp-game${mine ? " is-mine" : ""}${score ? " is-over" : ""}`}>
      <button type="button" className="mp-game__board" onClick={() => watchTable(table.id)} aria-label={t(score ? "online.view" : "online.watch")}>
        <MiniBoard fen={fen} />
      </button>
      <span className="mp-game__players">
        <span><PersonAvatar name={match.names.w} url={match.avatars.w} /><strong>{match.names.w}</strong></span>
        <span><PersonAvatar name={match.names.b} url={match.avatars.b} /><strong>{match.names.b}</strong></span>
      </span>
      <span className="mp-game__state">
        {score ? <b>{score}</b> : <><i className="mp-table__live" aria-hidden="true" />{t("online.tableMove", { n: Math.floor(match.moves.length / 2) + 1 })}</>}
        <span>{tcLabel(match.tc, t("time.none"))}</span>
      </span>
      <button type="button" className={`btn${mine && !score ? " btn--green" : ""}`} onClick={() => watchTable(table.id)}>
        {mine && !score ? t("online.backToGame") : score ? t("online.view") : t("online.watch")}
      </button>
    </li>
  );
}

/**
 * The Multiplayer page: the tables open for an opponent, the games being played (to watch), and
 * on the side the way to host a game, your own table or game, and who is in the activity. The
 * board opens only for a game: one you join, one you watch, or yours when it starts.
 */
export function MultiplayerPage() {
  const { t } = useTranslation();
  const shared = useOnlineStore((s) => s.shared);
  const participants = useOnlineStore((s) => s.participants);
  const me = useOnlineStore((s) => s.me);
  const pending = useOnlineStore((s) => s.pending);
  const connection = useOnlineStore((s) => s.connection);
  const available = useOnlineStore((s) => s.available);
  const timeId = useUiStore((s) => s.onlineTimeId);
  const setTimeId = useUiStore((s) => s.setOnlineTimeId);
  const side = useUiStore((s) => s.onlineSide);
  const setSide = useUiStore((s) => s.setOnlineSide);
  const busy = pending !== null || connection !== "connected";

  const header = (
    <header className="mp-page__head">
      <img src="icons/nav/room.webp" alt="" />
      <div><h1>{t("online.title")}</h1><p>{t("online.lead")}</p></div>
    </header>
  );

  // Outside a shared Stellarr session there is nobody to play: say how multiplayer works.
  if (!available) {
    return (
      <div className="mp-page">
        {header}
        <div className="online-lobby--alone mp-alone">
          <img src="icons/nav/room.webp" alt="" />
          <p>{t("online.unavailable")}</p>
        </div>
      </div>
    );
  }

  const tables = shared.tables;
  const open = tables.filter((table) => !table.match);
  const games = tables.filter((table) => table.match);
  const myGame = tableOf(shared, me);
  const myTable = open.find((table) => table.host === me) ?? null;
  const status = (id: string) => {
    if (games.some((table) => !table.match!.result && myColorIn(table.match, id) !== null)) return t("online.playing");
    if (open.some((table) => table.host === id)) return t("online.hosting");
    return null;
  };

  return (
    <div className="mp-page online-lobby">
      {header}
      <div className="mp-page__main">
        <div className="mp-page__tables">
          <section aria-labelledby="mp-open">
            <h2 id="mp-open">{t("online.openTables", { count: open.length })}</h2>
            {open.length
              ? <ul className="mp-list">{open.map((table) => <OpenTable key={table.id} table={table} me={me} busy={busy} playing={!!myGame} />)}</ul>
              : <p className="mp-empty">{t("online.noOpenTables")}</p>}
          </section>
          <section aria-labelledby="mp-games">
            <h2 id="mp-games">{t("online.games", { count: games.length })}</h2>
            {games.length
              ? <ul className="mp-list mp-list--games">{games.map((table) => <GameTable key={table.id} table={table} me={me} />)}</ul>
              : <p className="mp-empty">{t("online.noGames")}</p>}
          </section>
        </div>

        <aside className="mp-page__side">
          {myGame ? (
            <section className="mp-card mp-card--mine">
              <h2>{t("online.yourGame")}</h2>
              <p>{myGame.match!.names.w} <span>vs</span> {myGame.match!.names.b}</p>
              <button type="button" className="btn btn--green btn--big" onClick={() => watchTable(myGame.id)}>{t("online.backToGame")}</button>
            </section>
          ) : myTable ? (
            <section className="mp-card mp-card--mine">
              <h2>{t("online.yourTable")}</h2>
              <p>{tcLabel(myTable.tc, t("time.none"))} · {t(myTable.color === "random" ? "online.colorRandom" : `online.youPlay.${myTable.color}`)}</p>
              <p className="mp-card__note">{t("online.waitingHint")}</p>
              <button type="button" className="btn" disabled={busy} onClick={() => void closeTable(myTable.id).catch(() => undefined)}>{t("online.closeTable")}</button>
            </section>
          ) : (
            <section className="mp-card">
              <h2>{t("online.hostTitle")}</h2>
              <span className="look-label">{t("select.time")}</span>
              <div className="time-pick" role="radiogroup" aria-label={t("select.time")}>
                {TIME_OPTIONS.map((option) => (
                  <button key={option.id} type="button" role="radio" aria-checked={timeId === option.id} className={timeId === option.id ? "is-selected" : ""} onClick={() => setTimeId(option.id)}>
                    {option.id === "none" ? t("time.none") : option.label}
                  </button>
                ))}
              </div>
              <span className="look-label">{t("select.playAs")}</span>
              <div className="side-pick" role="radiogroup" aria-label={t("select.colorAria")}>
                {SIDES.map((item) => (
                  <button key={item} type="button" role="radio" aria-checked={side === item} className={side === item ? "is-selected" : ""} onClick={() => setSide(item)} title={t(`side.${item}`)} aria-label={t(`side.${item}`)}>
                    <KingIcon side={item} />
                  </button>
                ))}
              </div>
              <button type="button" className="btn-play" disabled={busy} onClick={() => void hostTable(timeOption(timeId).tc, side).catch(() => undefined)}>
                {t("online.hostButton")}
              </button>
            </section>
          )}

          <section className="mp-card">
            <h2>{t("online.inRoom", { count: participants.length })}</h2>
            <ul className="room-people">
              {participants.map((person) => (
                <li key={person.id} className={person.connected ? "" : "is-away"}>
                  <PersonAvatar name={person.name} url={person.avatar} />
                  <span>{person.name}{person.id === me && <em> · {t("online.you")}</em>}</span>
                  {status(person.id) && <small>{status(person.id)}</small>}
                </li>
              ))}
            </ul>
            {participants.length < 2 && <p className="mp-card__note">{t("online.alone")}</p>}
          </section>
          {connection !== "connected" && <p className="mp-card__note room-connection">{t(`online.connection.${connection}`)}</p>}
        </aside>
      </div>
    </div>
  );
}
