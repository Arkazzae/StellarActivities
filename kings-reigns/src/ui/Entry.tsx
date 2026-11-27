import { useState } from "react";
import type { Participant } from "@stellarr/sdk";
import { BASE_EVENTS, OMEN_META, artOf } from "@/game/catalog";
import { roleOf, type SharedState } from "@/game/rules";
import { EMBASSY_ENABLED } from "@/game/features";
import { ADVISORS, CATEGORY_META, EVENT_CATEGORIES, ROLES, ROLE_META, STAT_META, type RoleId } from "@/game/types";
import { send } from "@/stellarr/room";
import { Avatar, CardBack, Icon, MenuButton, RoleCard, Screen, SheetEntry, isAway } from "./parts";

type CardFace = { art: string; title: string; kicker: string };

/** One case from each of the eight categories, as they lie on the council table. */
const EVENT_FACES: CardFace[] = EVENT_CATEGORIES.map((category) => {
  const event = BASE_EVENTS.find((entry) => entry.category === category)!;
  return { art: artOf(event), title: event.title, kicker: CATEGORY_META[category].label };
});
const omenFace = (id: "war" | "plague"): CardFace => ({ art: OMEN_META[id].art, title: OMEN_META[id].name, kicker: "Znak roku" });
const roleFace = (role: RoleId): CardFace => ({ art: ROLE_META[role].asset, title: ROLE_META[role].name, kicker: ROLE_META[role].title });

/**
 * Cards strewn around the title screen. Position in % of the screen, rotation, scale, and a slow
 * drift (offset, extra turn, period, phase). `turns` lies face down and turns over now and then.
 */
const TABLE: { x: number; y: number; r: number; s: number; dx: number; dy: number; dr: number; t: number; d: number; face?: CardFace; turns?: CardFace }[] = [
  { x: 4, y: 15, r: -16, s: 1, dx: 14, dy: -10, dr: 3, t: 22, d: -4, face: EVENT_FACES[0] },
  { x: 14, y: 48, r: 8, s: 0.92, dx: -10, dy: 16, dr: -2, t: 26, d: -11, face: roleFace("treasury") },
  { x: 5, y: 84, r: -7, s: 1.04, dx: 12, dy: -8, dr: 2, t: 19, d: -7, turns: EVENT_FACES[1] },
  { x: 21, y: 101, r: 13, s: 0.95, dx: -16, dy: -12, dr: -3, t: 24, d: -15, face: omenFace("war") },
  { x: 22, y: 5, r: 6, s: 0.9, dx: 10, dy: 12, dr: 3, t: 28, d: -2 },
  { x: 28, y: 72, r: -11, s: 0.86, dx: -12, dy: 10, dr: 2, t: 21, d: -18, face: EVENT_FACES[2] },
  { x: 75, y: 4, r: -8, s: 0.94, dx: -14, dy: 12, dr: -2, t: 25, d: -9, face: EVENT_FACES[3] },
  { x: 90, y: 28, r: 15, s: 1, dx: 10, dy: 14, dr: -3, t: 20, d: -3, turns: EVENT_FACES[4] },
  { x: 97, y: 63, r: -13, s: 1.04, dx: -12, dy: -14, dr: 2, t: 27, d: -13, face: EVENT_FACES[5] },
  { x: 81, y: 89, r: 7, s: 0.94, dx: 14, dy: -10, dr: 3, t: 23, d: -6, face: roleFace("army") },
  { x: 72, y: 52, r: 10, s: 0.84, dx: 12, dy: 10, dr: -2, t: 29, d: -20, face: omenFace("plague") },
  { x: 50, y: -7, r: 3, s: 0.9, dx: -16, dy: 8, dr: 2, t: 24, d: -10, face: EVENT_FACES[6] },
  { x: 53, y: 107, r: -5, s: 0.95, dx: 14, dy: -8, dr: -2, t: 22, d: -16, face: EVENT_FACES[7] },
  { x: 99, y: 101, r: -20, s: 1, dx: -10, dy: -12, dr: 3, t: 26, d: -8 },
];

function TableCard({ face }: { face: CardFace }) {
  return (
    <span className="table-face">
      <img src={face.art} alt="" draggable={false} />
      <strong>{face.title}</strong>
      <small>{face.kicker}</small>
    </span>
  );
}

