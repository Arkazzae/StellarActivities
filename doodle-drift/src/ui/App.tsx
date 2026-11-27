import { useCallback, useEffect, useRef, useState } from "react";
import type { Game } from "../net/game.ts";
import { pageKey } from "../net/protocol.ts";
import { LangContext, langFromLocale, useT } from "../lib/i18n.ts";
import { setLevels, unlockAudio, play } from "../lib/sfx.ts";
import { Icon } from "./common.tsx";
import { GameContext, PrefsContext, useGame, usePrefs } from "./context.ts";
import type { Prefs } from "./context.ts";
import { EndScreen } from "./End.tsx";
import { Lobby, ModePicker } from "./Lobby.tsx";
import { RevealScreen } from "./Reveal.tsx";
import { Countdown, TaskScreen, WaitingScreen } from "./Task.tsx";
import { useTick } from "./common.tsx";

function Settings({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { prefs, setPrefs } = usePrefs();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="paper modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <span className="tape" style={{ left: 46 }} />
        <span className="tape coral" style={{ right: 40 }} />
        <header>
          <h2 id="settings-title" className="disp">{t("settings.title")}</h2>
          <button type="button" className="close" aria-label={t("settings.close")} onClick={onClose}><Icon name="close" /></button>
        </header>
        <div className="row">
          <div><div className="lab">{t("settings.language")}</div><div className="hint">{t("settings.languageHint")}</div></div>
          <div className="seg" role="group" aria-label={t("settings.language")}>
            <button type="button" aria-pressed={prefs.lang === "pl"} onClick={() => setPrefs({ lang: "pl" })}>Polski</button>
            <button type="button" aria-pressed={prefs.lang === "en"} onClick={() => setPrefs({ lang: "en" })}>English</button>
          </div>
        </div>
        <div className="row">
          <div><label className="lab" htmlFor="sfx">{t("settings.sound")}</label><div className="hint">{t("settings.soundHint")}</div></div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--ink)" }}>
            <Icon name="volume" />
            <input id="sfx" type="range" min="0" max="100" value={Math.round(prefs.sound * 100)} onChange={(e) => setPrefs({ sound: Number(e.target.value) / 100 })} onMouseUp={() => play("pop")} />
          </div>
        </div>
        <div className="row">
          <div><div className="lab" id="motion-label">{t("settings.motion")}</div><div className="hint">{t("settings.motionHint")}</div></div>
          <button type="button" className="toggle" role="switch" aria-checked={prefs.lessMotion} aria-labelledby="motion-label" onClick={() => setPrefs({ lessMotion: !prefs.lessMotion })}><span /></button>
        </div>
        <div className="shortcuts" aria-label={t("settings.shortcuts")}>
          <span><kbd>Enter</kbd> {t("task.done")}</span>
          <span><kbd>Spacja</kbd> {t("reveal.next")}</span>
          <span><kbd>Shift</kbd> {t("draw.rect")}</span>
        </div>
        <footer>
          <span />
          <button type="button" className="btn" onClick={onClose}>{t("settings.back")}</button>
        </footer>
      </section>
    </div>
  );
}

function Screens() {
  const game = useGame();
  const t = useT();
  const [modes, setModes] = useState(false);
  const [custom, setCustom] = useState(false);
  useTick(500);
  const { phase, match, round } = game.state;

  if (game.connection === "closed") return <div className="center-msg">{t("app.closed")}</div>;

  if (phase === "lobby" || !match) {
    if (modes && game.isHost) return <ModePicker onClose={(picked) => { setModes(false); if (picked === "custom") setCustom(true); }} />;
    return <Lobby onModes={() => setModes(true)} customOpen={custom} onCustom={setCustom} />;
  }
  if (phase === "play" && round) {
    if (game.myIndex < 0) return <WaitingScreen spectator />;
    if (game.now() < round.startsAt) return <Countdown />;
    const task = game.task;
    const handedIn = game.state.done.includes(game.me) || (task ? game.submitted.has(pageKey(task)) : false);
    if (handedIn) return <WaitingScreen />;
    return <TaskScreen />;
  }
  if (phase === "reveal") return <RevealScreen />;
  if (phase === "end") return <EndScreen />;
  return <div className="center-msg"><div><div className="spinner" />{t("app.loading")}</div></div>;
}

function Banner() {
  const game = useGame();
  const t = useT();
  if (game.connection !== "reconnecting") return null;
  return <div className="banner" role="status">{t("app.offline")}</div>;
}

export function App({ game }: { game: Game }) {
  const [prefs, setPrefsState] = useState<Prefs>({ lang: langFromLocale(game.session.locale.get()), sound: 0.7, lessMotion: false });
  const [menu, setMenu] = useState(false);
  const revision = useRef(0);
  const loaded = useRef(false);

  useEffect(() => {
    void game.session.progress.load().then(({ revision: rev, data }) => {
      revision.current = rev;
      loaded.current = true;
      const saved = (data ?? {}) as Partial<Prefs>;
      setPrefsState((current) => ({
        lang: saved.lang === "pl" || saved.lang === "en" ? saved.lang : current.lang,
        sound: typeof saved.sound === "number" ? saved.sound : current.sound,
        lessMotion: typeof saved.lessMotion === "boolean" ? saved.lessMotion : current.lessMotion,
      }));
    }).catch(() => { loaded.current = true; });
  }, [game]);

  useEffect(() => {
    const apply = (volume: number) => setLevels(prefs.sound, volume);
    apply(game.session.media.volume.get());
    return game.session.media.volume.subscribe(apply);
  }, [game, prefs.sound]);

  const setPrefs = useCallback((next: Partial<Prefs>) => {
    setPrefsState((current) => {
      const merged = { ...current, ...next };
      if (loaded.current) {
        void game.session.progress.save({ ...merged }, revision.current).then((rev) => { revision.current = rev; }).catch(async () => {
          try {
            const fresh = await game.session.progress.load();
            revision.current = await game.session.progress.save({ ...merged }, fresh.revision);
          } catch { /* preferences are optional */ }
        });
      }
      return merged;
    });
  }, [game]);

  useEffect(() => {
    document.documentElement.lang = prefs.lang;
    document.documentElement.classList.toggle("less-motion", prefs.lessMotion);
  }, [prefs.lang, prefs.lessMotion]);

  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  return (
    <GameContext.Provider value={game}>
      <LangContext.Provider value={prefs.lang}>
        <PrefsContext.Provider value={{ prefs, setPrefs, openMenu: () => setMenu(true) }}>
          <main className="app">
            <Screens />
            <Banner />
            {menu ? <Settings onClose={() => setMenu(false)} /> : null}
          </main>
        </PrefsContext.Provider>
      </LangContext.Provider>
    </GameContext.Provider>
  );
}
