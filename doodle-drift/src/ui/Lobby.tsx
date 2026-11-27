import { useState } from "react";
import { MODES, MODE_GROUPS, modeDef } from "../game/modes.ts";
import { buildPlan } from "../game/plan.ts";
import { secondsFor } from "../game/rules.ts";
import { MAX_PLAYERS } from "../game/types.ts";
import type { Length, ModeId, Tempo } from "../game/types.ts";
import type { Key } from "../lib/i18n.ts";
import { useT } from "../lib/i18n.ts";
import { play } from "../lib/sfx.ts";
import { Avatar, Icon, ModeArt } from "./common.tsx";
import { useGame, usePrefs } from "./context.ts";
import { MenuStage } from "./MenuStage.tsx";
import { CustomRulesModal, useCustomSummary } from "./CustomRules.tsx";

export function Lobby({ onModes, customOpen, onCustom }: { onModes: () => void; customOpen: boolean; onCustom: (open: boolean) => void }) {
  const game = useGame();
  const t = useT();
  const { openMenu } = usePrefs();
  const { settings } = game.state;
  const players = game.lobbyPlayers();
  const connected = game.people.filter((p) => p.connected);
  const watchers = connected.slice(MAX_PLAYERS);
  const away = game.people.filter((p) => !p.connected);
  const host = game.people.find((p) => p.id === game.host);
  const mode = modeDef(settings.mode);
  const isHost = game.isHost;
  const enough = players.length >= mode.min;
  const rounds = buildPlan(settings, Math.max(1, players.length), "preview").rounds.length;
  const custom = settings.mode === "custom";
  const customSummary = useCustomSummary(settings, rounds);

  const set = (patch: Partial<typeof settings>) => void game.setSettings({ ...settings, ...patch });
  const tempos: Tempo[] = ["fast", "normal", "slow"];
  const lengths: Length[] = ["short", "full"];

  return (
    <section className="screen">
      <header className="bar plain">
        <div className="brand"><img src="./artwork/icon-v2.png" alt="" /><span className="brand-name">Doodle <b>Drift</b></span></div>
        <div className="bar-end">
          <span className="channel-chip"><Icon name="mic" size={17} />{t("lobby.inChannel", { n: connected.length })}</span>
          <button type="button" className="icon-btn" onClick={openMenu} aria-label={t("settings.title")}><Icon name="menu" /></button>
        </div>
      </header>

      <div className="lobby">
        <section className="lobby-main">
          <MenuStage />
          <div className="lobby-copy">
            <h1>{isHost ? t("lobby.title") : t("lobby.titleGuest")}</h1>
            <p className="lobby-sub">{isHost ? t("lobby.subtitle") : t("lobby.subtitleGuest", { host: host?.name ?? "Host" })}</p>
          </div>
          <ol className="steps notes">
            <li><span className="tape" aria-hidden="true" /><span className="step-n">1</span><span><strong>{t("lobby.step1")}</strong><span>{t("lobby.step1b")}</span></span></li>
            <li><span className="tape coral" aria-hidden="true" /><span className="step-n" style={{ background: "var(--coral)" }}>2</span><span><strong>{t("lobby.step2")}</strong><span>{t("lobby.step2b")}</span></span></li>
            <li><span className="tape" aria-hidden="true" /><span className="step-n" style={{ background: "var(--lime)" }}>3</span><span><strong>{t("lobby.step3")}</strong><span>{t("lobby.step3b")}</span></span></li>
          </ol>
        </section>

        <aside className="panel side">
          <div className="side-head">
            <h2>{t("lobby.players")}</h2>
            <span className="disp muted">{players.length} / {MAX_PLAYERS}</span>
          </div>
          <ul className="people">
            {players.map((p) => (
              <li key={p.id} className={p.id === game.me ? "me" : undefined}>
                <Avatar person={p} size={32} />
                <strong>{p.name}</strong>
                {p.id === game.me ? <span className="muted" style={{ fontSize: 13 }}>{t("lobby.you")}</span> : null}
                {p.id === game.host ? <span className="tag"><Icon name="crown" size={15} />{t("lobby.host")}</span> : null}
              </li>
            ))}
            {away.map((p) => (
              <li key={p.id} style={{ opacity: 0.6 }}>
                <Avatar person={p} size={32} />
                <strong>{p.name}</strong>
                <span className="tag" style={{ color: "var(--muted)" }}>{t("lobby.connecting")}</span>
              </li>
            ))}
            {watchers.map((p) => (
              <li key={p.id} style={{ opacity: 0.7 }}>
                <Avatar person={p} size={32} />
                <strong>{p.name}</strong>
                <span className="tag" style={{ color: "var(--muted)" }}><Icon name="eye" size={15} />{t("lobby.watcher")}</span>
              </li>
            ))}
          </ul>
          {watchers.length ? <p className="muted" style={{ fontSize: 13 }}>{t("lobby.overflow")}</p> : null}
          <div className="rule-line" />

          {isHost ? (
            <>
              <div className="setting">
                <span>{t("lobby.mode")}</span>
                <button type="button" className="mode-choice" onClick={onModes}>
                  <span>{t(`mode.${settings.mode}.name` as Key)}</span><em>{t("lobby.change")}</em><Icon name="next" size={16} />
                </button>
              </div>
              {custom ? (
                <>
                  <p className="muted" style={{ fontSize: 13, lineHeight: 1.4 }}>{customSummary}</p>
                  <button type="button" className="ghost" onClick={() => onCustom(true)}><Icon name="dice" size={18} />{t("custom.open")}</button>
                </>
              ) : (
              <>
              <div className="setting">
                <span>{t("lobby.tempo")}</span>
                <div className="seg" role="group" aria-label={t("lobby.tempo")}>
                  {tempos.map((tempo) => (
                    <button key={tempo} type="button" aria-pressed={settings.tempo === tempo} onClick={() => set({ tempo })}>{t(`lobby.tempo.${tempo}` as Key)}</button>
                  ))}
                </div>
              </div>
              <div className="setting">
                <span>{t("lobby.length")}</span>
                <div className="seg" role="group" aria-label={t("lobby.length")}>
                  {lengths.map((length) => (
                    <button key={length} type="button" aria-pressed={settings.length === length} onClick={() => set({ length })}>{t(`lobby.length.${length}` as Key)}</button>
                  ))}
                </div>
              </div>
              <p className="muted" style={{ fontSize: 13, lineHeight: 1.4 }}>
                {t("lobby.timing", { write: secondsFor("write", settings.tempo), draw: secondsFor("draw", settings.tempo) })} {t("lobby.rounds", { n: rounds })}.
              </p>
              </>
              )}
              <div className="launch">
                <button type="button" className="btn wide" disabled={!enough || players.length === 0} onClick={() => { play("go"); void game.start(); }}>
                  {players.length === 1 ? t("lobby.startSolo") : t("lobby.start")}<Icon name="arrow" />
                </button>
                <small>{enough ? t("lobby.startNote") : t("lobby.needMore", { n: mode.min })}</small>
              </div>
            </>
          ) : (
            <>
              <div className="fact"><span className="muted">{t("lobby.mode")}</span><strong className="disp">{t(`mode.${settings.mode}.name` as Key)}</strong></div>
              {custom ? (
                <p className="fact" style={{ minHeight: 0, padding: "10px 14px", lineHeight: 1.4 }}>{customSummary}</p>
              ) : (
                <>
                  <div className="fact"><span className="muted">{t("lobby.tempo")}</span><strong className="disp">{t(`lobby.tempo.${settings.tempo}` as Key)}</strong></div>
                  <div className="fact"><span className="muted">{t("lobby.length")}</span><strong className="disp">{t(`lobby.length.${settings.length}` as Key)} · {t("lobby.rounds", { n: rounds })}</strong></div>
                </>
              )}
              <div className="launch">
                <div className="waiting-host" role="status"><span className="pulse" />{t("lobby.waitHost", { host: host?.name ?? "Host" })}</div>
              </div>
            </>
          )}
        </aside>
      </div>
      {customOpen && isHost ? <CustomRulesModal onClose={() => onCustom(false)} /> : null}
    </section>
  );
}

