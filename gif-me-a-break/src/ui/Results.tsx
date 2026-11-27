import { directing, standings } from "../game/rules.ts";
import { count } from "../i18n/index.ts";
import { ART, Avatar, Backdrop, Cat, GifView, Header, TopicText, useGame, useNow, useRoundTitle } from "./parts.tsx";
import { Watching } from "./Watching.tsx";

export function Results() {
  const game = useGame();
  const { t, lang } = game;
  const s = game.state;
  const now = useNow(500);
  const title = useRoundTitle("phase.results");
  const result = s.result;
  const left = Math.max(0, Math.ceil((s.endsAt - now) / 1000));
  const last = s.round + 1 >= s.settings.rounds;
  const table = standings(s);
  const memeOf = (id: string) => {
    const key = Object.keys(result?.authors ?? {}).find((k) => result!.authors[k] === id);
    return key ? s.memes.find((m) => m.key === key) ?? null : null;
  };

  const winners = result?.winners ?? [];
  const lead = winners[0];
  const leadMeme = lead ? memeOf(lead) : null;
  const leadVoters = leadMeme ? result!.votes[leadMeme.key] ?? [] : [];
  const leadPoints = lead ? result!.points[lead] ?? 0 : 0;
  const streak = lead ? s.stats.streak[lead] ?? 0 : 0;
  const nobodySent = s.memes.length === 0;

  return (
    <div className="screen round-result">
      {leadMeme && <Backdrop kind="confetti" />}
      <Header
        center={<span className="display">{title}</span>}
        right={<span className="muted">{last ? t("endIn", { n: left }) : t("nextRoundIn", { n: left })}</span>}
      />
      <Watching />
      <div className="round-grid">
        <div className="winner-stage">
          {leadMeme ? (
            <>
              <article className="meme-card winner-card">
                <div className="meme-head">
                  <span className="anon">
                    <Avatar who={game.player(lead)} size={36} />
                    <span className="display">{game.player(lead)?.name}</span>
                    <span className="muted small">{t("winningMeme")}</span>
                  </span>
                </div>
                <p className="display meme-topic small-topic">{leadMeme.caption ?? <TopicText topic={s.topic} />}</p>
                <GifView id={leadMeme.gif.id} size="full" alt={leadMeme.gif.alt} className="meme-gif" />
              </article>
              <Cat pose="win" className="bob winner-cat" />
              <img className="winner-sticker" src={ART.sticker("brawo")} alt="" />
            </>
          ) : (
            <div className="nobody">
              <Cat pose="wait" />
              <p className="display">{nobodySent ? t("nobodySent") : t("nobodyVoted")}</p>
            </div>
          )}
        </div>

        <section className="results-side">
          {lead && (
            <div className="lockup">
              <h1>
                <span className="muted lockup-small">
                  {directing(s) && s.director ? t("directorPicks", { name: game.player(s.director)?.name ?? "" }) : winners.length > 1 ? t("tie") : t("roundTo")}
                </span>
                <span className="lockup-line">
                  <span className="display lockup-name">{winners.map((id) => game.player(id)?.name).join(` ${t("and")} `)}</span>
                  <span className="display lockup-points">+{leadPoints} {t("pts")}</span>
                </span>
              </h1>
              {leadVoters.length > 0 && !directing(s) && (
                <div className="voters">
                  <span className="muted">{t("votedBy")}</span>
                  <ul>
                    {leadVoters.map((id) => (
                      <li key={id}><Avatar who={game.player(id)} size={30} /><span>{game.player(id)?.name}</span></li>
                    ))}
                  </ul>
                </div>
              )}
              {streak >= 2 && winners.length === 1 && <p className="streak">{t("streak", { wins: count(lang, streak, "wins") })}</p>}
            </div>
          )}

          <div className="card table">
            <div className="table-head">
              <h2 className="display">{t("table")}</h2>
              <span className="muted tiny">{t("roundCol")}</span>
              <span className="muted tiny">{t("totalCol")}</span>
            </div>
            <ol>
              {table.map((row) => {
                const meme = memeOf(row.player.id);
                const plus = result?.points[row.player.id] ?? 0;
                return (
                  <li key={row.player.id} className={row.player.id === game.me ? "me" : ""}>
                    <span className={`place${row.place === 1 ? " place-first" : row.place <= 3 ? " place-top" : ""}`}>{row.place}</span>
                    <Avatar who={row.player} size={34} />
                    <span className="table-name">{row.player.name}</span>
                    <span className="table-thumb">{meme?.caption ? <span className="table-caption" title={meme.caption}>{meme.caption}</span> : meme ? <GifView id={meme.gif.id} size="full" /> : <span className="muted tiny">{t("none")}</span>}</span>
                    <span className={`table-plus${plus > 0 ? " up" : ""}`}>{plus > 0 ? `+${plus}` : "0"}</span>
                    <span className="display table-total">{row.score}</span>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>
      </div>
    </div>
  );
}
