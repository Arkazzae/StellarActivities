import { useEffect } from "react";
import { revealMs, RESULTS_MS, TOPIC_MS, VOTE_MS } from "../game/rules.ts";
import { MAX_PLAYERS, MIN_PLAYERS, MODES, PACKS, ROUND_OPTIONS, SEARCH_OPTIONS, type PackId } from "../game/types.ts";
import { count } from "../i18n/index.ts";
import { Avatar, Backdrop, Cat, Header, useGame } from "./parts.tsx";

const STEPS = [
  { title: "step1Title", text: "step1Text" },
  { title: "step2Title", text: "step2Text" },
  { title: "step3Title", text: "step3Text" },
] as const;

export function Lobby() {
  const game = useGame();
  const { t, lang } = game;
  const s = game.state;
  const host = game.isHost;
  const roster = game.roster();
  const watching = game.people.filter((p) => p.connected && !roster.some((r) => r.id === p.id));
  const hostName = game.host ? game.player(game.host)?.name : null;
  const slots = Array.from({ length: MAX_PLAYERS }, (_, i) => roster[i] ?? null);
  const settings = s.settings;
  const perRound = TOPIC_MS + settings.searchSeconds * 1000 + revealMs(roster.length) + VOTE_MS / 2 + RESULTS_MS;
  const minutes = Math.max(1, Math.round((perRound * settings.rounds) / 60_000));
  const enough = roster.length >= MIN_PLAYERS;
  const noGifs = game.gifProblem === "unavailable" || game.gifProblem === "permission";

  // Ask whether GIFs work here: on entry, when the window comes back, and now and then.
  useEffect(() => {
    void game.probeGifs();
    const again = () => void game.probeGifs();
    window.addEventListener("focus", again);
    const timer = setInterval(again, 20_000);
    return () => {
      window.removeEventListener("focus", again);
      clearInterval(timer);
    };
  }, [game]);

  return (
    <div className="screen lobby">
      <Backdrop kind="lobby" />
      <Header right={hostName ? <span className="muted">{t("hostIs", { name: hostName })}</span> : null} />
      <div className="lobby-grid">
        <section className="card lobby-intro">
          <h1 className="display lobby-title">{t("lobbyTitle")}</h1>
          <ol className="steps">
            {STEPS.map((step, i) => (
              <li key={step.title}>
                <span className="step-no">{i + 1}</span>
                <span>
                  <span className="step-title">{t(step.title)}</span>
                  <span className="muted step-text">{t(step.text)}</span>
                </span>
              </li>
            ))}
          </ol>
          <p className="muted small lobby-note">{t("lobbyNote", { min: MIN_PLAYERS, max: MAX_PLAYERS })}</p>
        </section>

        <section className="lobby-players" aria-labelledby="gracze">
          <Cat pose="hello" className="bob lobby-cat" />
          <h2 id="gracze" className="display">{t("playersInChannel", { n: roster.length, max: MAX_PLAYERS })}</h2>
          <ul className="slots">
            {slots.map((p, i) => (
              <li key={p?.id ?? `wolne-${i}`}>
                {p ? (
                  <>
                    <Avatar who={p} size={62} outline={p.id === game.host ? "var(--coral)" : p.id === game.me ? "var(--mint)" : "var(--line)"} />
                    <span className="slot-name">{p.name}</span>
                    <span className="muted tiny">{p.id === game.host ? t("roleHost") : p.id === game.me ? t("you") : t("rolePlayer")}</span>
                  </>
                ) : (
                  <>
                    <span className="slot-empty" aria-hidden="true" />
                    <span className="muted tiny">{t("free")}</span>
                  </>
                )}
              </li>
            ))}
          </ul>
          {watching.length > 0 && <p className="muted small">{t("watchingList", { names: watching.map((p) => p.name).join(", ") })}</p>}
        </section>

        <section className="card lobby-settings" aria-labelledby="ust">
          <div className="settings-head">
            <h2 id="ust" className="display">{t("settings")}</h2>
            <span className="muted tiny">{host ? t("hostOnly") : t("setBy", { name: hostName ?? t("theHost") })}</span>
          </div>

          <fieldset className="modes">
            <legend>{t("mode")}</legend>
            <div className="modes-grid">
              {MODES.map((m) => {
                const on = settings.mode === m.id;
                return (
                  <button key={m.id} type="button" className={`mode${on ? " on" : ""}`} aria-pressed={on} disabled={!host || !m.ready} onClick={() => game.setSettings({ mode: m.id })}>
                    <span className="mode-name">{t(`mode.${m.id}`)}</span>
                    <span className="muted tiny">{m.ready ? t(`mode.${m.id}.desc`) : t("soon")}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="rows">
            <div className="row">
              <span id="l-rundy" className="row-label">{t("rounds")}</span>
              <div role="group" aria-labelledby="l-rundy" className="seg">
                {ROUND_OPTIONS.map((n) => (
                  <button key={n} type="button" className={settings.rounds === n ? "on" : ""} aria-pressed={settings.rounds === n} disabled={!host} onClick={() => game.setSettings({ rounds: n })}>{n}</button>
                ))}
              </div>
            </div>
            <div className="row">
              <span id="l-czas" className="row-label">{t("timeToFind")}</span>
              <div role="group" aria-labelledby="l-czas" className="seg">
                {SEARCH_OPTIONS.map((n) => (
                  <button key={n} type="button" className={settings.searchSeconds === n ? "on" : ""} aria-pressed={settings.searchSeconds === n} disabled={!host} onClick={() => game.setSettings({ searchSeconds: n })}>{n} s</button>
                ))}
              </div>
            </div>
            <div className="row">
              <label htmlFor="tematy" className="row-label">{t("topics")}</label>
              <select id="tematy" value={settings.pack} disabled={!host} onChange={(e) => game.setSettings({ pack: e.target.value as PackId })}>
                {PACKS.map((p) => <option key={p.id} value={p.id}>{t(`pack.${p.id}`)}</option>)}
              </select>
            </div>
            <label className="check">
              <input type="checkbox" checked={settings.names} disabled={!host} onChange={(e) => game.setSettings({ names: e.target.checked })} />
              <span><strong>{t("namesInTopics")}</strong></span>
            </label>
          </div>

          <div className="start">
            {noGifs && <p className="gif-note">{t("noGifsInstance")}</p>}
            {game.gifProblem === "declined" && <p className="gif-note">{t("gifsDeclined")}</p>}
            {host ? (
              <button type="button" className="btn btn-primary" disabled={!enough || noGifs} onClick={() => game.start()}>
                {noGifs ? t("noGifsButton") : enough ? t("start") : t("waitingPlayers", { n: roster.length, min: MIN_PLAYERS })}
              </button>
            ) : (
              <p className="waiting display">{t("waitingHost", { name: hostName ?? t("theHost") })}</p>
            )}
            <p className="muted tiny">{t("estimate", { people: count(lang, roster.length, "people"), rounds: count(lang, settings.rounds, "rounds"), min: minutes })}</p>
          </div>
        </section>
      </div>
    </div>
  );
}