/** The council table behind the title: cases, omens and court cards drifting slowly; once in a while one turns over. */
function CouncilTable({ paused }: { paused: boolean }) {
  return (
    <div className={"council-table" + (paused ? " paused" : "")} aria-hidden="true">
      {TABLE.map((card, index) => (
        <span
          key={index}
          className={"table-card" + (card.turns ? " turns" : "")}
          style={{
            left: `${card.x}%`,
            top: `${card.y}%`,
            ["--r" as string]: `${card.r}deg`,
            ["--s" as string]: card.s,
            ["--dx" as string]: `${card.dx}px`,
            ["--dy" as string]: `${card.dy}px`,
            ["--dr" as string]: `${card.dr}deg`,
            animationDuration: `${card.t}s`,
            animationDelay: `${card.d}s`,
          }}
        >
          {card.turns ? (
            <span className="inner" style={{ animationDelay: `${card.d * 1.7}s` }}>
              <CardBack />
              <span className="table-front"><TableCard face={card.turns} /></span>
            </span>
          ) : card.face ? <TableCard face={card.face} /> : <CardBack />}
        </span>
      ))}
    </div>
  );
}

export function Menu({ participants, solo, inGame, onEnter, onRules }: { participants: Participant[]; solo: boolean; inGame: boolean; onEnter: (mode?: "council" | "diplomacy") => void; onRules: () => void }) {
  const [still, setStill] = useState(false);
  const names = participants.map((p) => p.name);
  const main = inGame
    ? { label: "Wróć do gry", note: "Rada wciąż obraduje." }
    : solo
      ? { label: "Zasiądź na tronie", note: "Zagrasz jako Król z czterema botami. Jeden z nich jest Zdrajcą." }
      : { label: "Zwołaj radę", note: "Pięć krzeseł: Król i czterech doradców. Puste zajmą boty." };
  return (
    <Screen bg="assets/court/great-hall.webp" veil="soft">
      <CouncilTable paused={still} />
      <div className="table-vignette" />
      <div className="title-screen">
        <div className="title-center">
          <img className="title-seal" src="assets/court/royal-seal.webp" alt="" />
          <h1 className="title"><span>Kings</span> <span>Reigns</span></h1>
          <p className="tagline">Przetrwaj trzy lata na tronie. Jeden z doradców chce cię z niego zrzucić.</p>
          {!solo && participants.length > 1 && (
            <div className="people">
              <div className="faces">
                {participants.slice(0, 5).map((p) => <span className="face-dot" key={p.id}><Avatar name={p.name} src={p.avatar} id={p.id} size={34} /></span>)}
              </div>
              <span><b>{names.slice(0, 4).join(", ")}{names.length > 4 ? ` i ${names.length - 4} więcej` : ""}</b> {names.length === 1 ? "jest" : "są"} na kanale głosowym</span>
            </div>
          )}
          <nav className="sheet proclamation" aria-label="Menu główne">
            <span className="corner tl" /><span className="corner tr" /><span className="corner bl" /><span className="corner br" />
            <SheetEntry main label={main.label} note={main.note} onClick={() => onEnter("council")} />
            {EMBASSY_ENABLED && solo && !inGame && <SheetEntry label="Poselstwa" note="Depesze od piratów, portów i gildii." onClick={() => onEnter("diplomacy")} />}
            <SheetEntry label="Jak grać?" note="Role, znak roku i sąd nad zdrajcą w trzech krokach." onClick={onRules} />
            <p className="sheet-foot">Od jednego do pięciu graczy. Trzy lata, a po każdym roku sąd.</p>
          </nav>
        </div>
      </div>
      <button type="button" className="table-still" aria-pressed={still} onClick={() => setStill(!still)}>{still ? "Wznów tło" : "Zatrzymaj tło"}</button>
    </Screen>
  );
}

