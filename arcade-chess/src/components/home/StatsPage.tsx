import { useEffect, useMemo, useState } from "react";
import { usePieceUrl } from "@/board-style";
import { Chess } from "chess.js";
import { BotPortrait, PersonAvatar } from "@/components/BotPortrait";
import { getOpponent, OPPONENTS } from "@/ai/bots";
import { hasBeaten, useStatsStore } from "@/state/stats";
import { canReview, longestStreak, tallyByDay, useHistoryStore, within, type GameRecord } from "@/state/history";
import { useUiStore } from "@/state/ui";
import { useOnlineStore } from "@/online/sync";
import { loadOpeningBook, lookupOpening, type OpeningInfo } from "@/engine/openings";
import { tn, formatLocale, useTranslation } from "@/i18n";
import { StatsEmpty } from "./StatsEmpty";
import { CHAOS_ENABLED } from "@/features";

const LADDER = OPPONENTS.filter((opponent) => opponent.kind === "character");
const PERIODS = [7, 14, 30, null] as const;
type Period = (typeof PERIODS)[number];

/** The deepest book position a game reached, by replaying its moves. */
function openingOf(game: GameRecord, book: Map<string, OpeningInfo>): OpeningInfo | null {
  const chess = new Chess(game.startFen);
  let found: OpeningInfo | null = null;
  for (const uci of game.moves.split(" ").filter(Boolean).slice(0, 30)) {
    try {
      chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    } catch {
      break;
    }
    found = lookupOpening(book, chess.fen()) ?? found;
  }
  return found;
}

const percent = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

