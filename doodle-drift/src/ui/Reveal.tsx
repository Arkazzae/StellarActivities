import { useEffect, useMemo, useRef, useState } from "react";
import { isTextKind } from "../game/plan.ts";
import { pageKey } from "../net/protocol.ts";
import type { Player } from "../net/protocol.ts";
import { revealOrder } from "../net/reveal.ts";
import type { Key } from "../lib/i18n.ts";
import { useT } from "../lib/i18n.ts";
import { play } from "../lib/sfx.ts";
import { Avatar, Bitmap, Icon, STAMPS, stampUrl } from "./common.tsx";
import { useGame, usePrefs } from "./context.ts";

function Pic({ k, alt, className }: { k: string; alt: string; className?: string }) {
  const game = useGame();
  const t = useT();
  const picture = game.picture(k);
  useEffect(() => { if (!picture) game.want([k]); }, [game, picture, k]);
  if (picture) return <Bitmap bits={picture} alt={alt} className={className ?? "fill"} />;
  return <div className="missing">{game.state.empty.includes(k) ? t("reveal.empty") : <span className="spinner" />}</div>;
}

export function Floaters() {
  const game = useGame();
  const recent = game.reactions.filter((r) => Date.now() - r.at < 2400);
  return (
    <div className="floaters" aria-hidden="true">
      {recent.map((r) => <img key={r.id} className="floater" src={stampUrl(r.stamp)} alt="" style={{ left: `${10 + ((r.id * 37) % 80)}%` }} />)}
    </div>
  );
}

function ReactionBar() {
  const game = useGame();
  const t = useT();
  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const r of game.reactions) out[r.stamp] = (out[r.stamp] ?? 0) + 1;
    return out;
  }, [game.reactions]);
  return (
    <div role="group" aria-label={t("reveal.react")} style={{ display: "flex", gap: 10 }}>
      {STAMPS.map((stamp) => (
        <button key={stamp} type="button" className="react" aria-label={t(`stamp.${stamp}` as Key)} title={t(`stamp.${stamp}` as Key)} onClick={() => { play("pop"); game.react(stamp); }}>
          <img src={stampUrl(stamp)} alt="" />
          {counts[stamp] ? <span className="sr-only">{counts[stamp]}</span> : null}
        </button>
      ))}
    </div>
  );
}

