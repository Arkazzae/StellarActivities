import { useSettingsStore } from "@/state/settings";
import { useUiStore } from "@/state/ui";
import { soundMove } from "@/sounds";
import { useTranslation } from "@/i18n";
import { BOARD_THEMES, OFFERED_SETS, boardTheme, pieceSet, pieceUrl } from "@/board-style";
import type { CSSProperties } from "react";

/** A strip of the board as it will look: both colours of square, pieces of the chosen set. */
const PREVIEW = ["wr", "bn", "wk", "bq", "wb", "bp", "wn", "bk"] as const;

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle__track" />
      <span>{label}</span>
    </label>
  );
}

export function SettingsDialog() {
  const open = useUiStore((s) => s.settingsOpen);
  const setOpen = useUiStore((s) => s.setSettingsOpen);
  const ui = useUiStore();
  const settings = useSettingsStore();
  const { t, locale, setLocale } = useTranslation();
  if (!open) return null;
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="settings-title" onClick={() => setOpen(false)}>
      <div className="modal__card" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2 id="settings-title">{t("settings.title")}</h2>
          <button type="button" className="modal__close" onClick={() => setOpen(false)} aria-label={t("over.close")}>×</button>
        </header>
        <section>
          <h3>{t("settings.language")}</h3>
          <div className="lang-pick" role="radiogroup" aria-label={t("settings.language")}>
            {(["en", "pl"] as const).map((code) => (
              <button key={code} type="button" role="radio" aria-checked={locale === code} className={locale === code ? "is-selected" : ""} onClick={() => setLocale(code)}>
                {code === "en" ? "English" : "Polski"}
              </button>
            ))}
          </div>
        </section>
        <section>
          <h3>{t("settings.bots")}</h3>
          <Toggle label={t("settings.botChat")} checked={settings.botChat} onChange={settings.setBotChat} />
        </section>
        <section>
          <h3>{t("settings.sound")}</h3>
          <Toggle label={t("settings.sounds")} checked={settings.sound} onChange={settings.setSound} />
          <label className="range">
            <span>{t("settings.volume")}</span>
            <input type="range" min={0} max={100} value={settings.volume} onChange={(e) => settings.setVolume(Number(e.target.value))} onPointerUp={soundMove} />
            <output>{settings.volume}%</output>
          </label>
        </section>
        <section>
          <h3>{t("settings.look")}</h3>
          <div className="look-preview" aria-hidden="true">
            {PREVIEW.map((piece, i) => (
              <span key={piece} className={i % 2 ? "is-dark" : ""}>
                <img src={pieceUrl(piece[0] as "w" | "b", piece[1], settings.pieceSet)} alt="" />
              </span>
            ))}
          </div>
          <span className="look-label">{t("settings.pieces")}</span>
          <div className="set-pick" role="radiogroup" aria-label={t("settings.pieces")}>
            {OFFERED_SETS.map((set) => (
              <button key={set.id} type="button" role="radio" aria-checked={pieceSet(settings.pieceSet).id === set.id} className={pieceSet(settings.pieceSet).id === set.id ? "is-selected" : ""} onClick={() => settings.setPieceSet(set.id)}>
                <span className="set-pick__pieces">
                  <img src={pieceUrl("w", "k", set.id)} alt="" />
                  <img src={pieceUrl("b", "n", set.id)} alt="" />
                  <img src={pieceUrl("w", "p", set.id)} alt="" />
                </span>
                <span>{t(`pieces.${set.id}`)}</span>
              </button>
            ))}
          </div>
          <span className="look-label">{t("settings.boardColors")}</span>
          <div className="theme-pick" role="radiogroup" aria-label={t("settings.boardColors")}>
            {BOARD_THEMES.map((theme) => (
              <button key={theme.id} type="button" role="radio" aria-checked={settings.boardTheme === theme.id} className={settings.boardTheme === theme.id ? "is-selected" : ""} onClick={() => settings.setBoardTheme(theme.id)} title={t(`boardTheme.${theme.id}`)}>
                <span className="theme-pick__swatch" style={{ "--l": boardTheme(theme.id).light, "--d": boardTheme(theme.id).dark } as CSSProperties}><i /><i /><i /><i /></span>
                <span>{t(`boardTheme.${theme.id}`)}</span>
              </button>
            ))}
          </div>
        </section>
        <section>
          <h3>{t("settings.board")}</h3>
          <Toggle label={t("settings.coords")} checked={settings.showCoords} onChange={settings.setShowCoords} />
          <Toggle label={t("settings.legal")} checked={settings.showLegalMoves} onChange={settings.setShowLegalMoves} />
          <Toggle label={t("settings.animation")} checked={settings.moveAnimation} onChange={settings.setMoveAnimation} />
          <Toggle label={t("settings.premove")} checked={settings.premoveEnabled} onChange={settings.setPremoveEnabled} />
          <Toggle label={t("settings.autoQueen")} checked={settings.autoQueen} onChange={settings.setAutoQueen} />
          <Toggle label={t("settings.evalBar")} checked={ui.showEval} onChange={ui.setShowEval} />
        </section>
        <p className="modal__note">{t("settings.shortcuts")}</p>
      </div>
    </div>
  );
}
