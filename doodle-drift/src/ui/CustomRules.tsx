import { useEffect } from "react";
import { sanitizeCustom } from "../game/plan.ts";
import type { CustomOrder, CustomRule, CustomRules, MatchSettings } from "../game/types.ts";
import type { Key } from "../lib/i18n.ts";
import { useT } from "../lib/i18n.ts";
import { Icon, ModeArt } from "./common.tsx";
import { useGame } from "./context.ts";

const ORDERS: CustomOrder[] = ["write", "draw", "drawings", "texts"];
const WRITE_TIMES = [20, 30, 40, 60, 90];
const DRAW_TIMES = [40, 60, 80, 120, 180];
const RULES: CustomRule[] = ["none", "mix", "stars", "oneline", "kaleido", "crayons", "blind", "telegram"];

/** One line describing the custom rules, for the lobby. */
export function useCustomSummary(settings: MatchSettings, rounds: number) {
  const t = useT();
  const c = sanitizeCustom(settings.custom);
  return t("custom.summary", {
    order: t(`custom.order.${c.order}` as Key),
    rounds: t("lobby.rounds", { n: rounds }),
    write: c.write,
    draw: c.draw,
  }) + (c.rule !== "none" ? ` · ${t(`mode.${c.rule}.name` as Key)}` : "");
}

/** The host's sheet for Własne zasady. Every change is saved to the room at once. */
export function CustomRulesModal({ onClose }: { onClose: () => void }) {
  const game = useGame();
  const t = useT();
  const settings = game.state.settings;
  const c = sanitizeCustom(settings.custom);
  const players = Math.max(1, game.lobbyPlayers().length);
  const maxRounds = players <= 1 ? 8 : Math.max(2, players);
  const shownRounds = c.rounds > 0 ? Math.min(c.rounds, maxRounds) : players <= 1 ? 4 : Math.max(2, players);

  const set = (patch: Partial<CustomRules>) => void game.setSettings({ ...settings, custom: { ...c, ...patch } });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const hasWriting = c.order !== "drawings";
  const hasDrawing = c.order !== "texts";

  return (
    <div className="modal-backdrop" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="paper modal wide custom-modal" role="dialog" aria-modal="true" aria-labelledby="custom-title">
        <span className="tape" style={{ left: 50 }} />
        <header>
          <h2 id="custom-title" className="disp">{t("custom.title")}</h2>
          <button type="button" className="close" aria-label={t("settings.close")} onClick={onClose}><Icon name="close" /></button>
        </header>

        <div className="custom-row">
          <div className="lab">{t("custom.order")}</div>
          <div className="seg wrap" role="group" aria-label={t("custom.order")}>
            {ORDERS.map((order) => <button key={order} type="button" aria-pressed={c.order === order} onClick={() => set({ order })}>{t(`custom.order.${order}` as Key)}</button>)}
          </div>
          <div className="hint">{t(`custom.orderHint.${c.order}` as Key)}</div>
        </div>

        <div className="custom-row">
          <div className="lab">{t("custom.rounds")}</div>
          <div className="stepper">
            <button type="button" className="close" aria-label={t("custom.fewer")} disabled={shownRounds <= 2} onClick={() => set({ rounds: Math.max(2, shownRounds - 1) })}><span aria-hidden="true">−</span></button>
            <output className="disp" aria-live="polite">{shownRounds}</output>
            <button type="button" className="close" aria-label={t("custom.more")} disabled={shownRounds >= maxRounds} onClick={() => set({ rounds: Math.min(maxRounds, shownRounds + 1) })}><span aria-hidden="true">+</span></button>
            <button type="button" className="chip" aria-pressed={c.rounds === 0} onClick={() => set({ rounds: 0 })}>{t("custom.full")}</button>
          </div>
        </div>

        {hasWriting ? (
          <div className="custom-row">
            <div className="lab">{t("custom.write")}</div>
            <div className="seg" role="group" aria-label={t("custom.write")}>
              {WRITE_TIMES.map((s) => <button key={s} type="button" aria-pressed={c.write === s} onClick={() => set({ write: s })}>{s} s</button>)}
            </div>
          </div>
        ) : null}

        {hasDrawing ? (
          <div className="custom-row">
            <div className="lab">{t("custom.draw")}</div>
            <div className="seg" role="group" aria-label={t("custom.draw")}>
              {DRAW_TIMES.map((s) => <button key={s} type="button" aria-pressed={c.draw === s} onClick={() => set({ draw: s })}>{s} s</button>)}
            </div>
          </div>
        ) : null}

        <div className="custom-row">
          <div className="lab">{t("custom.rule")}</div>
          <div className="chips" role="group" aria-label={t("custom.rule")}>
            {RULES.filter((rule) => (rule === "telegram" ? c.order === "write" || c.order === "draw" : rule === "none" || rule === "blind" || hasDrawing)).map((rule) => (
              <button key={rule} type="button" className="chip rule" aria-pressed={c.rule === rule} onClick={() => set({ rule })}>
                {rule === "none" ? null : <ModeArt mode={rule} />}
                {rule === "none" ? t("custom.rule.none") : t(`mode.${rule}.name` as Key)}
              </button>
            ))}
          </div>
        </div>

        <footer>
          <span />
          <button type="button" className="btn" onClick={onClose}>{t("task.done")}<Icon name="check" /></button>
        </footer>
      </section>
    </div>
  );
}
