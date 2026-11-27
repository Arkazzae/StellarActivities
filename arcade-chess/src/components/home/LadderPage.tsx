import { useMemo, useState } from "react";
import { BotPortrait, PersonAvatar } from "@/components/BotPortrait";
import { getCharacter, OPPONENTS, type OpponentId } from "@/ai/bots";
import { hasBeaten, useStatsStore, type Rating } from "@/state/stats";
import { useUiStore } from "@/state/ui";
import { openRoom, useOnlineStore } from "@/online/sync";
import { START_ELO, type Profile, type ResultEntry } from "@/online/protocol";
import { formatLocale, useTranslation } from "@/i18n";
import { session } from "@/stellarr/sdk";

const LADDER = OPPONENTS.filter((opponent) => opponent.kind === "character");
const ENGINE = OPPONENTS.find((opponent) => opponent.kind === "engine")!;

type Tab = "players" | "bots";

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "±0");
const winRate = (card: { w: number; d: number; l: number }) => {
  const games = card.w + card.d + card.l;
  return games ? Math.round(((card.w + card.d / 2) / games) * 100) : null;
};

function ago(at: number, now: number): string {
  const minutes = Math.round((now - at) / 60_000);
  const format = new Intl.RelativeTimeFormat(formatLocale(), { numeric: "auto" });
  if (minutes < 60) return format.format(-Math.max(0, minutes), "minute");
  const hours = Math.round(minutes / 60);
  return hours < 24 ? format.format(-hours, "hour") : format.format(-Math.round(hours / 24), "day");
}

function Change({ n }: { n: number | null }) {
  if (n === null) return <span className="elo-change">–</span>;
  return <span className={`elo-change${n > 0 ? " is-up" : n < 0 ? " is-down" : ""}`}>{signed(n)}</span>;
}

interface Row {
  id: string;
  card: Profile;
  here: boolean;
  last: number | null;
  playing: boolean;
  /** Whether the room has this person's card yet (otherwise they are shown at the start rating). */
  known: boolean;
}

