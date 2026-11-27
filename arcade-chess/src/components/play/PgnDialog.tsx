import { useEffect, useMemo, useRef, useState } from "react";
import { useUiStore } from "@/state/ui";
import { gamePgn } from "@/game/session";
import { useTranslation } from "@/i18n";

export function PgnDialog() {
  const open = useUiStore((s) => s.pgnOpen);
  const setOpen = useUiStore((s) => s.setPgnOpen);
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const pgn = useMemo(() => (open ? gamePgn() : ""), [open]);

  useEffect(() => {
    if (!open) return;
    setCopied(false);
    requestAnimationFrame(() => area.current?.select());
  }, [open]);

  if (!open) return null;
  const copy = async () => {
    area.current?.select();
    try {
      await navigator.clipboard.writeText(pgn);
      setCopied(true);
    } catch {
      // No clipboard in this frame: the text stays selected for Ctrl/Cmd+C.
      try {
        setCopied(document.execCommand("copy"));
      } catch {
        setCopied(false);
      }
    }
  };

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="pgn-title" onClick={() => setOpen(false)}>
      <div className="modal__card" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2 id="pgn-title">{t("pgn.title")}</h2>
          <button type="button" className="modal__close" onClick={() => setOpen(false)} aria-label={t("over.close")}>×</button>
        </header>
        <textarea ref={area} className="pgn-text" readOnly value={pgn} rows={10} spellCheck={false} />
        <div className="pgn-actions">
          <button type="button" className="btn btn--green" onClick={() => void copy()}>{copied ? t("pgn.copied") : t("pgn.copy")}</button>
          <a className="btn" href={'data:application/x-chess-pgn;charset=utf-8,' + encodeURIComponent(pgn)} download="arcade-chess.pgn">{t("pgn.download")}</a>
          <span className="modal__note">{t("pgn.note")}</span>
        </div>
      </div>
    </div>
  );
}
