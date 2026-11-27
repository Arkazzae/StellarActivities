import { awards, standings, type Award } from "../game/rules.ts";
import { count, type Lang } from "../i18n/index.ts";
import type { Game } from "../net/game.ts";
import { Avatar, Backdrop, Cat, GifView, Header, useGame } from "./parts.tsx";
import { Watching } from "./Watching.tsx";

/** An award's sentence in the reader's language. */
function fact(game: Game, lang: Lang, a: Award) {
  switch (a.kind) {
    case "streak":
      return game.t("award.streak.fact", { n: count(lang, a.value, "roundsWon") });
    case "best":
      return game.t("award.best.fact", { n: count(lang, a.value, "votes"), round: a.round ?? 1 });
    case "fast":
      return game.t("award.fast.fact", { n: a.value });
    case "quiet":
      return game.t("award.quiet.fact", { n: count(lang, a.value, "rounds") });
  }
}

export function Final() {
  const game = useGame();
  const { t, lang } = game;
  const s = game.state;
  const table = standings(s);
  const top = table.slice(0, 3);
  const rest = table.slice(3);
  // Podium order on screen: second, first, third.
  const podium = [top[1], top[0], top[2]].filter(Boolean);
  const prizes = awards(s);
  const played = s.played;
  const hostName = game.host ? game.player(game.host)?.name : null;

  return (
    <div className="screen final">
      <Backdrop kind="confetti" />
      <Header center={<span className="display">{t("gameOver")}</span>} right={<span className="muted">{count(lang, played, "rounds")}, {t(`mode.${s.settings.mode}`)}</span>} />
      <Watching />
      <div className="final-grid">
        <section className="podium-wrap" aria-label={t("table")}>
          <ol className="podium">
            {podium.map((row) => (
              <li key={row.player.id} className={`podium-${row.place}`}>
                {row.place === 1 && <Cat pose="win" className="bob podium-cat" />}
                <Avatar who={row.player} size={row.place === 1 ? 88 : 68} outline={row.place === 1 ? "var(--coral)" : undefined} />
                <span className="display podium-name">{row.player.name}{row.player.id === game.me ? ` (${t("you")})` : ""}</span>
                <span className="display podium-score">{row.score} <span className="muted small">{t("pts")}</span></span>
                <span className="podium-block display">{row.place}</span>
              </li>
            ))}
          </ol>
          {rest.length > 0 && (
            <ol className="rest">
              {rest.map((row) => (
                <li key={row.player.id}>
                  <span className="muted">{row.place}.</span>
                  <Avatar who={row.player} size={28} />
                  <strong>{row.player.name}</strong>
                  <span className="muted">{row.score} {t("pts")}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="card prizes" aria-labelledby="nagrody">
          <h2 id="nagrody" className="display">{t("prizes")}</h2>
          {prizes.length === 0 && <p className="muted small">{t("noPrizes")}</p>}
          <ul>
            {prizes.map((a) => (
              <li key={a.kind}>
                <Avatar who={game.player(a.player)} size={40} />
                <span>
                  <span className="prize-line"><span className="display prize-title">{t(`award.${a.kind}`)}</span><strong>{game.player(a.player)?.name}</strong></span>
                  <span className="muted small">{fact(game, lang, a)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {s.highlights.length > 0 && (
        <section className="strip" aria-labelledby="pasek">
          <h2 id="pasek" className="small">{t("winnersStrip")}</h2>
          <ol>
            {s.highlights.slice(-8).map((h, i) => (
              <li key={`${h.round}-${h.gif.id}-${i}`}>
                <GifView id={h.gif.id} size="full" alt={h.gif.alt} className="strip-gif" />
                {h.caption && <span className="strip-caption">{h.caption}</span>}
                <span className="muted tiny">{t("roundN", { n: h.round + 1 })}</span>
                <strong className="small">{game.player(h.author)?.name}</strong>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="final-actions">
        {game.isHost ? (
          <>
            <button type="button" className="btn btn-ghost" onClick={() => game.toLobby()}>{t("backToLobby")}</button>
            <button type="button" className="btn btn-primary" onClick={() => game.start()}>{t("again")}</button>
          </>
        ) : (
          <p className="waiting display">{t("waitDecide", { name: hostName ?? t("theHost") })}</p>
        )}
      </div>
    </div>
  );
}
