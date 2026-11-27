import { activePlayers, directing } from "../game/rules.ts";
import { Avatar, Cat, GifView, Header, Ring, TopicText, useGame, useRoundTitle } from "./parts.tsx";
import { Watching } from "./Watching.tsx";

export function TopicVote() {
  const game = useGame();
  const { t } = game;
  const s = game.state;
  const mine = s.topicVotes[game.me];
  const players = s.match?.players ?? [];
  const voted = Object.keys(s.topicVotes).length;
  const active = activePlayers(s, game.people.filter((p) => p.connected).map((p) => p.id)).length;
  const director = directing(s) ? s.director : null;
  const amDirector = !!director && director === game.me;
  const directorName = director ? game.player(director)?.name ?? "" : "";
  const canVote = game.playing && (!director || amDirector);
  const napisy = s.settings.mode === "napisy";
  const titleTopic = useRoundTitle("phase.topic");
  const titleGif = useRoundTitle("phase.gif");

  const title = napisy ? t("whichGif") : !director ? t("whichTopic") : amDirector ? t("directorPickTopic") : t("directorPicksTopic", { name: directorName });
  const note = director ? t("noteDirector") : napisy ? t("noteCaptions", { n: voted, total: active }) : t("noteVotes", { n: voted, total: active });
  const foot = (on: boolean, available = true) => (
    <span className={on ? "tag tag-coral" : "muted small"}>{on ? t("yourVote") : canVote && available ? t("choose") : ""}</span>
  );

  return (
    <div className="screen topic">
      <Header center={<span className="display">{napisy ? titleGif : titleTopic}</span>} right={<Ring startsAt={s.startsAt} endsAt={s.endsAt} />} />
      <Watching />
      <div className="topic-body">
        <h1 className="display topic-title">{title}</h1>
        <div className="topic-choices">
          {napisy
            ? (s.gifChoices.length ? s.gifChoices : [null, null]).map((gif, i) => {
                const on = mine === i;
                const fans = players.filter((p) => s.topicVotes[p.id] === i);
                return (
                  <button key={gif?.id ?? `czekam-${i}`} type="button" className={`card topic-card gif-choice${on ? " on" : ""}`} aria-pressed={on} aria-label={gif ? `${t("gifN", { n: i + 1 })}${gif.alt ? `: ${gif.alt}` : ""}` : t("drawingGifs")} disabled={!canVote || !gif} onClick={() => game.voteTopic(i)}>
                    {gif ? <GifView id={gif.id} size="full" alt={gif.alt} className="choice-gif" /> : <span className="gif gif-empty choice-gif"><span>{t("drawingGifs")}</span></span>}
                    <span className="topic-foot">
                      <span className="topic-fans">{fans.map((p) => <Avatar key={p.id} who={p} size={34} />)}</span>
                      {foot(on, !!gif)}
                    </span>
                  </button>
                );
              })
            : s.choices.map((choice, i) => {
                const on = mine === i;
                const fans = players.filter((p) => s.topicVotes[p.id] === i);
                return (
                  <button key={choice.id} type="button" className={`card topic-card${on ? " on" : ""}`} aria-pressed={on} disabled={!canVote} onClick={() => game.voteTopic(i)}>
                    <span className="topic-text display"><TopicText topic={choice} /></span>
                    <span className="topic-foot">
                      <span className="topic-fans">{fans.map((p) => <Avatar key={p.id} who={p} size={34} />)}</span>
                      {foot(on)}
                    </span>
                  </button>
                );
              })}
        </div>
        <p className="muted center small">{note}</p>
      </div>
      <Cat pose="hello" className="bob topic-cat" />
    </div>
  );
}