/** The session's ranking: everyone who has shown their Stellarr Elo here, strongest first. */
function Ranking({ rows, me }: { rows: Row[]; me: string }) {
  const { t } = useTranslation();
  return (
    <table className="elo-table">
      <thead>
        <tr>
          <th scope="col" className="elo-table__rank">#</th>
          <th scope="col">{t("ladder.player")}</th>
          <th scope="col" className="elo-table__num">{t("ladder.elo")}</th>
          <th scope="col" className="elo-table__num">{t("ladder.last")}</th>
          <th scope="col" className="elo-table__num elo-table__games">{t("ladder.games")}</th>
          <th scope="col" className="elo-table__num">{t("ladder.wdl")}</th>
          <th scope="col" className="elo-table__num elo-table__wide">{t("ladder.score")}</th>
          <th scope="col" className="elo-table__num elo-table__wide">{t("ladder.peak")}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => {
          const rate = winRate(row.card);
          return (
            <tr key={row.id} className={`${row.id === me ? "is-me" : ""}${row.here ? "" : " is-away"}`} data-card={row.known ? "room" : "assumed"}>
              <td className="elo-table__rank">{i + 1}</td>
              <td>
                <span className="elo-table__who">
                  <PersonAvatar name={row.card.name} url={row.card.avatar} />
                  <span>
                    <strong>{row.card.name}</strong>
                    <small>{row.id === me ? t("online.you") : row.playing ? t("online.playing") : row.here ? (row.card.games ? "" : t("ladder.new")) : t("ladder.left")}</small>
                  </span>
                </span>
              </td>
              <td className="elo-table__num elo-table__elo">{row.card.elo}</td>
              <td className="elo-table__num"><Change n={row.last} /></td>
              <td className="elo-table__num elo-table__games">{row.card.games}</td>
              <td className="elo-table__num elo-table__wdl">
                <span className="is-w">{row.card.w}</span>–<span>{row.card.d}</span>–<span className="is-l">{row.card.l}</span>
              </td>
              <td className="elo-table__num elo-table__wide">{rate === null ? "–" : `${rate}%`}</td>
              <td className="elo-table__num elo-table__wide">{row.card.peak}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** A finished game of the session, with what it did to both ratings. */
function ResultRow({ entry, me, now }: { entry: ResultEntry; me: string; now: number }) {
  const { t } = useTranslation();
  const score = entry.result.winner === null ? "½–½" : entry.result.winner === "w" ? "1–0" : "0–1";
  const side = (color: "w" | "b") => (
    <span className={`elo-result__side${entry.result.winner === color ? " is-winner" : ""}${entry.players[color] === me ? " is-me" : ""}`}>
      <strong>{entry.names[color]}</strong>
      <Change n={entry.change[color]} />
    </span>
  );
  return (
    <li className="elo-result">
      {side("w")}
      <span className="elo-result__score"><b>{score}</b><small>{t(`reason.${entry.result.reason}`)}</small></span>
      {side("b")}
      <time className="elo-result__at">{ago(entry.at, now)}</time>
    </li>
  );
}

/** The player's own rating card: their Stellarr Elo, its best, the record and the last games. */
function MyRating({ rating, name, avatar }: { rating: Rating; name: string; avatar: string | null }) {
  const { t } = useTranslation();
  const rate = winRate(rating);
  const last = rating.log[0]?.change ?? null;
  return (
    <section className="mp-card elo-me" aria-labelledby="elo-me">
      <header className="elo-me__head">
        <PersonAvatar name={name} url={avatar} />
        <div>
          <h2 id="elo-me">{t("ladder.yourElo")}</h2>
          <span>{name}</span>
        </div>
      </header>
      <div className="elo-me__value">
        <strong>{rating.elo}</strong>
        {last !== null && <Change n={last} />}
      </div>
      <dl className="elo-me__facts">
        <div><dt>{t("ladder.peak")}</dt><dd>{rating.peak}</dd></div>
        <div><dt>{t("ladder.games")}</dt><dd>{rating.games}</dd></div>
        <div><dt>{t("ladder.wdl")}</dt><dd>{rating.w}–{rating.d}–{rating.l}</dd></div>
        <div><dt>{t("ladder.score")}</dt><dd>{rate === null ? "–" : `${rate}%`}</dd></div>
      </dl>
      {rating.log.length > 0 ? (
        <ol className="elo-me__log">
          {rating.log.slice(0, 6).map((game, i) => (
            <li key={`${game.at}-${i}`}>
              <span className={`elo-me__outcome is-${game.outcome}`}>{t(`stats.short.${game.outcome}`)}</span>
              <span>{game.opponent}</span>
              <Change n={game.change} />
              <b>{game.elo}</b>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mp-card__note">{t("ladder.unrated", { elo: START_ELO })}</p>
      )}
    </section>
  );
}

function PlayersTab() {
  const { t } = useTranslation();
  const available = useOnlineStore((s) => s.available);
  const me = useOnlineStore((s) => s.me);
  const shared = useOnlineStore((s) => s.shared);
  const participants = useOnlineStore((s) => s.participants);
  const rating = useStatsStore((s) => s.rating);
  const identity = session().context.me;
  const name = available ? identity.name : t("player.you");
  const avatar = available ? identity.avatar : null;
  const now = Date.now();

  const rows = useMemo<Row[]>(() => {
    const cards = new Map<string, Profile>(Object.entries(shared.profiles ?? {}));
    // Everyone here is ranked, the ones whose card has not arrived yet at the start rating.
    for (const person of participants) {
      if (!cards.has(person.id)) cards.set(person.id, { name: person.name, avatar: person.avatar, elo: START_ELO, peak: START_ELO, games: 0, w: 0, d: 0, l: 0, at: 0 });
    }
    // Your own card is the saved one, so it shows the newest rating even before the room has it.
    if (me) cards.set(me, { ...(cards.get(me) ?? { name, avatar, at: 0 }), elo: rating.elo, peak: rating.peak, games: rating.games, w: rating.w, d: rating.d, l: rating.l } as Profile);
    const lastChange = (id: string) => {
      const entry = shared.results.find((item) => item.players.w === id || item.players.b === id);
      return entry ? entry.change[entry.players.w === id ? "w" : "b"] : null;
    };
    const playing = (id: string) => shared.tables.some((table) => table.match && !table.match.result && (table.match.players.w === id || table.match.players.b === id));
    return [...cards.entries()]
      .map(([id, saved]) => {
        // Someone here is shown by their current Stellarr name and picture.
        const person = participants.find((item) => item.id === id);
        const card = person ? { ...saved, name: person.name, avatar: person.avatar } : saved;
        return { id, card, here: !!person?.connected, last: id === me ? rating.log[0]?.change ?? lastChange(id) : lastChange(id), playing: playing(id), known: id in (shared.profiles ?? {}) };
      })
      .sort((a, b) => b.card.elo - a.card.elo || b.card.games - a.card.games || a.card.name.localeCompare(b.card.name));
  }, [shared, participants, me, rating, name, avatar]);

  const myRank = rows.findIndex((row) => row.id === me) + 1;

  return (
    <div className="elo-page">
      <div className="elo-page__main">
        {available ? (
          <>
            <section aria-labelledby="elo-ranking">
              <div className="elo-page__title">
                <h2 id="elo-ranking">{t("ladder.ranking", { count: rows.length })}</h2>
                {myRank > 0 && rows.length > 1 && <span>{t("ladder.yourPlace", { place: myRank, total: rows.length })}</span>}
              </div>
              <div className="elo-table__wrap"><Ranking rows={rows} me={me} /></div>
              {rows.length < 2 && <p className="mp-empty">{t("ladder.aloneHere")}</p>}
            </section>
            <section aria-labelledby="elo-results">
              <div className="elo-page__title">
                <h2 id="elo-results">{t("ladder.results")}</h2>
              </div>
              {shared.results.length
                ? <ul className="elo-results">{shared.results.slice(0, 12).map((entry) => <ResultRow key={entry.id} entry={entry} me={me} now={now} />)}</ul>
                : (
                  <div className="elo-empty">
                    <p>{t("ladder.noResults")}</p>
                    <button type="button" className="btn btn--green" onClick={openRoom}>{t("ladder.toMultiplayer")}</button>
                  </div>
                )}
            </section>
          </>
        ) : (
          <section className="elo-empty elo-empty--alone">
            <img src="icons/nav/room.webp" alt="" />
            <h2>{t("ladder.offlineTitle")}</h2>
            <p>{t("ladder.offline")}</p>
          </section>
        )}
      </div>
      <aside className="elo-page__side">
        <MyRating rating={rating} name={name} avatar={avatar} />
        <p className="elo-page__about">{t("ladder.about", { elo: START_ELO })}</p>
      </aside>
    </div>
  );
}

function BotsTab() {
  const { t } = useTranslation();
  const bots = useStatsStore((s) => s.bots);
  const setMode = useUiStore((s) => s.setMode);
  const setView = useUiStore((s) => s.setView);
  const choose = useUiStore((s) => s.choose);
  const beaten = LADDER.filter((bot) => hasBeaten(bots, bot.id)).length;
  const next = LADDER.find((bot) => !hasBeaten(bots, bot.id));

  const play = (id: OpponentId) => {
    setMode("vsBot");
    choose(id);
    setView("play");
  };

  return (
    <>
      <div className="ladder-page__progress">
        <span>{t("ladder.beaten")}</span>
        <strong>{t("stats.ladder", { beaten, total: LADDER.length })}</strong>
        <span className="ladder-page__meter"><i style={{ width: `${(beaten / LADDER.length) * 100}%` }} /></span>
      </div>
      <div className="ladder-grid">
        {[...LADDER, ENGINE].map((bot) => {
          const record = bots[bot.id];
          const style = getCharacter(bot.id)?.style;
          return (
            <button key={bot.id} type="button" className={`ladder-card${next?.id === bot.id ? " is-next" : ""}`} onClick={() => play(bot.id)}>
              <span className="ladder-card__art" style={{ background: bot.tint }}>
                <BotPortrait id={bot.id} />
                {hasBeaten(bots, bot.id) && <span className="ladder-card__badge" aria-label={t("home.beaten")}>✓</span>}
              </span>
              <span className="ladder-card__name"><strong>{bot.name}</strong><span>{bot.rating ?? "0–20"}</span></span>
              <span className="ladder-card__short">{bot.short}</span>
              <span className="ladder-card__meta">
                {style ? t("ladder.depth", { depth: style.depth }) : t("ladder.engine")}
                {record ? ` · ${record.w}–${record.d}–${record.l}` : ""}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}

/**
 * The ladder: the people of the session ranked by Stellarr Elo with their results and records,
 * and the bots' ladder, from beginner to Stockfish.
 */
export function LadderPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("players");

  return (
    <div className="ladder-page">
      <header className="stats__head">
        <div>
          <h1>{t("ladder.title")}</h1>
          <p>{tab === "players" ? t("ladder.playersLead") : t("ladder.lead")}</p>
        </div>
        <div className="segmented" role="tablist" aria-label={t("ladder.title")}>
          {(["players", "bots"] as const).map((item) => (
            <button key={item} type="button" role="tab" aria-selected={tab === item} className={tab === item ? "is-selected" : ""} onClick={() => setTab(item)}>
              {item === "players" ? t("ladder.tabPlayers") : t("ladder.tabBots")}
            </button>
          ))}
        </div>
      </header>
      {tab === "players" ? <PlayersTab /> : <BotsTab />}
    </div>
  );
}
