import { useEffect, useMemo, useRef, useState } from "react";
import { bannedWords, breaksBan } from "../game/ban.ts";
import { directing, searchers } from "../game/rules.ts";
import { localTopic } from "../game/topics.ts";
import type { GifItem } from "../stellarr/types.ts";
import { Avatar, Cat, GifView, Header, Ring, TopicText, useGame, useRoundTitle } from "./parts.tsx";
import { Watching } from "./Watching.tsx";

const DEBOUNCE_MS = 700;

export function Search() {
  const game = useGame();
  const { t } = game;
  const s = game.state;
  const sent = game.assignment?.gif ?? null;
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<GifItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<GifItem | null>(null);
  /** The query whose results are on screen; null before the first (trending) search. */
  const asked = useRef<string | null>(null);

  // Banned words come from the topic as this player reads it.
  const banned = useMemo(
    () => (s.settings.mode === "zakaz" && s.topic ? bannedWords(localTopic(s.topic, game.lang)) : []),
    [s.settings.mode, s.topic, game.lang],
  );
  const breach = breaksBan(query, banned);

  // Search after a pause in typing; an empty box lists trending GIFs.
  useEffect(() => {
    if (breach) return;
    const term = query.trim();
    const timer = setTimeout(async () => {
      if (asked.current === term) return;
      asked.current = term;
      setLoading(true);
      const page = await game.search(term);
      if (asked.current !== term) return;
      setLoading(false);
      if (page) {
        setItems(page.items);
        setTotal(page.total);
      }
    }, term ? DEBOUNCE_MS : 0);
    return () => clearTimeout(timer);
  }, [game, query, breach]);

  const more = async () => {
    setLoading(true);
    const page = await game.search(asked.current ?? "", items.length);
    setLoading(false);
    if (page) setItems((old) => [...old, ...page.items.filter((it) => !old.some((o) => o.id === it.id))]);
  };

  const chosen = picked ?? (sent ? { id: sent.id, width: sent.w, height: sent.h, alt: sent.alt } : null);
  const isSent = !!sent && chosen?.id === sent.id;
  const send = () => {
    if (!chosen) return;
    void game.sendGif({ id: chosen.id, w: chosen.width, h: chosen.height, ...(chosen.alt ? { alt: chosen.alt } : {}) });
  };

  const director = directing(s) ? s.director : null;
  const players = (s.match?.players ?? []).filter((p) => p.id !== director);
  const active = searchers(s, game.people.filter((p) => p.connected).map((p) => p.id));
  const titleSearch = useRoundTitle("phase.search");
  const titleOthers = useRoundTitle("phase.othersSearch");
  const header = <Header center={<span className="display">{director === game.me ? titleOthers : titleSearch}</span>} right={<Ring startsAt={s.startsAt} endsAt={s.endsAt} />} />;
  const ready = (
    <div className="ready">
      <h3 className="small">{t("ready", { n: s.done.length, total: active.length })}</h3>
      <ul className="faces">
        {players.map((p) => <li key={p.id}><Avatar who={p} size={40} tick={s.done.includes(p.id)} dim={!s.done.includes(p.id)} /></li>)}
      </ul>
    </div>
  );

  if (director && director === game.me) {
    return (
      <div className="screen search">
        {header}
        <div className="director-wait">
          <Cat pose="wait" className="director-cat" />
          <div className="card director-card">
            <span className="muted tiny">{t("topicOfRound")}</span>
            <h1 className="display topic-line"><TopicText topic={s.topic} /></h1>
            <p>{t("directorWait")}</p>
            {ready}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="screen search">
      {header}
      <Watching />
      <div className="search-grid">
        <section className="search-main" aria-label={t("searchLabel")}>
          <div className="card topic-box">
            <span className="muted tiny">{director ? t("topicDirector", { name: game.player(director)?.name ?? "" }) : t("topicOfRound")}</span>
            <h1 className="display topic-line"><TopicText topic={s.topic} /></h1>
          </div>

          <div className="search-box">
            <label htmlFor="q" className="sr">{t("searchLabel")}</label>
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2.2" /><path d="M15.5 15.5L21 21" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
            <input id="q" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("searchLabel")} autoComplete="off" maxLength={50} className={breach ? "bad" : ""} />
            {query && (
              <button type="button" className="clear" aria-label={t("clear")} onClick={() => setQuery("")}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
              </button>
            )}
          </div>

          {banned.length > 0 ? (
            <div className="hints">
              <span className="banned-label">{t("bannedLabel")}</span>
              {banned.map((w) => <s key={w} className="banned">{w}</s>)}
              {breach && <strong>{t("bannedHit", { word: breach })}</strong>}
            </div>
          ) : (
            <div className="hints">
              <span className="muted">{t("tryLabel")}</span>
              {t("quick").split("|").map((w) => <button key={w} type="button" className="link" onClick={() => setQuery(w)}>{w}</button>)}
            </div>
          )}

          <div className="results">
            {game.gifProblem ? (
              <GifProblemNote />
            ) : (
              <>
                <div className="results-grid">
                  {items.map((it) => {
                    const on = chosen?.id === it.id;
                    return (
                      <button key={it.id} type="button" className={`result${on ? " on" : ""}`} aria-pressed={on} aria-label={it.alt ?? "GIF"} onClick={() => setPicked(it)}>
                        <GifView id={it.id} alt={it.alt} lazy />
                        {on && <span className="tag tag-coral result-tag">{isSent ? t("sentTag") : t("picked")}</span>}
                      </button>
                    );
                  })}
                </div>
                {!loading && asked.current !== null && items.length === 0 && <p className="muted center">{t("nothingFound")}</p>}
                {items.length > 0 && items.length < total && (
                  <button type="button" className="btn btn-ghost more" disabled={loading} onClick={more}>{loading ? t("searching") : t("more")}</button>
                )}
              </>
            )}
          </div>
        </section>

        <aside className="search-side" aria-label={t("yourMeme")}>
          <article className="card my-meme">
            <div className="my-meme-head">
              <h2 className="display">{t("yourMeme")}</h2>
              <span className="muted tiny">{t("authorHidden")}</span>
            </div>
            <p className="display my-meme-topic"><TopicText topic={s.topic} /></p>
            <div className="my-meme-gif">
              {chosen ? <GifView id={chosen.id} size="full" alt={chosen.alt} /> : <span className="gif gif-empty"><span>{t("pickFromResults")}</span></span>}
            </div>
            {game.playing &&
              (isSent ? (
                <button type="button" className="btn btn-done" disabled>{t("sentChange")}</button>
              ) : (
                <button type="button" className="btn btn-primary" disabled={!chosen} onClick={send}>{sent ? t("sendInstead") : t("send")}</button>
              ))}
          </article>
          {ready}
          <Cat pose="search" className="bob search-cat" />
        </aside>
      </div>
    </div>
  );
}

export function GifProblemNote() {
  const game = useGame();
  const text = game.gifProblem === "declined" ? game.t("problemDeclined") : game.gifProblem === "permission" ? game.t("problemPermission") : game.t("noGifsInstance");
  return (
    <div className="problem">
      <Cat pose="wait" className="problem-cat" />
      <p>{text}</p>
    </div>
  );
}
