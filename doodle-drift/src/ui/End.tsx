import { useEffect, useMemo, useState } from "react";
import { isTextKind } from "../game/plan.ts";
import { albumPictureKeys, download, makeGif } from "../lib/gif.ts";
import type { Key } from "../lib/i18n.ts";
import { useT } from "../lib/i18n.ts";
import { pageKey } from "../net/protocol.ts";
import { revealOrder } from "../net/reveal.ts";
import { Avatar, Bitmap, Icon, stampUrl } from "./common.tsx";
import { useGame, usePrefs } from "./context.ts";
import { usePoints } from "./Reveal.tsx";

function Cover({ album }: { album: number }) {
  const game = useGame();
  const match = game.state.match!;
  const plan = match.plan.albums[album];
  const keys = albumPictureKeys(match.plan, album);
  const layered = plan.kind === "corpse" || plan.kind === "mosaic";
  const shown = layered ? keys : plan.kind === "animation" ? keys.slice(-1) : keys.slice(-1);
  useEffect(() => { game.want(keys); }, [game, keys.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <span className="cover">
      <span className="layers" style={{ display: "block" }}>
        {match.plan.mode === "background" && plan.kind === "animation" && game.picture(pageKey({ album, page: 1 })) ? <Bitmap bits={game.picture(pageKey({ album, page: 1 }))} alt="" className="fill" /> : null}
        {shown.map((key) => game.picture(key) ? <Bitmap key={key} bits={game.picture(key)} alt="" className="fill" /> : null)}
      </span>
    </span>
  );
}

function GifModal({ album, onClose }: { album: number; onClose: () => void }) {
  const game = useGame();
  const t = useT();
  const match = game.state.match!;
  const shown = useMemo(() => [...new Set(revealOrder(match.plan).map((s) => s.album))], [match.plan]);
  const [current, setCurrent] = useState(album);
  const [pageMs, setPageMs] = useState(2000);
  const [drawingsOnly, setDrawingsOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const keys = albumPictureKeys(match.plan, current);
  const missing = keys.filter((k) => !game.picture(k) && !game.state.empty.includes(k));
  useEffect(() => { game.want(keys); }, [game, current]); // eslint-disable-line react-hooks/exhaustive-deps
  const owner = match.players[match.plan.albums[current].owner];
  const preview = keys.map((k) => game.picture(k)).find(Boolean);

  const make = async () => {
    setBusy(true);
    setError("");
    try {
      const blob = await makeGif({
        plan: match.plan,
        players: match.players,
        texts: game.state.texts,
        picture: (k) => game.picture(k),
        album: current,
        pageMs,
        drawingsOnly,
        title: t("reveal.album", { name: owner?.name ?? "" }),
      });
      download(blob, `doodle-drift-${(owner?.name ?? "album").toLowerCase().replace(/[^a-z0-9ąćęłńóśźż]+/gi, "-")}.gif`);
    } catch (e) {
      console.error(e);
      setError(t("gif.failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="paper modal wide" role="dialog" aria-modal="true" aria-labelledby="gif-title">
        <span className="tape" style={{ left: 60 }} />
        <header>
          <h2 id="gif-title" className="disp">{t("gif.title")}</h2>
          <button type="button" className="close" aria-label={t("settings.close")} onClick={onClose}><Icon name="close" /></button>
        </header>
        <div className="chips" role="group">
          {shown.map((a) => {
            const person = match.players[match.plan.albums[a].owner];
            return <button key={a} type="button" className="chip" aria-pressed={current === a} onClick={() => setCurrent(a)}><Avatar person={person} size={28} />{person?.name}</button>;
          })}
        </div>
        <div className="gif-body">
          <div className="gif-preview">{preview ? <Bitmap bits={preview} alt="" className="fill" /> : <span className="spinner" />}</div>
          <div style={{ flex: "1 1 260px", display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <div className="lab" style={{ marginBottom: 8 }}>{t("gif.pageTime")}</div>
              <div className="seg" role="group" aria-label={t("gif.pageTime")}>
                {[1000, 2000, 3000].map((ms) => <button key={ms} type="button" aria-pressed={pageMs === ms} onClick={() => setPageMs(ms)}>{ms / 1000} s</button>)}
              </div>
            </div>
            <div>
              <div className="lab" style={{ marginBottom: 8 }}>{t("gif.content")}</div>
              <div className="seg" role="group" aria-label={t("gif.content")}>
                <button type="button" aria-pressed={!drawingsOnly} onClick={() => setDrawingsOnly(false)}>{t("gif.all")}</button>
                <button type="button" aria-pressed={drawingsOnly} onClick={() => setDrawingsOnly(true)}>{t("gif.drawings")}</button>
              </div>
            </div>
            {missing.length ? <p className="hint">{t("gif.missing", { n: missing.length })}</p> : null}
            {error ? <p className="hint" style={{ color: "var(--coral-text)" }}>{error}</p> : null}
            <button type="button" className="btn" style={{ marginTop: "auto" }} disabled={busy || missing.length > 0} onClick={() => void make()}>
              <Icon name="download" />{busy ? t("gif.making") : t("gif.download")}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

export function EndScreen() {
  const game = useGame();
  const t = useT();
  const { openMenu } = usePrefs();
  const match = game.state.match!;
  const albums = useMemo(() => [...new Set(revealOrder(match.plan).map((s) => s.album))], [match.plan]);
  const pages = albums.reduce((sum, a) => sum + match.plan.albums[a].kinds.length, 0);
  const [gif, setGif] = useState<number | null>(null);
  const points = usePoints();
  const score = match.plan.reveal === "score";
  const winner = score ? [...match.players].sort((a, b) => (points[b.id] ?? 0) - (points[a.id] ?? 0))[0] : null;
  const textOf = (album: number, page: number) => game.state.texts[pageKey({ album, page })];

  return (
    <section className="screen">
      <header className="bar plain">
        <img src="./logo-mark.webp" alt="" className="logo-mark" />
        <span className="disp muted" style={{ fontWeight: 700 }}>Doodle Drift</span>
        <div className="bar-end"><button type="button" className="icon-btn" onClick={openMenu} aria-label={t("settings.menu")}><Icon name="menu" /></button></div>
      </header>
      <div className="end">
        <section className="end-copy">
          <div style={{ display: "flex", gap: 6 }} aria-hidden="true">
            <img src="./illustrations/countdown-stars.webp" alt="" style={{ width: 56, height: 56, objectFit: "cover", objectPosition: "100% 0", transform: "rotate(-10deg)" }} />
          </div>
          <h1>{t("end.title")}</h1>
          <p className="muted" style={{ fontSize: 17, lineHeight: 1.45 }}>{t("end.summary", { albums: albums.length, pages })}</p>
          {winner ? (
            <div className="stat">
              <Avatar person={winner} size={44} />
              <div><div className="muted" style={{ fontSize: 13, fontWeight: 700 }}>{t("end.ranking")}</div><div className="disp" style={{ fontSize: 17, fontWeight: 750 }}>{winner.name} · {points[winner.id] ?? 0}</div></div>
            </div>
          ) : (
            <div className="stat"><img src={stampUrl("laugh")} alt="" style={{ width: 44, height: 44 }} /><div className="disp" style={{ fontSize: 16, fontWeight: 750 }}>{t(`mode.${match.plan.mode}.name` as Key)}</div></div>
          )}
          <div className="end-actions">
            {game.isHost ? <button type="button" className="btn wide" onClick={() => void game.backToLobby()}><Icon name="repeat" />{t("end.again")}</button> : null}
            <button type="button" className="ghost" onClick={() => setGif(albums[0])}><Icon name="gif" />{t("end.gif")}</button>
          </div>
        </section>
        <ul className="end-grid">
          {albums.map((a, i) => {
            const plan = match.plan.albums[a];
            const owner = match.players[plan.owner];
            const textPages = plan.kinds.map((k, p) => ({ k, p })).filter(({ k }) => isTextKind(k)).map(({ p }) => p);
            const first = textPages.length ? textOf(a, textPages[0]) : undefined;
            const lastText = textPages.length > 1 ? textOf(a, textPages[textPages.length - 1]) : undefined;
            return (
              <li key={a}>
                <button type="button" className="album-card" style={{ transform: `rotate(${[-1.2, 0.8, -0.6, 1, -1, 0.6][i % 6]}deg)` }} onClick={() => (game.isHost ? void game.replayAlbum(a) : setGif(a))}>
                  <span className="who"><Avatar person={owner} size={24} />{t("reveal.album", { name: owner?.name ?? "" })}</span>
                  <Cover album={a} />
                  {first ? <span className="from">{t("end.from", { text: first })}</span> : null}
                  {lastText ? <span className="to">{t("end.to", { text: lastText })}</span> : null}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      {gif !== null ? <GifModal album={gif} onClose={() => setGif(null)} /> : null}
    </section>
  );
}