function HostControls({ last, lastOfAlbum }: { last: boolean; lastOfAlbum: boolean }) {
  const game = useGame();
  const t = useT();
  const host = game.people.find((p) => p.id === game.host);
  useEffect(() => {
    if (!game.isHost) return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.closest("input, textarea, button")) return;
      if (event.key === " " || event.key === "ArrowRight") { event.preventDefault(); play("page"); void game.revealStep(1); }
      if (event.key === "ArrowLeft") { event.preventDefault(); void game.revealStep(-1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [game]);
  if (!game.isHost) return <span className="muted" style={{ marginLeft: "auto", fontSize: 14 }}>{t("reveal.hostLeads", { host: host?.name ?? "Host" })}</span>;
  return (
    <div className="host-ctl">
      <button type="button" className="icon-btn" style={{ width: 54, height: 54 }} aria-label={t("reveal.prev")} disabled={(game.state.reveal?.index ?? 0) === 0} onClick={() => void game.revealStep(-1)}><Icon name="back" /></button>
      <button type="button" className="btn" onClick={() => { play("page"); void game.revealStep(1); }}>
        {last ? t("reveal.finish") : lastOfAlbum ? t("reveal.nextAlbum") : t("reveal.next")}<Icon name="arrow" />
      </button>
    </div>
  );
}

function pageLabel(kind: string, t: ReturnType<typeof useT>) {
  if (isTextKind(kind as never)) return t("reveal.sentence");
  if (kind === "frame") return t("reveal.frame");
  return t("reveal.drawing");
}

function Ranking({ players, points }: { players: Player[]; points: Record<string, number> }) {
  const t = useT();
  const sorted = [...players].sort((a, b) => (points[b.id] ?? 0) - (points[a.id] ?? 0));
  const best = Math.max(1, ...Object.values(points));
  return (
    <aside className="panel ranking" aria-labelledby="rank">
      <h2 id="rank" className="disp" style={{ fontSize: 18 }}>{t("reveal.points")}</h2>
      <ol>
        {sorted.map((p) => (
          <li key={p.id}>
            <Avatar person={p} size={28} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong style={{ fontSize: 14 }}>{p.name}</strong>
              <div className="bar-fill" style={{ width: `${((points[p.id] ?? 0) / best) * 100}%` }} />
            </div>
            <b>{points[p.id] ?? 0}</b>
          </li>
        ))}
      </ol>
    </aside>
  );
}

export function usePoints() {
  const game = useGame();
  const match = game.state.match;
  return useMemo(() => {
    const points: Record<string, number> = {};
    if (!match) return points;
    for (const [key, voters] of Object.entries(game.state.votes ?? {})) {
      const [album, page] = key.split(":").map(Number);
      const author = match.players[match.plan.albums[album]?.authors[page] ?? -1];
      if (author) points[author.id] = (points[author.id] ?? 0) + voters.length;
    }
    return points;
  }, [game.state.votes, match]);
}

function ChainView({ album, step }: { album: number; step: number }) {
  const game = useGame();
  const t = useT();
  const match = game.state.match!;
  const plan = match.plan.albums[album];
  const authorOf = (page: number) => match.players[plan.authors[page]];
  const current = pageKey({ album, page: step });
  const previous = step > 0 ? pageKey({ album, page: step - 1 }) : null;
  const kind = plan.kinds[step];
  const author = authorOf(step);
  const score = match.plan.reveal === "score";
  const voters = game.state.votes?.[current] ?? [];
  const mine = author?.id === game.me;
  const voted = voters.includes(game.me);
  const points = usePoints();
  const left = plan.kinds.length - step - 1;
  return (
    <>
      <nav className="thread" aria-label={t("reveal.title")}>
        <ol>
          {plan.kinds.map((k, p) => (
            <li key={p}><span className={`pg ${p < step ? "seen" : p === step ? "now" : "next"}`}>{p <= step ? (isTextKind(k) ? "Aa" : <Icon name="pen" size={14} />) : p + 1}</span></li>
          ))}
        </ol>
      </nav>
      <div className="reveal">
        {previous ? (
          <figure className="paper prev-card" style={{ margin: 0 }}>
            <span className="tape" style={{ left: 28 }} />
            <figcaption style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 800, color: "var(--ink-soft)" }}>
              <Avatar person={authorOf(step - 1)} size={22} />{authorOf(step - 1)?.name} · {pageLabel(plan.kinds[step - 1], t)}
            </figcaption>
            {isTextKind(plan.kinds[step - 1]) ? <p>{game.state.texts[previous] || "…"}</p> : <Pic k={previous} alt="" />}
          </figure>
        ) : null}
        <div className="page-col">
          <div className="author-chip"><Avatar person={author} size={30} /><span><strong>{author?.name}</strong> <span className="muted">· {pageLabel(kind, t)}</span></span></div>
          {isTextKind(kind) ? (
            <div className={`paper text-page${game.state.texts[current] ? "" : " empty"}`}>
              <span className="tape" style={{ left: 40 }} />
              <p>{game.state.texts[current] || t("reveal.empty")}</p>
            </div>
          ) : (
            <div className="board-wrap">
              <div className="pic"><Pic k={current} alt={`${author?.name ?? ""} · ${t("reveal.drawing")}`} /></div>
            </div>
          )}
          {score && step > 0 ? (
            <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
              <button type="button" className="vote" aria-pressed={voted} disabled={mine} onClick={() => game.vote(current, !voted)}>
                <Icon name="check" size={20} />{t("reveal.fits", { name: author?.name ?? "" })}
              </button>
              <span className="muted" style={{ fontSize: 14 }}>{t("reveal.votes", { n: voters.length })}</span>
            </div>
          ) : null}
        </div>
        {score ? <Ranking players={match.players} points={points} /> : left > 0 ? (
          <div className="stack-back" aria-label={t("reveal.left", { n: left })} role="img">
            <span style={{ background: "#e8d6b2", transform: "rotate(7deg)" }} />
            <span style={{ background: "#efdfbe", transform: "rotate(2deg)" }} />
            <span style={{ background: "#f7e8c9", transform: "rotate(-3deg)", display: "grid", placeItems: "center" }}><img src="./illustrations/countdown-stars.webp" alt="" style={{ width: 64, height: 64, objectFit: "cover", objectPosition: "100% 0" }} /></span>
            <em>{t("reveal.left", { n: left })}</em>
          </div>
        ) : null}
      </div>
    </>
  );
}

