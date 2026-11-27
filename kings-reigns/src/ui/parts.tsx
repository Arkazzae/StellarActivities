import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Participant } from "@stellarr/sdk";
import { OMEN_META } from "@/game/catalog";
import { roleOf, type Message, type SharedState } from "@/game/rules";
import { ADVISORS, ROLE_META, STATS, STAT_META, type RoleId, type StatId, type Stats } from "@/game/types";
import { nearestEdge, signed } from "@/game/view";
import { send } from "@/stellarr/room";

// ── Icons ──

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export const Icon = {
  menu: () => <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" {...stroke} strokeWidth={2}><path d="M4 7h16M4 12h16M4 17h16" /></svg>,
  book: () => <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" {...stroke}><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M4 19V5" /><path d="M8 7h7" /></svg>,
  next: () => <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" {...stroke} strokeWidth={2.2}><path d="M9 6l6 6-6 6" /></svg>,
  prev: () => <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" {...stroke} strokeWidth={2.2}><path d="M15 6l-6 6 6 6" /></svg>,
  close: () => <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" {...stroke} strokeWidth={2}><path d="M6 6l12 12M18 6L6 18" /></svg>,
  lock: () => <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" {...stroke}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>,
  send: () => <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true" {...stroke}><path d="M4 12l16-8-6 16-2-7z" /></svg>,
  warn: ({ color = "currentColor" }: { color?: string }) => <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true" {...stroke} stroke={color} strokeWidth={2.2}><path d="M12 3l10 18H2z" /><path d="M12 10v4" /></svg>,
  users: () => <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" {...stroke}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8" /><path d="M18 14.8c1.8.7 3 2.4 3.5 5.2" /></svg>,
  hourglass: () => <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" {...stroke}><path d="M6 3h12M6 21h12" /><path d="M7 3c0 4.5 5 5.5 5 9s-5 4.5-5 9" /><path d="M17 3c0 4.5-5 5.5-5 9s5 4.5 5 9" /></svg>,
  check: () => <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" {...stroke} strokeWidth={2.2}><path d="M5 12l5 5 9-10" /></svg>,
  bot: () => <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" {...stroke}><rect x="4" y="8" width="16" height="11" rx="3" /><path d="M12 4v4" /><circle cx="9" cy="13" r="1" /><circle cx="15" cy="13" r="1" /></svg>,
};

// ── People ──

const AVATAR_COLORS = ["#5b6e9e", "#8a6a3a", "#7a3d3d", "#3d6a5a", "#6a4a7a", "#4a6a2a"];