export function Lobby({ state, me, host, participants, onMenu }: { state: SharedState; me: string; host: string | null; participants: Participant[]; onMenu: () => void }) {
  const amHost = me === host;
  const mine = roleOf(state, me);
  const hostName = participants.find((p) => p.id === host)?.name ?? "gospodarz";
  const seatedIds = new Set(ROLES.map((role) => state.seats[role]).filter((seat) => seat?.kind === "human").map((seat) => (seat as { id: string }).id));
  const watchers = participants.filter((p) => !seatedIds.has(p.id));
  const anyHuman = seatedIds.size > 0;
  // A lobby left in Poselstwa from before they closed starts (and shows) an ordinary council.
  const mode = EMBASSY_ENABLED ? state.mode : "council";

  return (
    <Screen bg="assets/court/great-hall.webp" veil="">
      <div className="lobby">
        <header className="lobby-head">
          <div>
            <h1>Sala obrad</h1>
            <p>Usiądź na wolnym krześle. Puste miejsca zajmą boty, gdy gospodarz zacznie panowanie.</p>
          </div>
          <button type="button" className="btn" onClick={onMenu}><Icon.menu />Menu</button>
        </header>
        <div className="lobby-body">
          <ul className="chairs" aria-label="Krzesła Rady">
            {ROLES.map((role) => <Chair key={role} role={role} state={state} me={me} amHost={amHost} participants={participants} />)}
          </ul>
          <aside className="sheet lobby-sheet" aria-label="Przygotowanie panowania">
            <span className="corner tl" /><span className="corner tr" /><span className="corner bl" /><span className="corner br" />
            <h2 className="numeral"><span /><b>Tryb gry</b><span /></h2>
            <ModeEntry on={mode === "council"} canPick={amHost} label="Zwykła Rada" note="Sprawa i dwa dekrety. 184 sprawy i 50 pod znaki roku." onPick={() => void send("mode", { mode: "council" })} />
            <ModeEntry
              on={mode === "diplomacy"}
              canPick={amHost}
              closed={!EMBASSY_ENABLED}
              label="Poselstwa"
              note={EMBASSY_ENABLED ? "Depesze od piratów, portów i gildii. Trzy odpowiedzi, a jeden doradca zna ich ukryte skutki." : "Depesze od piratów, portów i gildii. Na razie zamknięte."}
              onPick={() => void send("mode", { mode: "diplomacy" })}
            />
            {amHost ? (
              <SheetEntry main label="Rozpocznij panowanie" note={anyHuman ? "Puste krzesła zajmą boty." : "Najpierw usiądź na którymś krześle."} disabled={!anyHuman} onClick={() => void send("start")} />
            ) : (
              <p className="sheet-wait">Czekamy, aż {hostName} zacznie panowanie.</p>
            )}
            {mine && <SheetEntry label="Wstań od stołu" onClick={() => void send("stand")} />}
            {watchers.length > 0 && <p className="sheet-foot">Na galerii: <b>{watchers.map((p) => p.name).join(", ")}</b>.</p>}
            <p className="sheet-foot">Zdrajcę los wybierze spośród czterech doradców, także spośród botów.</p>
          </aside>
        </div>
      </div>
    </Screen>
  );
}

/** A game mode on the lobby's sheet: a filled diamond marks the one chosen. */
function ModeEntry({ on, canPick, closed, label, note, onPick }: { on: boolean; canPick: boolean; closed?: boolean; label: string; note: string; onPick: () => void }) {
  return (
    <button type="button" className={"sheet-entry mode" + (on ? " on" : "") + (closed ? " off" : "")} aria-pressed={on} disabled={!canPick || closed} onClick={onPick}>
      <strong><i className="pick" aria-hidden="true" />{label}</strong>
      <span>{note}</span>
    </button>
  );
}

/** A chair as a court card: face down while it is free, the role's portrait once someone sits. */
function Chair({ role, state, me, amHost, participants }: { role: RoleId; state: SharedState; me: string; amHost: boolean; participants: Participant[] }) {
  const seat = state.seats[role];
  const meta = ROLE_META[role];
  const mine = seat?.kind === "human" && seat.id === me;
  const away = seat?.kind === "human" && isAway(state, role, participants);
  const stat = meta.stat ? STAT_META[meta.stat] : null;
  return (
    <li className={"chair" + (mine ? " mine" : "") + (!seat ? " open" : "") + (seat?.kind === "bot" ? " bot" : "") + (away ? " away" : "")}>
      <div className="chair-card">
        {seat ? (
          <span className="face"><span className="print"><img src={meta.asset} alt="" draggable={false} /></span></span>
        ) : (
          <CardBack />
        )}
      </div>
      <div className="chair-plate">
        <div className="chair-name"><b>{meta.name}</b><span>{meta.title}</span></div>
        <span className="chair-stat">
          {stat ? <><img src={stat.icon} alt="" />{stat.label}</> : <><img src="assets/court/icon-king.webp" alt="" />Wydaje dekrety</>}
        </span>
        <div className="chair-who">
          {seat?.kind === "human" && (
            <>
              <Avatar name={seat.name} src={seat.avatar} id={seat.id} size={28} />
              <b>{seat.name}</b>
              {mine && <span className="you">Ty</span>}
              {away && <span className="muted">nieobecny</span>}
            </>
          )}
          {seat?.kind === "bot" && <><span className="avatar" style={{ width: 28, height: 28, background: "#2a3326" }}><Icon.bot /></span><b>Bot</b></>}
          {!seat && <span className="muted">Wolne krzesło</span>}
        </div>
        <div className="chair-actions">
          {!mine && (!seat || seat.kind === "bot") && <button type="button" className="btn" onClick={() => void send("sit", { role })}>Usiądź</button>}
          {amHost && seat?.kind !== "human" && (
            <button type="button" className="btn" onClick={() => void send("seat", { role, bot: !seat })}>{seat ? "Zwolnij" : "Bot"}</button>
          )}
          {amHost && seat?.kind === "human" && !mine && away && (
            <button type="button" className="btn" onClick={() => void send("seat", { role, bot: false })}>Zwolnij</button>
          )}
        </div>
      </div>
    </li>
  );
}

