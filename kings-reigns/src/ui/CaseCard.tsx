import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { artOf, eventById } from "@/game/catalog";
import type { SharedState } from "@/game/rules";
import { CATEGORY_META, ROLE_META, STAT_META, type ChoiceSide, type RoleId } from "@/game/types";
import { ROMAN, backers, intelFor, signed } from "@/game/view";

const LEAN = 150;
const COMMIT = 96;

interface Props {
  state: SharedState;
  role: RoleId | null;
  traitor: boolean;
  /** Whether dragging or Enter commits (a vote, or the King's decree). */
  canCommit: boolean;
  onCommit: (side: ChoiceSide) => void;
}

export function CaseCard({ state, role, traitor, canCommit, onCommit }: Props) {
  const event = eventById(state.event!);
  const [preview, setPreview] = useState<ChoiceSide | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  // The latest props for listeners that outlive a render.
  const latest = useRef({ canCommit, onCommit });
  latest.current = { canCommit, onCommit };
  const stopDrag = useRef<(() => void) | null>(null);
  useEffect(() => () => stopDrag.current?.(), []);

  const shown: ChoiceSide | null = drag !== null ? (drag < -24 ? "left" : drag > 24 ? "right" : null) : preview;
  const offset = drag ?? (preview === "left" ? -LEAN : preview === "right" ? LEAN : 0);
  const transform = offset ? `translateX(${offset}px) rotate(${(offset / LEAN) * 8}deg)` : "none";

  const commit = (side: ChoiceSide) => {
    setPreview(null);
    setDrag(null);
    if (latest.current.canCommit) latest.current.onCommit(side);
  };

  /**
   * The drag listens on the whole window, not on one captured element: releasing over the council,
   * over the role card or outside the activity frame always ends it. A pointer that comes back with
   * no button held ends it too, and losing focus puts the card back.
   */
  const pointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    stopDrag.current?.();
    setPreview(null);
    const grab = { id: e.pointerId, x: e.clientX, dx: 0, moved: false };
    const finish = (release: boolean) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", cancel);
      document.body.classList.remove("dragging-card");
      stopDrag.current = null;
      setDrag(null);
      if (release && grab.moved && Math.abs(grab.dx) >= COMMIT) commit(grab.dx < 0 ? "left" : "right");
    };
    const move = (ev: globalThis.PointerEvent) => {
      if (ev.pointerId !== grab.id) return;
      if (ev.pointerType === "mouse" && ev.buttons === 0) return finish(true);
      grab.dx = ev.clientX - grab.x;
      if (Math.abs(grab.dx) > 6) grab.moved = true;
      if (grab.moved) setDrag(Math.max(-260, Math.min(260, grab.dx)));
    };
    const up = (ev: globalThis.PointerEvent) => {
      if (ev.pointerId !== grab.id) return;
      grab.dx = ev.clientX - grab.x;
      finish(true);
    };
    const cancel = () => finish(false);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", cancel);
    document.body.classList.add("dragging-card");
    stopDrag.current = () => finish(false);
  };
  const key = (e: KeyboardEvent) => {
    if (e.key === "ArrowLeft") { e.preventDefault(); setPreview("left"); }
    else if (e.key === "ArrowRight") { e.preventDefault(); setPreview("right"); }
    else if ((e.key === "Enter" || e.key === " ") && preview) { e.preventDefault(); commit(preview); }
    else if (e.key === "Escape") setPreview(null);
  };

  const votesFor = (side: ChoiceSide) => backers(state, side).length;
  const intel = (side: ChoiceSide) => intelFor(state, role, traitor, side);
  const action = role === "king" ? "Wydaj dekret" : "Głosuj";

  return (
    <div className="stage">
      <Backers state={state} side="left" />
      <Backers state={state} side="right" />
      <div className="slot">
        <div className="under" aria-hidden="true">
          {shown === "left" && (
            <>
              <img src="assets/court/decree-fox.webp" alt="" />
              <UnderText side="left" label={event.left.label} votes={votesFor("left")} intel={intel("left")} king={role === "king" || !role} />
            </>
          )}
          {shown === "right" && (
            <>
              <img src="assets/court/decree-raven.webp" alt="" />
              <UnderText side="right" label={event.right.label} votes={votesFor("right")} intel={intel("right")} king={role === "king" || !role} />
            </>
          )}
        </div>
        <div
          className={"case" + (drag !== null ? " dragging" : "") + (canCommit ? " live" : "")}
          style={{ transform }}
          tabIndex={0}
          role="group"
          aria-roledescription="karta sprawy"
          aria-label={`${event.title}. ${event.text} Strzałki przechylają kartę, Enter zatwierdza.`}
          onKeyDown={key}
        >
          <span className="corner tl" /><span className="corner tr" /><span className="corner bl" /><span className="corner br" />
          <div className="numeral"><span /><b>{ROMAN[state.decree] ?? state.decree}</b><span /></div>
          <div className="window">
            <img src={artOf(event)} alt="" draggable={false} />
            {state.chained && <span className="chain-tag">Następstwo</span>}
            <span className="badge">
              <img src={CATEGORY_META[event.category].icon} alt="" />{CATEGORY_META[event.category].label}
              <span className="bars" role="img" aria-label={`Napięcie ${event.intensity} z 3`}>
                {[1, 2, 3].map((n) => <i key={n} className={n <= event.intensity ? "on" : ""} />)}
              </span>
            </span>
          </div>
          <h1>{event.title}</h1>
          <span className="petitioner">{ROLE_META[event.portraitRole].name} wnosi sprawę</span>
          <p className="text">{state.chained && event.chainText ? event.chainText : event.text}</p>
          <div className="grip"><span>‹ A · lis</span><span style={{ fontWeight: 600 }}>przeciągnij</span><span>kruk · B ›</span></div>
        </div>
        {/* Fixed over the card's place and taking the drag, so the moving card never slips from under the pointer. */}
        <div
          className={"drag-surface" + (canCommit ? " live" : "")}
          aria-hidden="true"
          onPointerDown={pointerDown}
        />
      </div>
      {canCommit && (
        <>
          <button type="button" className="sr-only" onClick={() => commit("left")}>{action}: {event.left.label}</button>
          <button type="button" className="sr-only" onClick={() => commit("right")}>{action}: {event.right.label}</button>
        </>
      )}
    </div>
  );
}