/** The statistics page, which is also the menu's start page. */
export function StatsPage() {
  const pieceUrl = usePieceUrl();
  const { t } = useTranslation();
  const allGames = useHistoryStore((s) => s.games);
  // While Chaos Chess is hidden its games are left out of the statistics too.
  const games = useMemo(() => (CHAOS_ENABLED ? allGames : allGames.filter((game) => game.kind !== "chaos")), [allGames]);
  const openReview = useHistoryStore((s) => s.openReview);
  const bots = useStatsStore((s) => s.bots);
  const room = useStatsStore((s) => s.online);
  const online = useOnlineStore((s) => s.available);
  const setView = useUiStore((s) => s.setView);
  const setMode = useUiStore((s) => s.setMode);
  const choose = useUiStore((s) => s.choose);
  const [period, setPeriod] = useState<Period>(14);
  const [book, setBook] = useState<Map<string, OpeningInfo> | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadOpeningBook().then((map) => { if (!cancelled) setBook(map); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const now = Date.now();
  const inPeriod = useMemo(() => within(games, period, now), [games, period]);
  const previous = useMemo(() => (period === null ? [] : games.filter((game) => now - game.at >= period * 864e5 && now - game.at < 2 * period * 864e5)), [games, period]);
  const wins = inPeriod.filter((game) => game.outcome === "w").length;
  const draws = inPeriod.filter((game) => game.outcome === "d").length;
  const losses = inPeriod.length - wins - draws;
  const streak = longestStreak(inPeriod);
  const beaten = LADDER.filter((bot) => hasBeaten(bots, bot.id)).length;
  const next = LADDER.find((bot) => !hasBeaten(bots, bot.id));
  const days = tallyByDay(games, period ?? 30, now);
  const tallest = Math.max(1, ...days.map((day) => day.w + day.d + day.l));
  const weekday = (time: number) => new Date(time).toLocaleDateString(formatLocale(), { weekday: "short" });
  const bestDay = [...days].sort((a, b) => b.w - a.w)[0];

  const byColor = (["w", "b"] as const).map((color) => {
    const list = inPeriod.filter((game) => game.color === color);
    const w = list.filter((game) => game.outcome === "w").length;
    const d = list.filter((game) => game.outcome === "d").length;
    return { color, n: list.length, w, d, l: list.length - w - d };
  });
  const [white, black] = byColor;
  const colorFinding = !inPeriod.length ? t("stats.colorsEmpty")
    : percent(white.w, white.n) === percent(black.w, black.n) ? t("stats.colorsEven")
    : percent(white.w, white.n) > percent(black.w, black.n) ? t("stats.colorsWhite") : t("stats.colorsBlack");

  const openings = useMemo(() => {
    if (!book) return [];
    const groups = new Map<string, { info: OpeningInfo; n: number; w: number }>();
    for (const game of inPeriod) {
      const info = openingOf(game, book);
      if (!info) continue;
      const group = groups.get(info.name) ?? { info, n: 0, w: 0 };
      group.n++;
      if (game.outcome === "w") group.w++;
      groups.set(info.name, group);
    }
    return [...groups.values()].sort((a, b) => b.n - a.n).slice(0, 4);
  }, [book, inPeriod]);

  const playNext = () => {
    if (!next) return;
    setMode("vsBot");
    choose(next.id);
    setView("play");
  };

  if (!games.length) return <StatsEmpty />;

  return (
    <div className="stats">
      <header className="stats__head">
        <div>
          <h1>{t("stats.title")}</h1>
          <p>{period === null ? t("stats.allTime") : t("stats.lastDays", { days: period })}</p>
        </div>
        <div className="segmented" role="radiogroup" aria-label={t("stats.period")}>
          {PERIODS.map((item) => (
            <button key={String(item)} type="button" role="radio" aria-checked={period === item} className={period === item ? "is-selected" : ""} onClick={() => setPeriod(item)}>
              {item === null ? t("stats.all") : t("stats.days", { days: item })}
            </button>
          ))}
        </div>
      </header>

      <section className="stats-kpis">
        <div className="stats-kpi">
          <span>{t("stats.games")}</span>
          <strong>{inPeriod.length}</strong>
          {period !== null && <small className={inPeriod.length >= previous.length ? "is-up" : ""}>{t("stats.vsBefore", { diff: `${inPeriod.length - previous.length >= 0 ? "+" : ""}${inPeriod.length - previous.length}`, days: period })}</small>}
        </div>
        <div className="stats-kpi">
          <span>{t("stats.wins")}</span>
          <strong>{percent(wins, inPeriod.length)}%</strong>
          <small>{t("stats.wdl", { w: wins, d: draws, l: losses })}</small>
        </div>
        <div className="stats-kpi">
          <span>{t("stats.streak")}</span>
          <strong>{streak}</strong>
          <small>{t("stats.streakNote")}</small>
        </div>
        <button type="button" className="stats-kpi stats-kpi--ladder" onClick={() => (next ? playNext() : setView("ladder"))}>
          <span className="stats-kpi__text">
            <span>{t("nav.ladder")}</span>
            <strong>{t("stats.ladder", { beaten, total: LADDER.length })}</strong>
            <small className="is-gold">{next ? t("stats.ladderNext", { name: next.name, rating: next.rating ?? "" }) : t("home.ladderDone")}</small>
          </span>
          {next && <span className="stats-kpi__art" style={{ background: next.tint }}><BotPortrait id={next.id} /></span>}
        </button>
      </section>

      <section className="stats-row">
        <div className="stats-card">
          <div className="stats-card__head">
            <h2>{bestDay && bestDay.w ? t("stats.bestDay", { day: weekday(bestDay.day), wins: bestDay.w }) : t("stats.noWinsYet")}</h2>
            <span className="stats-legend"><i className="is-w" />{t("home.wins")}<i className="is-d" />{t("home.draws")}<i className="is-l" />{t("home.losses")}</span>
          </div>
          <div className="stats-bars" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
            {days.map((day) => (
              <div key={day.day} className="stats-bars__col" title={`${new Date(day.day).toLocaleDateString(formatLocale())}: ${t("stats.wdl", { w: day.w, d: day.d, l: day.l })}`}>
                {day.l > 0 && <i className="is-l" style={{ height: `${(day.l / tallest) * 100}%` }} />}
                {day.d > 0 && <i className="is-d" style={{ height: `${(day.d / tallest) * 100}%` }} />}
                {day.w > 0 && <i className="is-w" style={{ height: `${(day.w / tallest) * 100}%` }} />}
              </div>
            ))}
          </div>
          <div className="stats-bars__labels" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
            {days.map((day, i) => <span key={day.day}>{days.length <= 14 || i % 3 === 0 ? weekday(day.day) : ""}</span>)}
          </div>
        </div>
        <div className="stats-card">
          <h2>{colorFinding}</h2>
          {byColor.map((item) => (
            <div key={item.color} className="stats-split">
              <div className="stats-split__head">
                <img src={pieceUrl(item.color, "k")} alt="" />
                <strong>{t(`stats.as.${item.color}`)}</strong>
                <span>{percent(item.w, item.n)}% · {item.w}–{item.d}–{item.l}</span>
              </div>
              <div className="stats-split__bar">
                <i className="is-w" style={{ width: `${percent(item.w, item.n)}%` }} />
                <i className="is-d" style={{ width: `${percent(item.d, item.n)}%` }} />
                <i className="is-l" style={{ width: `${percent(item.l, item.n)}%` }} />
              </div>
            </div>
          ))}
          {online && <p className="stats-room">{t("home.recordRoom")}<span>{t("stats.wdl", { w: room.w, d: room.d, l: room.l })}</span></p>}
        </div>
      </section>

      <section className="stats-row stats-row--wide">
        <div className="stats-card">
          <h2>{t("stats.recent")}</h2>
          <ul className="stats-recent">
            {games.slice(0, 5).map((game) => {
              const bot = game.opponentId ? getOpponent(game.opponentId) : null;
              return (
                <li key={game.id}>
                  <span className={`stats-result is-${game.outcome}`} title={t(`stats.outcome.${game.outcome}`)} aria-label={t(`stats.outcome.${game.outcome}`)}>{t(`stats.short.${game.outcome}`)}</span>
                  {bot ? <span className="stats-recent__art" style={{ background: bot.tint }}><BotPortrait id={bot.id} /></span> : <PersonAvatar name={game.opponent} className="stats-recent__art" />}
                  <span className="stats-recent__who"><strong>{game.opponent}</strong><small>{t(`stats.kind.${game.kind}`)}</small></span>
                  <span className="stats-recent__when">{new Date(game.at).toLocaleDateString(formatLocale(), { day: "numeric", month: "short" })}</span>
                  <span className="stats-recent__moves">{tn("stats.moves", Math.ceil(game.moves.split(" ").filter(Boolean).length / 2))}</span>
                  {canReview(game)
                    ? <button type="button" className="link" onClick={() => openReview(game.id)}>{t("panel.review")}</button>
                    : <span className="stats-recent__none" title={t("stats.noReview")}>—</span>}
                </li>
              );
            })}
          </ul>
        </div>
        <div className="stats-card">
          <h2>{openings[0] ? t("stats.topOpening", { name: openings[0].info.name }) : t("stats.openings")}</h2>
          {!openings.length && <p className="stats-muted">{book ? t("stats.openingsEmpty") : t("stats.openingsLoading")}</p>}
          {openings.map((group) => (
            <div key={group.info.name} className="stats-opening">
              <div><span><b>{group.info.eco}</b> {group.info.name}</span><span>{t("stats.openingScore", { w: group.w, n: group.n })}</span></div>
              <i style={{ width: `${(group.n / openings[0].n) * 100}%` }} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