export function Avatar({ name, src, id, size = 34 }: { name: string; src?: string | null; id?: string; size?: number }) {
  const color = AVATAR_COLORS[[...(id ?? name)].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % AVATAR_COLORS.length];
  return (
    <span className="avatar" style={{ width: size, height: size, background: color, fontSize: size * 0.42 }}>
      {src ? <img src={src} alt="" /> : name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function seatLabel(state: SharedState, role: RoleId): string {
  const seat = state.seats[role];
  return seat?.kind === "human" ? seat.name : "Bot";
}

export function isAway(state: SharedState, role: RoleId, participants: Participant[]): boolean {
  const seat = state.seats[role];
  return seat?.kind === "human" && !participants.some((p) => p.id === seat.id && p.connected);
}

// ── Role card ──

export type GameMode = SharedState["mode"];

/** What this role sees during play, in the words of the current mode. */
function roleNote(role: RoleId, traitor: boolean, mode: GameMode): string {
  const stat = ROLE_META[role].stat;
  if (mode === "diplomacy") {
    if (role === "king") return "Widzisz jawne skutki odpowiedzi. Ukryte zna tylko łącznik depeszy, a jeden z doradców kłamie.";
    if (traitor) return "Przy każdej depeszy widzisz, która odpowiedź naprawdę szkodzi najbardziej. Jako łącznik znasz też ukryte skutki.";
    return "Gdy jesteś łącznikiem depeszy, widzisz ukryte skutki każdej odpowiedzi. Tylko Ty je znasz.";
  }
  if (role === "king") return "Nie widzisz żadnych liczb. Słuchaj Rady i porównuj zeznania.";
  if (traitor) return `Przeciągnij kartę sprawy: zobaczysz ${STAT_META[stat!].label.toLowerCase()}, Stabilność, której nie zna nikt inny, i który dekret bardziej szkodzi.`;
  return `Przeciągnij kartę sprawy: pod spodem zobaczysz, co dekret zrobi z ${stat === "treasury" ? "Skarbcem" : stat === "army" ? "Armią" : stat === "faith" ? "Wiarą" : "Ludem"}. Tylko Ty znasz te liczby.`;
}

export function RoleCard({ role, traitor, size, mode = "council" }: { role: RoleId; traitor: boolean; size?: { w: number; h: number }; mode?: GameMode }) {
  const meta = ROLE_META[role];
  // Hover turns the card on a computer; a tap (or Enter) turns it anywhere.
  const [turned, setTurned] = useState(false);
  return (
    <div className="rolecard" style={size ? { width: size.w, height: size.h } : undefined}>
      <div className="fan far" aria-hidden="true" />
      <div className="fan near" aria-hidden="true" />
      <button type="button" className={"flip" + (turned ? " turned" : "")} aria-pressed={turned} onClick={() => setTurned((value) => !value)} aria-label={`Karta roli: ${meta.name}. ${traitor ? "Masz znak zdrajcy." : meta.title + "."} ${meta.detail}`}>
        <span className="inner">
          <span className="face">
            <span className="print">
              <img src={meta.asset} alt="" draggable={false} />
              <span className="caption">
                <strong>{meta.name}</strong>
                <span>{meta.caption}</span>
              </span>
            </span>
          </span>
          <span className="face back">
            <span className="backtext">
              {traitor && <span className="tag">Zdrajca · {meta.title}</span>}
              <strong className={traitor ? "traitor-text" : undefined}>{traitor ? "Masz znak zdrajcy" : meta.title}</strong>
              <span className="body">{traitor ? "Rada ma upaść przed końcem trzeciego roku. Wystarczy, że jeden filar spadnie do 0 albo dojdzie do 100." : meta.detail}</span>
              <span className="rule" />
              <span className={"note" + (traitor ? " traitor-text" : "")}>
                {roleNote(role, traitor, mode)}
              </span>
            </span>
          </span>
        </span>
      </button>
      {traitor && <img className="seal-stamp" src="assets/year/seal-traitor.webp" alt="" style={{ right: -30, top: -26, width: 92, height: 92, transform: "rotate(14deg)" }} />}
    </div>
  );
}

const PLURALS = { decree: ["dekret", "dekrety", "dekretów"], dispatch: ["depesza", "depesze", "depesz"] } as const;

function plural(count: number, unit: keyof typeof PLURALS): string {
  const [one, few, many] = PLURALS[unit];
  if (count === 1) return one;
  const tens = count % 100, ones = count % 10;
  return ones >= 2 && ones <= 4 && (tens < 12 || tens > 14) ? few : many;
}

export function TraitorNote({ stats, decreesLeft, unit = "decree" }: { stats: Stats; decreesLeft: number | null; unit?: keyof typeof PLURALS }) {
  const edge = nearestEdge(stats);
  return (
    <div className="traitor-note" role="note" aria-label="Przypomnienie: jesteś Zdrajcą">
      <strong>Jesteś Zdrajcą</strong>
      <span>Cel: dowolny filar na 0 albo 100. Najbliżej krawędzi jest {STAT_META[edge.stat].label} ({edge.value}).</span>
      <small>{decreesLeft !== null ? `Do sądu roku: ${decreesLeft} ${plural(decreesLeft, unit)} · ` : ""}najedź na kartę po szczegóły</small>
    </div>
  );
}

// ── Header ──

export function Header({ state, deltas, onMenu, label = "Dekret" }: { state: SharedState; deltas?: Partial<Stats> | null; onMenu: () => void; label?: string }) {
  const omen = state.omen ? OMEN_META[state.omen] : null;
  return (
    <header className="hdr">
      <div className="hdr-left">
        <img className="hdr-seal" src="assets/court/royal-seal.webp" alt="Kings Reigns" />
        <div className="hdr-count"><span>Rok</span><b>{state.year} / 3</b></div>
        <div className="hdr-count"><span>{label}</span><b>{state.decree} / 12</b></div>
        {omen && (
          <div className="hdr-omen" title={omen.passiveText}>
            <img src={omen.art} alt="" />
            <div className="hdr-count"><span>Znak roku</span><b>{omen.name}</b></div>
          </div>
        )}
      </div>
      <section className="meters" aria-label="Stan królestwa">
        {STATS.map((stat) => <Meter key={stat} stat={stat} value={state.stats[stat]} delta={deltas?.[stat]} />)}
      </section>
      <div className="hdr-actions">
        <button type="button" className="btn" aria-label="Menu" onClick={onMenu}><Icon.menu /><span className="btn-label">Menu</span></button>
      </div>
    </header>
  );
}

function Meter({ stat, value, delta }: { stat: StatId; value: number; delta?: number }) {
  const meta = STAT_META[stat];
  const edge = value <= 20 || value >= 80;
  return (
    <div className={"meter" + (edge ? " edge" : "")} title={`${meta.label}: ${value}`}>
      <img src={meta.icon} alt="" />
      <div className="meter-body">
        <div className="meter-top">
          <span><span className="label">{meta.label}</span>{edge && <Icon.warn color="#ef7a66" />}</span>
          <b>{value}</b>
        </div>
        <div className="meter-track"><div className="meter-fill" style={{ width: `${value}%`, background: meta.color }} /></div>
      </div>
      {delta ? <span className={"meter-delta " + (delta > 0 ? "up" : "down")}>{signed(delta)}</span> : null}
    </div>
  );
}

// ── Council panel ──

const ROLE_COLOR: Record<RoleId, string> = { king: "#eb9d5e", treasury: "#dcb25a", army: "#ef8a78", faith: "#c9a3db", people: "#8fca88" };

export function Council({ state, me, participants, badge }: { state: SharedState; me: string; participants: Participant[]; badge: (role: (typeof ADVISORS)[number]) => { text: string; on: boolean } }) {
  const [text, setText] = useState("");
  const feed = useRef<HTMLOListElement>(null);
  const myRole = roleOf(state, me);
  useEffect(() => {
    feed.current?.scrollTo({ top: feed.current.scrollHeight, behavior: "smooth" });
  }, [state.messages.length]);
  const voted = ADVISORS.filter((role) => badge(role).on).length;
  return (
    <aside className="council" aria-labelledby="council-title">
      <div className="council-head"><h2 id="council-title">Rada</h2><span>{voted} / 4</span></div>
      <ul className="roster" aria-label="Doradcy">
        {ADVISORS.map((role) => {
          const b = badge(role);
          const mine = myRole === role;
          return (
            <li key={role} title={`${ROLE_META[role].name} · ${seatLabel(state, role)}`}>
              <span className={"pic" + (mine ? " me" : "") + (isAway(state, role, participants) ? " away" : "")}>
                <img src={ROLE_META[role].asset} alt="" />
                <span className={"dot" + (b.on ? " on" : "")}>{b.text}</span>
              </span>
              <span className="name">{mine ? "Ty" : seatLabel(state, role) === "Bot" ? ROLE_META[role].name : seatLabel(state, role)}</span>
            </li>
          );
        })}
      </ul>
      <ol className="feed" ref={feed} aria-label="Rozmowa Rady" aria-live="polite">
        {state.messages.map((message) => <MessageRow key={message.id} message={message} />)}
      </ol>
      <form
        className="say"
        onSubmit={(event) => {
          event.preventDefault();
          if (!text.trim()) return;
          void send("say", { text });
          setText("");
        }}
      >
        <input type="text" aria-label="Wiadomość do Rady" placeholder={myRole && myRole !== "king" ? "Powiedz Radzie, co wiesz…" : "Napisz do Rady…"} value={text} maxLength={240} onChange={(event) => setText(event.target.value)} />
        <button type="submit" className="btn icon" aria-label="Wyślij"><Icon.send /></button>
      </form>
    </aside>
  );
}

function MessageRow({ message }: { message: Message }) {
  const role = message.role;
  return (
    <li className={"msg" + (message.system ? " system" : "")}>
      {role ? <img src={ROLE_META[role].asset} alt="" /> : <img src="assets/court/royal-seal.webp" alt="" />}
      <div>
        <div className="who" style={{ color: role ? ROLE_COLOR[role] : "#e7c27a" }}>
          {message.bot ? ROLE_META[role!].name : message.name}{" "}
          <small>{message.bot ? "· bot" : role && !message.system ? `· ${ROLE_META[role].name}` : ""}</small>
        </div>
        <div className="what">{message.text}</div>
      </div>
    </li>
  );
}

// ── Rules dialog ──

export function Rules({ onClose, mode = "council" }: { onClose: () => void; mode?: GameMode }) {
  const embassy = mode === "diplomacy";
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  return (
    <div className="dialog-scrim" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="rules-title">
        <button type="button" className="btn icon close" aria-label="Zamknij" onClick={onClose}><Icon.close /></button>
        <h2 id="rules-title">Jak grać?</h2>
        <ol className="steps">
          <li><span className="num">I</span><h3>Każdy dostaje rolę</h3><p>Król i czterech doradców: Skarbnik, Generał, Biskup i Trybun. Jeden z doradców jest Zdrajcą i tylko on o tym wie.</p></li>
          {embassy ? (
            <>
              <li><span className="num">II</span><h3>Łącznik zna więcej</h3><p>Depesza od piratów, portów albo gildii ma trzy odpowiedzi. Ich jawne skutki widzą wszyscy, a ukryte tylko łącznik, jeden z doradców. Rozmawiacie na kanale głosowym i głosujecie kliknięciem odpowiedzi.</p></li>
              <li><span className="num">III</span><h3>Król przykłada pieczęć</h3><p>Rok to 12 depesz, a na koniec roku sąd: Rada może stracić podejrzanego. Gdy filar spadnie do 0 albo dojdzie do 100, tron upada. Trzy lata bez upadku to wygrana Rady.</p></li>
            </>
          ) : (
            <>
              <li><span className="num">II</span><h3>Każdy zna kawałek prawdy</h3><p>Doradca widzi, jak dekret zmieni jego dziedzinę. Rozmawiacie na kanale głosowym i głosujecie przeciągnięciem karty. Król nie widzi żadnych liczb.</p></li>
              <li><span className="num">III</span><h3>Król wydaje dekret</h3><p>Rok to 12 dekretów, a na koniec roku sąd: Rada może stracić podejrzanego. Gdy filar spadnie do 0 albo dojdzie do 100, tron upada. Trzy lata bez upadku to wygrana Rady.</p></li>
            </>
          )}
        </ol>
        <div className="modes">
          <div><h3>Znak roku</h3><p>{embassy ? "Każdy rok ma swój znak, na przykład suszę albo wojnę. Po każdej depeszy trochę podgryza któryś filar." : "Każdy rok ma swój znak, na przykład suszę albo wojnę. Zmienia talię i po każdym dekrecie trochę podgryza któryś filar."}</p></div>
          <div><h3>Sąd roku</h3><p>Głosuje cała piątka. Wyrok zapada przy 3 głosach. Trafiony Zdrajca daje Stabilność +10, pomyłka kosztuje filar straconego −12.</p></div>
        </div>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 15, color: "#5a5243" }}>{embassy ? "Odpowiedź wybierasz kliknięciem albo klawiszami Tab i Enter." : "Na komputerze kartę przechylasz też strzałkami ← → i zatwierdzasz Enterem."}</span>
          <button type="button" className="btn" onClick={onClose}>Wracam na dwór</button>
        </div>
      </div>
    </div>
  );
}

export function Screen({ bg, veil = "", children }: { bg: string; veil?: string; children: ReactNode }) {
  return (
    <section className="screen">
      <img className="backdrop" src={bg} alt="" />
      <div className={"veil " + veil} />
      {children}
    </section>
  );
}

/** The Menu button for screens without the game header. */
export function MenuButton({ onMenu }: { onMenu: () => void }) {
  return <button type="button" className="btn float-menu" onClick={onMenu}><Icon.menu />Menu</button>;
}

/** The game menu: back to the game, the rules, the title screen, and for the host ending the reign. */
/** One line of a proclamation sheet: a gothic label, an optional italic line under it, and the wax seal on the main one. */
/** The back of a court card: the green lattice of the deck with the royal seal. */
export function CardBack() {
  return (
    <span className="card-back" aria-hidden="true">
      <img src="assets/court/royal-seal.webp" alt="" draggable={false} />
    </span>
  );
}

export function SheetEntry({ label, note, main, warn, disabled, autoFocus, onClick }: { label: string; note?: string; main?: boolean; warn?: boolean; disabled?: boolean; autoFocus?: boolean; onClick: () => void }) {
  return (
    <button type="button" className={"sheet-entry" + (main ? " main" : "") + (warn ? " warn" : "")} disabled={disabled} autoFocus={autoFocus} onClick={onClick}>
      <strong>{label}</strong>
      {note && <span>{note}</span>}
      {main && <img className="entry-seal" src="assets/year/seal-decree.webp" alt="" />}
    </button>
  );
}

export function GameMenu({ onClose, onRules, onTitle, canAbort, inGame }: { onClose: () => void; onRules: () => void; onTitle: () => void; canAbort: boolean; inGame: boolean }) {
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  return (
    <div className="dialog-scrim" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <nav className="sheet game-menu" role="dialog" aria-modal="true" aria-labelledby="menu-title">
        <span className="corner tl" /><span className="corner tr" /><span className="corner bl" /><span className="corner br" />
        <h2 id="menu-title" className="numeral"><span /><b>Menu</b><span /></h2>
        <SheetEntry main autoFocus label="Wróć do gry" onClick={onClose} />
        <SheetEntry label="Jak grać?" onClick={onRules} />
        <SheetEntry label="Ekran tytułowy" onClick={onTitle} />
        {canAbort && inGame && (
          confirm ? (
            <div className="menu-confirm">
              <p>Panowanie się skończy, a wszyscy wrócą do sali obrad. Krzesła zostaną.</p>
              <div className="row">
                <button type="button" className="btn danger" onClick={() => { void send("abort"); onClose(); }}>Zakończ panowanie</button>
                <button type="button" className="btn" onClick={() => setConfirm(false)}>Nie</button>
              </div>
            </div>
          ) : (
            <SheetEntry warn label="Zakończ panowanie…" note="Dotyczy całej Rady: wszyscy wrócą do sali obrad." onClick={() => setConfirm(true)} />
          )
        )}
      </nav>
    </div>
  );
}