function GalleryView({ album }: { album: number }) {
  const game = useGame();
  const t = useT();
  const match = game.state.match!;
  const plan = match.plan.albums[album];
  const pages = plan.kinds.map((_, p) => p).filter((p) => p > 0);
  const cols = pages.length <= 4 ? 2 : pages.length <= 9 ? 3 : 4;
  const asker = match.players[plan.authors[0]];
  return (
    <>
      <div className="prompt-row">
        <div className="paper prompt">
          <span className="tape" style={{ left: 30, width: 56, height: 20 }} />
          <span className="who"><Avatar person={asker} size={24} />{asker?.name} · {t("reveal.question")}</span>
          <h1>{game.state.texts[pageKey({ album, page: 0 })] || "…"}</h1>
        </div>
      </div>
      <div className="gallery-wrap">
      <div className="gallery" style={{ gridTemplateColumns: `repeat(${cols}, min(calc((100cqw - ${(cols - 1) * 14}px) / ${cols}), calc((100cqh - ${(Math.ceil(pages.length / cols) - 1) * 14}px) / ${Math.ceil(pages.length / cols)} * 4 / 3)))` }}>
        {pages.map((p) => {
          const person = match.players[plan.authors[p]];
          return (
            <figure key={p}>
              <Pic k={pageKey({ album, page: p })} alt={person?.name ?? ""} />
              <figcaption><Avatar person={person} size={22} />{person?.name}</figcaption>
            </figure>
          );
        })}
      </div>
      </div>
    </>
  );
}