export function Reveal({ state, me, role, traitor, onMenu }: { state: SharedState; me: string; role: RoleId | null; traitor: boolean; onMenu: () => void }) {
  const ready = state.ready.includes(me);
  const waiting = ROLES.filter((r) => {
    const seat = state.seats[r];
    return seat?.kind === "human" && !state.ready.includes(seat.id);
  }).length;
  return (
    <Screen bg="assets/court/dealing-table.webp" veil="soft">
      <div className="reveal">
        <MenuButton onMenu={onMenu} />
        <p className="locked"><Icon.lock />Tę kartę widzisz tylko Ty</p>
        {role ? (
          <div className="reveal-row">
            <RoleCard role={role} traitor={traitor} size={{ w: 280, h: 400 }} mode={state.mode} />
            {traitor ? (
              <section className="traitor-panel" aria-labelledby="traitor-title">
                <img className="seal-stamp" src="assets/year/seal-traitor.webp" alt="" style={{ right: -34, top: -40, width: 112, height: 112, transform: "rotate(14deg)" }} />
                <h1 id="traitor-title">Masz znak zdrajcy</h1>
                <p>Rada ma upaść przed końcem trzeciego roku. Wystarczy, że jeden filar spadnie do 0 albo dojdzie do 100.</p>
                <ul>
                  {state.mode === "diplomacy" ? (
                    <>
                      <li>Przy każdej depeszy podpowiemy, która odpowiedź naprawdę szkodzi najbardziej.</li>
                      <li>Gdy jesteś łącznikiem, tylko Ty znasz ukryte skutki. Możesz o nich skłamać.</li>
                    </>
                  ) : (
                    <>
                      <li>Widzisz też Stabilność. Nikt inny jej nie zna.</li>
                      <li>Przy każdej sprawie podpowiemy, który dekret bardziej szkodzi.</li>
                    </>
                  )}
                  <li>Po każdym roku jest sąd. Jeśli Rada cię wskaże, zginiesz.</li>
                </ul>
              </section>
            ) : (
              <section className="loyal-panel">
                <h1>{role === "king" ? "Zasiadasz na tronie" : "Jesteś lojalny"}</h1>
                <ul>
                  {role === "king" ? (
                    <>
                      <li>{state.mode === "diplomacy" ? "Widzisz jawne skutki odpowiedzi. Ukryte zna tylko łącznik depeszy." : "Nie widzisz żadnych liczb. Doradcy znają po kawałku prawdy."}</li>
                      <li>Jeden z nich kłamie. Na koniec każdego roku możecie go osądzić.</li>
                    </>
                  ) : (
                    <>
                      <li>{state.mode === "diplomacy" ? "Gdy jesteś łącznikiem depeszy, zobaczysz ukryte skutki każdej odpowiedzi." : "Przy każdej sprawie zobaczysz, co dekret zrobi z Twoją dziedziną."}</li>
                      <li>Jeden z pozostałych doradców jest Zdrajcą. Słuchaj, kto mija się z prawdą.</li>
                    </>
                  )}
                  <li>Przetrwajcie trzy lata, a Rada wygrywa.</li>
                </ul>
              </section>
            )}
          </div>
        ) : (
          <section className="loyal-panel"><h1>Oglądasz</h1><p className="muted">Krzesła są zajęte. Zobaczysz obrady, ale nie znasz niczyich liczb.</p></section>
        )}
        {role && (
          <button type="button" className="btn primary" disabled={ready} onClick={() => void send("ready")}>
            {ready ? (waiting ? `Czekamy na ${waiting} ${waiting === 1 ? "osobę" : "osoby"}` : "Zaczynamy") : "Do stołu"}<Icon.next />
          </button>
        )}
      </div>
    </Screen>
  );
}

export { ADVISORS };
