import { useEffect } from "react";
import { REVEAL_EACH_MS, REVEAL_INTRO_MS } from "../game/rules.ts";
import { STICKERS, type StickerKind } from "../net/game.ts";
import { ART, Avatar, Backdrop, GifView, Header, TopicText, useGame, useNow } from "./parts.tsx";
import { Watching } from "./Watching.tsx";

/** Where thrown stickers land around the card, in stage pixels. */
const SLOTS = [
  { x: 150, y: 36, r: -12 },
  { x: 1000, y: 54, r: 10 },
  { x: 120, y: 372, r: 8 },
  { x: 1030, y: 352, r: -6 },
  { x: 985, y: 204, r: -4 },
  { x: 175, y: 205, r: 6 },
  { x: 1070, y: 470, r: 12 },
  { x: 60, y: 520, r: -9 },
];

export const STICKER_LABEL: Record<StickerKind, string> = { haha: "haha", "10na10": "10/10", nieee: "nieee", pff: "pff", brawo: "brawo" };

export function Reveal() {
  const game = useGame();
  const { t } = game;
  const s = game.state;
  const now = useNow(200);
  const n = s.memes.length;
  const index = Math.min(n - 1, Math.max(0, Math.floor((now - s.startsAt - REVEAL_INTRO_MS) / REVEAL_EACH_MS)));
  const meme = s.memes[index];
  const nextAt = s.startsAt + REVEAL_INTRO_MS + (index + 1) * REVEAL_EACH_MS;
  const left = Math.max(0, Math.ceil((Math.min(nextAt, s.endsAt) - now) / 1000));
  const progress = Math.min(1, Math.max(0, (now - (nextAt - REVEAL_EACH_MS)) / REVEAL_EACH_MS));
  const shown = s.memes.slice(Math.max(0, index - 2), index).reverse();
  const waiting = Math.min(2, n - index - 1);
  const flying = game.stickers.filter((st) => st.meme === meme?.key);
  const counts = (meme && game.stickerCounts[meme.key]) || {};

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const i = Number(e.key) - 1;
      if (meme && i >= 0 && i < STICKERS.length && !(e.target instanceof HTMLInputElement)) game.throwSticker(STICKERS[i], meme.key);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [game, meme]);

  if (!meme) return null;
  return (
    <div className="screen reveal">
      <Backdrop kind="stage" />
      <Header
        center={
          <span className="reveal-progress">
            <span className="pips" role="progressbar" aria-label={t("show", { n: index + 1, total: n })} aria-valuemin={0} aria-valuemax={n} aria-valuenow={index + 1}>
              {s.memes.map((m, i) => (
                <span key={m.key} className="pip">
                  <span style={{ width: i < index ? "100%" : i === index ? `${Math.round(progress * 100)}%` : "0%" }} />
                </span>
              ))}
            </span>
            <span className="display">{t("show", { n: index + 1, total: n })}</span>
          </span>
        }
        right={<span className="muted">{index + 1 < n ? t("nextIn", { n: left }) : t("voteIn", { n: left })}</span>}
      />
      <Watching />
      <div className="reveal-stage">
        {shown.map((m, i) => (
          <div key={m.key} className={`meme-card ghost ghost-left-${i + 1}`} aria-hidden="true">
            <span className="ghost-head" />
            <span className="ghost-topic" />
            <GifView id={m.gif.id} size="full" className="meme-gif" />
          </div>
        ))}
        {Array.from({ length: waiting }, (_, i) => (
          <div key={`wait-${i}`} className={`meme-card ghost back ghost-right-${waiting - i}`} aria-hidden="true">
            <img src="./art/logo-stack.webp" alt="" />
          </div>
        ))}

        <article className="meme-card current" key={meme.key}>
          <div className="meme-head">
            <span className="anon">
              <span className="anon-face" aria-hidden="true">?</span>
              <span className="muted small">{t("authorHiddenLong")}</span>
            </span>
            <span className="display small">{t("nOfM", { n: index + 1, total: n })}</span>
          </div>
          <h1 className="display meme-topic">{meme.caption ?? <TopicText topic={s.topic} />}</h1>
          <GifView id={meme.gif.id} size="full" alt={meme.gif.alt} className="meme-gif" />
        </article>

        {flying.map((st) => {
          const slot = SLOTS[st.id % SLOTS.length];
          return (
            <div key={st.id} className="flying" style={{ left: slot.x, top: slot.y, transform: `rotate(${slot.r}deg)` }} aria-hidden="true">
              <div className="pop">
                <img src={ART.sticker(st.kind)} alt="" />
                <Avatar who={game.player(st.from)} size={32} outline="#111733" />
              </div>
            </div>
          );
        })}
      </div>

      <div className="sticker-bar-wrap">
        <div className="sticker-bar" role="group" aria-label={t("throwSticker")}>
          <span className="display muted">{t("throwSticker")}</span>
          {STICKERS.map((kind, i) => (
            <button key={kind} type="button" onClick={() => game.throwSticker(kind, meme.key)} aria-label={t("stickerAria", { name: STICKER_LABEL[kind], key: i + 1, n: counts[kind] ?? 0 })}>
              <img src={ART.sticker(kind)} alt="" />
              <span className="display">{counts[kind] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