function AnimationView({ album }: { album: number }) {
  const game = useGame();
  const t = useT();
  const match = game.state.match!;
  const plan = match.plan.albums[album];
  const backdropPage = match.plan.mode === "background" ? 1 : -1;
  const frames = plan.kinds.map((k, p) => ({ k, p })).filter(({ k, p }) => !isTextKind(k) && p !== backdropPage).map(({ p }) => p);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<"slow" | "normal" | "fast">("normal");
  const [loop, setLoop] = useState(true);
  useEffect(() => {
    if (!playing || frames.length < 2) return;
    const ms = speed === "slow" ? 520 : speed === "fast" ? 160 : 300;
    const id = setInterval(() => setIndex((i) => {
      if (i + 1 >= frames.length) {
        if (!loop) { setPlaying(false); return i; }
        return 0;
      }
      return i + 1;
    }), ms);
    return () => clearInterval(id);
  }, [playing, speed, loop, frames.length]);
  const owner = match.players[plan.owner];
  const page = frames[index] ?? frames[0];
  const theme = game.state.texts[pageKey({ album, page: 0 })];
  const artists = [...new Set(frames.map((p) => plan.authors[p]))].map((i) => match.players[i]);
  return (
    <div className="reveal">
      <div className="page-col">
        <div className="author-chip"><Avatar person={owner} size={30} /><span><strong>{t("reveal.animation", { name: owner?.name ?? "" })}</strong>{theme ? <span className="muted"> · „{theme}”</span> : null}</span></div>
        <div className="board-wrap">
          <div className="pic">
            <div className="layers">
              {backdropPage > 0 ? <Pic k={pageKey({ album, page: backdropPage })} alt="" /> : null}
              {page !== undefined ? <Pic k={pageKey({ album, page })} alt={t("reveal.frame")} /> : null}
            </div>
          </div>
        </div>
        <div className="player-ctl">
          <button type="button" className="icon-btn" aria-label={playing ? t("reveal.pause") : t("reveal.play")} onClick={() => setPlaying(!playing)}><Icon name={playing ? "pause" : "play"} /></button>
          <div className="ticks" aria-label={`${index + 1} / ${frames.length}`}>{frames.map((_, i) => <i key={i} className={i < index ? "on" : i === index ? "now" : undefined} />)}</div>
          <span className="disp" style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{index + 1} / {frames.length}</span>
        </div>
      </div>
      <aside style={{ width: 240, display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <div className="label" style={{ color: "var(--muted)", marginBottom: 8 }}>{t("reveal.speed")}</div>
          <div className="seg" role="group" aria-label={t("reveal.speed")}>
            {(["slow", "normal", "fast"] as const).map((s) => <button key={s} type="button" aria-pressed={speed === s} onClick={() => setSpeed(s)}>{t(`reveal.speed.${s}` as Key)}</button>)}
          </div>
        </div>
        <div className="setting"><span>{t("reveal.loop")}</span><button type="button" className="toggle" role="switch" aria-checked={loop} aria-label={t("reveal.loop")} onClick={() => setLoop(!loop)}><span /></button></div>
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {artists.map((p) => p ? <li key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}><Avatar person={p} size={26} />{p.name}</li> : null)}
        </ul>
      </aside>
    </div>
  );
}

function CorpseView({ album, step }: { album: number; step: number }) {
  const game = useGame();
  const t = useT();
  const match = game.state.match!;
  const plan = match.plan.albums[album];
  const parts = plan.kinds.length;
  return (
    <div className="reveal">
      <div className="page-col">
        <div className="board-wrap">
          <div className="pic">
            <div className="layers">
              {plan.kinds.map((_, p) => p <= step ? <Pic key={p} k={pageKey({ album, page: p })} alt="" /> : null)}
              {[...Array(parts - 1).keys()].map((i) => <span key={i} className="fold" style={{ top: `${((i + 1) / parts) * 100}%` }} />)}
              <span className="band-cover" style={{ top: `${((step + 1) / parts) * 100}%`, bottom: 0 }} />
            </div>
          </div>
        </div>
        <p className="muted" style={{ fontSize: 14 }}>{t("reveal.unfold")}</p>
      </div>
      <ol className="parts" aria-label={t("mode.corpse.name")} style={{ height: "60%" }}>
        {plan.authors.map((a, p) => {
          const person = match.players[a];
          return <li key={p} style={{ opacity: p <= step ? 1 : 0.35 }}><Avatar person={person} size={32} /><span><strong>{p <= step ? person?.name : "?"}</strong> <span className="muted">· {t(`task.part.${p}` as Key)}</span></span></li>;
        })}
      </ol>
    </div>
  );
}

function MosaicView({ album }: { album: number }) {
  const game = useGame();
  const match = game.state.match!;
  const plan = match.plan.albums[album];
  const tiles = plan.kinds.map((_, p) => p).filter((p) => p > 0);
  const asker = match.players[plan.authors[0]];
  return (
    <>
      <div className="prompt-row">
        <div className="paper prompt">
          <span className="tape" style={{ left: 30, width: 56, height: 20 }} />
          <span className="who"><Avatar person={asker} size={24} />{asker?.name}</span>
          <h1>{game.state.texts[pageKey({ album, page: 0 })] || "…"}</h1>
        </div>
      </div>
      <div className="reveal">
        <div className="page-col">
          <div className="board-wrap">
            <div className="pic"><div className="layers">{tiles.map((p) => <Pic key={p} k={pageKey({ album, page: p })} alt="" />)}</div></div>
          </div>
          <div className="stack" aria-label={tiles.map((p) => match.players[plan.authors[p]]?.name).join(", ")}>
            {tiles.map((p) => <Avatar key={p} person={match.players[plan.authors[p]]} size={30} />)}
          </div>
        </div>
      </div>
    </>
  );
}

function ExhibitView({ album }: { album: number }) {
  const game = useGame();
  const t = useT();
  const match = game.state.match!;
  const plan = match.plan.albums[album];
  const painter = match.players[plan.authors[1]];
  const titler = match.players[plan.authors[0]];
  return (
    <div className="reveal">
      <div className="page-col">
        <div className="board-wrap">
          <div className="frame-gold"><div className="pic" style={{ width: "min(calc(100cqw - 36px), calc((100cqh - 120px) * 4 / 3))" }}><Pic k={pageKey({ album, page: 1 })} alt={game.state.texts[pageKey({ album, page: 0 })] ?? ""} /></div></div>
        </div>
        <div className="paper plaque">
          <p>„{game.state.texts[pageKey({ album, page: 0 })] || "…"}”</p>
          <span className="muted" style={{ color: "var(--ink-soft)", fontSize: 14 }}>{t("reveal.paintedBy", { painter: painter?.name ?? "", title: titler?.name ?? "" })}</span>
        </div>
      </div>
    </div>
  );
}

export function RevealScreen() {
  const game = useGame();
  const t = useT();
  const { openMenu } = usePrefs();
  const match = game.state.match!;
  const order = useMemo(() => revealOrder(match.plan), [match.plan]);
  const pointer = game.state.reveal?.index ?? 0;
  const step = order[Math.min(pointer, order.length - 1)];
  const lastAnnounced = useRef("");
  const shownAlbums = [...new Set(order.map((s) => s.album))];
  useEffect(() => {
    const id = `${step.album}:${step.step}`;
    if (lastAnnounced.current && lastAnnounced.current !== id) play("page");
    lastAnnounced.current = id;
  }, [step.album, step.step]);
  if (!step) return null;
  const owner = match.players[match.plan.albums[step.album].owner];
  const kind = match.plan.albums[step.album].kind;
  const last = pointer >= order.length - 1;
  const lastOfAlbum = step.step >= step.steps - 1;

  let view;
  if (kind === "gallery") view = <GalleryView album={step.album} />;
  else if (kind === "animation") view = <AnimationView key={step.album} album={step.album} />;
  else if (kind === "corpse") view = <CorpseView album={step.album} step={step.step} />;
  else if (kind === "mosaic") view = <MosaicView album={step.album} />;
  else if (kind === "exhibit") view = <ExhibitView album={step.album} />;
  else view = <ChainView album={step.album} step={step.step} />;

  const title = kind === "gallery" ? t("reveal.gallery") : kind === "exhibit" ? t("reveal.exhibit") : t("reveal.album", { name: owner?.name ?? "" });

  return (
    <section className="screen" style={{ position: "relative" }}>
      <header className="reveal-head">
        <div className="reveal-brand">
          <img src="./logo-mark.webp" alt="" className="logo-mark" />
          <span className="disp muted" style={{ fontWeight: 700 }}>{t("reveal.title")} · {t("reveal.position", { i: shownAlbums.indexOf(step.album) + 1, n: shownAlbums.length })}</span>
        </div>
        <h1>{kind === "chain" || kind === "corpse" ? <Avatar person={owner} size={38} /> : null}{title}</h1>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button type="button" className="icon-btn" onClick={openMenu} aria-label={t("settings.menu")}><Icon name="menu" /></button>
        </div>
      </header>
      {view}
      <footer className="reveal-foot">
        <ReactionBar />
        <HostControls last={last} lastOfAlbum={lastOfAlbum} />
      </footer>
      <Floaters />
    </section>
  );
}