function UnderText({ side, label, votes, intel, king }: { side: ChoiceSide; label: string; votes: number; intel: ReturnType<typeof intelFor>; king: boolean }) {
  const rows: { stat: keyof typeof STAT_META; delta: number }[] = [];
  if (intel?.own) rows.push(intel.own);
  if (intel && intel.stability !== null) rows.push({ stat: "stability", delta: intel.stability });
  return (
    <div className={"under-text " + side}>
      <span className="kicker">DEKRET {side === "left" ? "A" : "B"}</span>
      <strong>{label}</strong>
      {rows.length > 0 && (
        <dl className="reveal-facts">
          {rows.map((row) => (
            <div key={row.stat}>
              <dt><img src={STAT_META[row.stat].icon} alt="" />{STAT_META[row.stat].label}</dt>
              <dd className={row.delta > 0 ? "up" : row.delta < 0 ? "down" : ""}>{signed(row.delta)}</dd>
            </div>
          ))}
        </dl>
      )}
      {intel?.worse && <p className="worse">Ten dekret bardziej szkodzi.</p>}
      {king && <p className="votes-line">{votes} {votes === 1 ? "głos" : votes > 1 && votes < 5 ? "głosy" : "głosów"} Rady</p>}
    </div>
  );
}

const RING: Record<RoleId, string> = { king: "#eb9d5e", treasury: "#dcb25a", army: "#ef8a78", faith: "#c9a3db", people: "#8fca88" };

function Backers({ state, side }: { state: SharedState; side: ChoiceSide }) {
  const roles = backers(state, side);
  return (
    <div className={"backers " + side} aria-label={`Za dekretem ${side === "left" ? "A" : "B"}`}>
      {roles.map((role) => {
        const seat = state.seats[role];
        const who = seat?.kind === "human" ? seat.name : "Bot";
        return (
          <span className="backer" key={role} style={{ ["--ring" as string]: RING[role] }}>
            <img src={ROLE_META[role].asset} alt={ROLE_META[role].name} />
            <span className="tag">{who} · {ROLE_META[role].name}</span>
          </span>
        );
      })}
    </div>
  );
}