export function ModePicker({ onClose }: { onClose: (picked?: ModeId) => void }) {
  const game = useGame();
  const t = useT();
  const { openMenu } = usePrefs();
  const [picked, setPicked] = useState<ModeId>(game.state.settings.mode);
  const players = game.lobbyPlayers().length;
  const mode = modeDef(picked);

  const choose = () => {
    void game.setSettings({ ...game.state.settings, mode: picked });
    play("pop");
    onClose(picked);
  };

  return (
    <section className="screen">
      <header className="bar plain">
        <button type="button" className="ghost" onClick={() => onClose()}><Icon name="back" size={18} />{t("modes.back")}</button>
        <h1 className="disp" style={{ fontSize: 28, fontWeight: 750, letterSpacing: "-0.02em" }}>{t("modes.title")}</h1>
        <span className="muted" style={{ fontSize: 14, display: "inline-flex", alignItems: "center", gap: 6 }}><Icon name="dice" size={16} />{t("modes.dice")}</span>
        <div className="bar-end">
          <button type="button" className="icon-btn" onClick={openMenu} aria-label={t("settings.title")}><Icon name="menu" /></button>
        </div>
      </header>
      <div className="modes">
        <div className="modes-list">
          {MODE_GROUPS.map((group) => (
            <div key={group}>
              <h2>{t(`modes.group.${group}` as Key)}</h2>
              <div className="mode-grid" role="group" aria-label={t(`modes.group.${group}` as Key)} style={{ marginTop: 8 }}>
                {MODES.filter((m) => m.group === group).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className="mode-card"
                    aria-pressed={picked === m.id}
                    onClick={() => setPicked(m.id)}
                    onDoubleClick={() => { setPicked(m.id); }}
                    title={players < m.min ? t("modes.min", { n: m.min }) : undefined}
                  >
                    <ModeArt mode={m.id} className="art" />
                    <span>
                      <strong>{t(`mode.${m.id}.name` as Key)}</strong>
                      <small>{players < m.min ? t("modes.min", { n: m.min }) : t(`mode.${m.id}.rule` as Key)}</small>
                    </span>
                    {m.dice ? <span className="die" title={t("modes.inMix")}><Icon name="dice" size={15} label={t("modes.inMix")} /></span> : null}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <aside className="panel mode-detail">
          <div className="art-big"><ModeArt mode={mode.id} /></div>
          <div>
            <h2>{t(`mode.${mode.id}.name` as Key)}</h2>
            <p style={{ marginTop: 6 }}>{t(`mode.${mode.id}.long` as Key)}</p>
          </div>
          {mode.min > 1 ? <p>{t("modes.min", { n: mode.min })}</p> : null}
          <button type="button" className="btn wide" onClick={choose}>{t("modes.pick", { mode: t(`mode.${mode.id}.name` as Key) })}</button>
        </aside>
      </div>
      <div className="modes-confirm">
        <button type="button" className="btn wide" onClick={choose}>{t("modes.pick", { mode: t(`mode.${mode.id}.name` as Key) })}</button>
      </div>
    </section>
  );
}
