import { directing } from "../game/rules.ts";
import { ART, Avatar, GifView, Header, Ring, TopicText, useGame, useRoundTitle } from "./parts.tsx";
import { Watching } from "./Watching.tsx";

export function Vote() {
  const game = useGame();
  const { t } = game;
  const s = game.state;
  const mine = game.assignment;
  const players = s.match?.players ?? [];
  const connected = game.people.filter((p) => p.connected).map((p) => p.id);
  // Everyone sees the same count; authors are secret, so this is an upper bound until results.
  const expected = players.filter((p) => connected.includes(p.id)).length;
  const wide = s.memes.length > 6;
  const napisy = s.settings.mode === "napisy";
  const director = directing(s) ? s.director : null;
  const amDirector = !!director && director === game.me;
  const directorName = director ? game.player(director)?.name ?? "" : "";
  const titleVote = useRoundTitle("phase.vote");
  const titleDirector = useRoundTitle("phase.directorVote");

  const title = !director ? t("whichWins") : amDirector ? t("pickWinner") : t("directorPicksWinner", { name: directorName });
  const label = (on: boolean) => (director ? (on ? t("picked") : t("pickThis")) : on ? t("yourVote") : t("vote"));

  return (
    <div className="screen vote">
      <Header center={<span className="display">{director ? titleDirector : titleVote}</span>} right={<Ring startsAt={s.startsAt} endsAt={s.endsAt} />} />
      <Watching />
      <div className="vote-head">
        <h1 className="display">{title}</h1>
        {!director && (
          <div className="voted">
            <span className="muted small">{t("voted", { n: s.done.length, total: expected })}</span>
            <ul className="faces">
              {players.map((p) => <li key={p.id}><Avatar who={p} size={34} tick={s.done.includes(p.id)} dim={!s.done.includes(p.id)} /></li>)}
            </ul>
          </div>
        )}
      </div>
      {napisy ? (
        <div className="vote-napisy">
          <section className="card vote-napisy-gif" aria-label={t("gifOfRoundShort")}>
            <span className="muted tiny">{t("gifOfRoundShort")}</span>
            <GifView id={s.roundGif?.id} size="full" alt={s.roundGif?.alt} className="caption-gif" />
          </section>
          <div className="vote-napisy-list">
            {s.memes.map((m) => {
              const own = !!mine?.caption && mine.caption === m.caption;
              const on = mine?.vote === m.key;
              return (
                <article key={m.key} className={`card caption-card${on ? " on" : ""}${own ? " own" : ""}`}>
                  <p className="display">{m.caption}</p>
                  {on && <img className="caption-sticker" src={ART.sticker("10na10")} alt="" />}
                  {own ? (
                    <button type="button" className="btn btn-own" disabled>{t("yourCaptionBtn")}</button>
                  ) : game.playing ? (
                    <button type="button" className={`btn ${on ? "btn-primary" : "btn-outline"}`} aria-pressed={on} onClick={() => game.vote(m.key)}>{on ? t("yourVote") : t("vote")}</button>
                  ) : (
                    <span className="btn btn-own vote-wait">{t("watchingShort")}</span>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      ) : (
      <div className={`vote-grid${wide ? " wide" : ""}`}>
        {s.memes.map((m) => {
          const own = !!mine?.gif && mine.gif.id === m.gif.id;
          const on = mine?.vote === m.key;
          const canPick = game.playing && (!director || amDirector);
          return (
            <article key={m.key} className={`card vote-card${on ? " on" : ""}${own ? " own" : ""}`}>
              <p className="display vote-topic"><TopicText topic={s.topic} /></p>
              <div className="vote-gif">
                <GifView id={m.gif.id} size="full" alt={m.gif.alt} />
                {on && <img className="vote-sticker" src={ART.sticker("10na10")} alt="" />}
              </div>
              {own ? (
                <button type="button" className="btn btn-own" disabled>{t("yourMemeBtn")}</button>
              ) : canPick ? (
                <button type="button" className={`btn ${on ? "btn-primary" : "btn-outline"}`} aria-pressed={on} onClick={() => game.vote(m.key)}>
                  {label(on)}
                </button>
              ) : (
                <span className="btn btn-own vote-wait">{director ? t("waitDirector") : t("watchingShort")}</span>
              )}
            </article>
          );
        })}
      </div>
      )}
    </div>
  );
}
