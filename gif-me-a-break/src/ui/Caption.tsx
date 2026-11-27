import { useState } from "react";
import { searchers } from "../game/rules.ts";
import { CAPTION_MAX } from "../game/types.ts";
import { Avatar, Cat, GifView, Header, Ring, useGame, useRoundTitle } from "./parts.tsx";
import { Watching } from "./Watching.tsx";

/** Captions mode: everyone writes a caption for the round's GIF. */
export function Caption() {
  const game = useGame();
  const { t } = game;
  const s = game.state;
  const sent = game.assignment?.caption ?? null;
  const [text, setText] = useState(sent ?? "");
  const clean = text.replace(/\s+/g, " ").trim();
  const isSent = !!sent && clean === sent;
  const players = s.match?.players ?? [];
  const active = searchers(s, game.people.filter((p) => p.connected).map((p) => p.id));
  const title = useRoundTitle("phase.caption");

  return (
    <div className="screen caption">
      <Header center={<span className="display">{title}</span>} right={<Ring startsAt={s.startsAt} endsAt={s.endsAt} />} />
      <Watching />
      <div className="caption-grid">
        <section className="card caption-gif-card" aria-label={t("gifOfRoundShort")}>
          <span className="muted tiny">{t("gifOfRound")}</span>
          <GifView id={s.roundGif?.id} size="full" alt={s.roundGif?.alt} className="caption-gif" />
        </section>
        <aside className="caption-side">
          <form
            className="card caption-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (clean && !isSent) void game.sendCaption(clean);
            }}
          >
            <label htmlFor="napis" className="display caption-label">{t("yourCaption")}</label>
            <textarea
              id="napis"
              value={text}
              maxLength={CAPTION_MAX}
              rows={4}
              placeholder={t("captionPlaceholder")}
              disabled={!game.playing}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  (e.currentTarget.form as HTMLFormElement).requestSubmit();
                }
              }}
            />
            <span className="muted tiny caption-count">{[...text].length} / {CAPTION_MAX}</span>
            {game.playing &&
              (isSent ? (
                <button type="button" className="btn btn-done" disabled>{t("sentChange")}</button>
              ) : (
                <button type="submit" className="btn btn-primary" disabled={!clean}>{sent ? t("sendChanged") : t("send")}</button>
              ))}
          </form>
          <div className="ready">
            <h3 className="small">{t("ready", { n: s.done.length, total: active.length })}</h3>
            <ul className="faces">
              {players.map((p) => <li key={p.id}><Avatar who={p} size={40} tick={s.done.includes(p.id)} dim={!s.done.includes(p.id)} /></li>)}
            </ul>
          </div>
          <Cat pose="search" className="bob caption-cat" />
        </aside>
      </div>
    </div>
  );
}
