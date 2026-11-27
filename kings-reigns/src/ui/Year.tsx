import { useEffect, useState } from "react";
import type { Participant } from "@stellarr/sdk";
import { CATEGORY_META, ROLES, ROLE_META, STATS, STAT_META, ADVISORS, type AdvisorRole, type RoleId } from "@/game/types";
import { OMEN_META } from "@/game/catalog";
import { agreement, type Accusation, type SharedState } from "@/game/rules";
import { ROLE_ACC, YEAR_NAMES, signed } from "@/game/view";
import { roomNow, send } from "@/stellarr/room";
import { Avatar, Icon, MenuButton, RoleCard, Screen, seatLabel } from "./parts";

function steerHint(state: SharedState): string {
  return state.seats.king?.kind === "human" ? "Czekamy na Króla." : "Za chwilę ruszamy.";
}

export function Omen({ state, steer, onMenu }: { state: SharedState; steer: boolean; onMenu: () => void }) {
  const omen = OMEN_META[state.omen!];
  const last = state.chronicle.at(-1);
  return (
    <Screen bg={omen.art} veil="">
      <div className="center-col">
        <MenuButton onMenu={onMenu} />
        <div style={{ textAlign: "center" }}>
          <p className="kicker-line">Początek roku</p>
          <h1 className="big-title">Rok {YEAR_NAMES[state.year]}</h1>
        </div>
        <div className="omen-row">
          {last ? (
            <div className="facts">
              <h2>Rok {YEAR_NAMES[last.year]} za wami</h2>
              <div className="fact">
                <img src="assets/year/trial-chamber.webp" alt="" style={{ borderRadius: 4, objectFit: "cover" }} />
                <span>{last.executed ? <>Sąd: Rada straciła <b>{ROLE_ACC[last.executed]}</b>. {last.wasTraitor ? "Był Zdrajcą." : "Był lojalny."}</> : "Sąd: nikt nie zginął."}</span>
              </div>
              <div className="fact"><img src={STAT_META.stability.icon} alt="" /><span>Nowy rok daje wytchnienie: każdy filar wraca o kilka punktów ku środkowi.</span></div>
            </div>
          ) : (
            <div className="facts">
              <h2>Królestwo czeka</h2>
              <div className="fact"><img src="assets/court/icon-king.webp" alt="" /><span>Trzy lata, po 12 {state.mode === "diplomacy" ? "depesz" : "dekretów"}. Po każdym roku sąd nad zdrajcą.</span></div>
            </div>
          )}
          <article className="omen-card" aria-labelledby="omen-title">
            <img src={omen.art} alt="" />
            <div>
              <small>Znak roku</small>
              <h2 id="omen-title">{omen.name}</h2>
              <p>{omen.flavor}</p>
            </div>
          </article>
          <div className="facts">
            <h2>Przez cały rok</h2>
            <div className="fact"><img src="assets/court/icon-stability.webp" alt="" /><span>{omen.passiveText}</span></div>
            {state.mode !== "diplomacy" && <div className="fact">
              <img src={CATEGORY_META[omen.categories[0]].icon} alt="" />
              <span>Więcej spraw z kategorii <b>{omen.categories.map((category) => CATEGORY_META[category].label).join(" i ")}</b>, w tym sprawy, które zdarzają się tylko pod tym znakiem.</span>
            </div>}
          </div>
        </div>
        {steer ? (
          <button type="button" className="btn primary" onClick={() => void send("begin")}>Zaczynamy rok {YEAR_NAMES[state.year]}<Icon.next /></button>
        ) : (
          <p className="hint">{steerHint(state)}</p>
        )}
      </div>
    </Screen>
  );
}

function useClock(deadline: number | undefined): number {
  const [now, setNow] = useState(roomNow());
  useEffect(() => {
    const timer = setInterval(() => setNow(roomNow()), 250);
    return () => clearInterval(timer);
  }, []);
  return Math.max(0, Math.ceil(((deadline ?? now) - now) / 1000));
}

export function Trial({ state, me, role, participants, onMenu }: { state: SharedState; me: string; role: RoleId | null; participants: Participant[]; onMenu: () => void }) {
  const trial = state.trial!;
  const left = useClock(trial.deadline);
  const mine = role ? trial.votes[role] : undefined;
  const votersFor = (target: Accusation) => ROLES.filter((voter) => trial.votes[voter] === target);
  const waiting = ROLES.filter((voter) => trial.votes[voter] === undefined);
  const accuse = (target: Accusation) => {
    if (role && target !== role) void send("accuse", { target });
  };

  const Voters = ({ target }: { target: Accusation }) => {
    const voters = votersFor(target);
    return (
      <div className="votes-row">
        {voters.length ? (
          <>
            <span className="faces">
              {voters.map((voter) => {
                const seat = state.seats[voter];
                return <span className="face-dot" key={voter} title={`${seatLabel(state, voter)} · ${ROLE_META[voter].name}`}>{seat?.kind === "human" ? <Avatar name={seat.name} src={seat.avatar} id={seat.id} size={28} /> : <img src={ROLE_META[voter].asset} alt="" />}</span>;
              })}
            </span>
            <b style={{ color: target !== "none" && voters.length >= 2 ? "#e7c27a" : "#c8c3b2" }}>{target === "none" ? voters.length : `${voters.length} z 3`}</b>
          </>
        ) : <span>bez głosów</span>}
      </div>
    );
  };

  return (
    <Screen bg="assets/year/trial-chamber.webp" veil="">
      <div className="trial">
        <MenuButton onMenu={onMenu} />
        <header className="trial-head">
          <div>
            <p className="kicker-line">Po dwunastym dekrecie</p>
            <h1>Sąd roku {YEAR_NAMES[state.year] === "pierwszy" ? "pierwszego" : YEAR_NAMES[state.year] === "drugi" ? "drugiego" : "trzeciego"}</h1>
            <p>Kto jest Zdrajcą? Wyrok zapada przy 3 głosach z 5. Głosuje też Król.</p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
            <span className="muted" style={{ fontSize: 13 }}>Do wyroku</span>
            <span className="timer" aria-live="polite">{Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</span>
          </div>
        </header>
        <ul className="suspects" aria-label="Oskarżeni">
          {ADVISORS.map((advisor) => (
            <li key={advisor}>
              <button
                type="button"
                className={"suspect" + (mine === advisor ? " chosen" : "")}
                aria-pressed={mine === advisor}
                disabled={!role || role === advisor}
                aria-label={`Oskarż: ${ROLE_META[advisor].name}, ${seatLabel(state, advisor)}`}
                onClick={() => accuse(advisor)}
              >
                <span className="print">
                  <img src={ROLE_META[advisor].asset} alt="" />
                  <span className="caption">
                    <strong>{ROLE_META[advisor].name}</strong>
                    <span style={{ fontWeight: 700 }}>{advisor === role ? "Ty" : seatLabel(state, advisor)}</span>
                    <span>Z Królem {agreement(state.log, advisor as AdvisorRole)} z {state.log.length}</span>
                  </span>
                </span>
              </button>
              <Voters target={advisor} />
            </li>
          ))}
          <li>
            <button type="button" className={"suspect none" + (mine === "none" ? " chosen" : "")} aria-pressed={mine === "none"} disabled={!role} onClick={() => accuse("none")}>
              <span className="label"><strong>Nikogo</strong><span>Zdrajca przeżyje rok</span></span>
            </button>
            <Voters target="none" />
          </li>
        </ul>
        <footer className="trial-foot">
          <span>{role ? (mine ? <>Twój głos: <b style={{ color: "#e7c27a" }}>{mine === "none" ? "nikogo" : ROLE_META[mine].name}</b>. Możesz go zmienić, dopóki nie zagłosują wszyscy albo nie minie czas.</> : "Kliknij kartę, żeby oskarżyć.") : "Oglądasz sąd."}</span>
          <span>{waiting.length ? <>Czeka jeszcze: <b style={{ color: "#eeebdf" }}>{waiting.map((voter) => ROLE_META[voter].name).join(", ")}</b></> : "Wszyscy zagłosowali."}</span>
        </footer>
        <span className="sr-only">{participants.length} osób w pokoju, Ty to {me}</span>
      </div>
    </Screen>
  );
}

export function Verdict({ state, steer, onMenu }: { state: SharedState; steer: boolean; onMenu: () => void }) {
  const verdict = state.verdict!;
  const executed = verdict.executed;
  const caught = verdict.wasTraitor;
  const bg = executed ? (caught ? "assets/year/verdict-traitor.webp" : "assets/year/verdict-innocent.webp") : "assets/year/trial-chamber.webp";
  const penalty = Object.entries(verdict.penalty).filter(([, value]) => value);
  const label = verdict.collapse ? "Zobacz koniec" : state.year >= 3 ? "Zobacz koniec panowania" : `Dalej: rok ${YEAR_NAMES[state.year + 1]}`;
  return (
    <Screen bg={bg} veil="side">
      <div className="verdict">
        <MenuButton onMenu={onMenu} />
        {executed ? (
          <div style={{ position: "relative" }}>
            <RoleCard role={executed} traitor={false} size={{ w: 300, h: 430 }} />
            <img className="seal-stamp" src={caught ? "assets/year/seal-traitor.webp" : "assets/year/seal-decree.webp"} alt="" style={{ right: -58, top: 140, width: 180, height: 180, transform: "rotate(-12deg)" }} />
          </div>
        ) : null}
        <section className="verdict-text" aria-labelledby="verdict-title">
          <span className="kicker-line">Wyrok Rady · rok {YEAR_NAMES[state.year]}</span>
          <h1 id="verdict-title">
            {executed ? <>{ROLE_META[executed].name} stracony.<br />{caught ? `${seatLabel(state, executed) === "Bot" ? "Był" : seatLabel(state, executed) + " był"} Zdrajcą.` : "Był lojalny."}</> : "Rada nikogo nie wskazała."}
          </h1>
          <p>
            {executed
              ? caught ? "Rada wskazała dobrze. Przy stole robi się ciszej i nikt nie patrzy sąsiadowi w oczy." : "Rada się pomyliła. Zdrajca wciąż siedzi przy stole i pewnie się uśmiecha."
              : "Zdrajca, jeśli wciąż jest przy stole, przeżyje kolejny rok."}
          </p>
          <ul className="list">
            {penalty.map(([stat, value]) => (
              <li key={stat}><img src={STAT_META[stat as keyof typeof STAT_META].icon} alt="" /><span style={{ flex: 1 }}>{STAT_META[stat as keyof typeof STAT_META].label}</span><b className="mono" style={{ color: value! > 0 ? "#8fca88" : "#ef8a78" }}>{signed(value!)}</b></li>
            ))}
            {caught && <li><img src={ROLE_META[executed!].asset} alt="" style={{ borderRadius: "50%", objectFit: "cover" }} /><span>{seatLabel(state, executed!)} zostaje przy stole jako nowy, lojalny {ROLE_META[executed!].name}.</span></li>}
            {caught && state.year < 3 && <li className="warn"><Icon.warn color="#ef7a66" /><span>Przed kolejnym rokiem los może po cichu wybrać nowego zdrajcę.</span></li>}
            {verdict.collapse && <li className="warn"><Icon.warn color="#ef7a66" /><span>{STAT_META[verdict.collapse].label} nie wytrzymała. Tron upada.</span></li>}
          </ul>
          {steer ? (
            <button type="button" className="btn primary" style={{ alignSelf: "flex-start" }} onClick={() => void send("next")}>{label}<Icon.next /></button>
          ) : (
            <p className="hint" style={{ textAlign: "left" }}>{steerHint(state)}</p>
          )}
        </section>
      </div>
    </Screen>
  );
}

export function Ending({ state, me, amHost, onMenu }: { state: SharedState; me: string; amHost: boolean; onMenu: () => void }) {
  const ending = state.ending!;
  const kept = ending.winner === "court";
  const traitors = ending.traitors;
  const current = traitors.find((record) => !record.caught) ?? null;
  const title = kept ? "Korona przetrwała" : "Korona upadła";
  const lead = kept
    ? current ? "Żaden filar nie runął. Rada wygrywa, choć jeden zdrajca dotrwał do końca." : "Żaden filar nie runął, a zdrajcy nie zostało przy stole. Rada wygrywa."
    : ending.winner === "traitor" ? "Zdrajca dopiął swego." : "Tron upadł, choć zdrajcy już nie było. Nikt nie wygrywa.";
  const result = (role: RoleId): boolean => {
    if (kept) return !(current && current.role === role);
    return ending.winner === "traitor" && current?.role === role;
  };
  return (
    <Screen bg={kept ? "assets/court/crown-kept.webp" : "assets/court/crown-fallen.webp"} veil={kept ? "side" : "blood"}>
      <div className="ending">
        <MenuButton onMenu={onMenu} />
        <div className="ending-main">
          <span className="kicker-line">{ending.collapse ? `Rok ${YEAR_NAMES[ending.year]}, ${state.mode === "diplomacy" ? "depesza" : "dekret"} ${ending.decree} · ${STAT_META[ending.collapse].label} ${state.stats[ending.collapse] <= 0 ? "spadła do 0" : "doszła do 100"}` : state.mode === "diplomacy" ? "Trzy lata, 36 depesz" : "Trzy lata, 36 dekretów"}</span>
          <h1>{title}</h1>
          <p>{lead}</p>
          <ol className="chronicle" aria-label="Kronika panowania">
            {state.chronicle.map((record) => (
              <li key={record.year}>
                <img src={OMEN_META[record.omen].art} alt="" />
                <div>
                  <small>Rok {YEAR_NAMES[record.year]} · {OMEN_META[record.omen].name}</small>
                  <span>{record.executed ? <>Sąd: stracono <b>{ROLE_ACC[record.executed]}</b>. {record.wasTraitor ? "Był Zdrajcą." : "Był lojalny."}</> : "Sąd: nikt nie zginął."}</span>
                </div>
              </li>
            ))}
          </ol>
          <div className="row" style={{ marginTop: 8 }}>
            {amHost ? <button type="button" className="btn primary" onClick={() => void send("restart")}>Nowe panowanie</button> : <p className="hint">Nowe panowanie zaczyna gospodarz.</p>}
          </div>
        </div>
        <aside className="ending-side" aria-label="Ujawnienie i wynik">
          {traitors.map((record) => (
            <section className="reveal-box" key={`${record.role}-${record.from}`}>
              <img className="portrait" src={ROLE_META[record.role].asset} alt="" />
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 4 }}>
                <span style={{ fontSize: 13, color: "#e3b5a8" }}>{record.caught ? "Zdrajca złapany" : kept ? "Zdrajca, który przeżył" : "Zdrajca wygrywa"}</span>
                <strong>{ROLE_META[record.role].name}</strong>
                <span className="muted">{seatLabel(state, record.role)} · od roku {YEAR_NAMES[record.from]}</span>
              </div>
              <img className="seal-stamp" src="assets/year/seal-traitor.webp" alt="" style={{ right: -14, top: -18, width: 80, height: 80, transform: "rotate(14deg)" }} />
            </section>
          ))}
          <ul className="pillars" aria-label="Filary na koniec">
            {STATS.map((stat) => (
              <li key={stat} className={ending.collapse === stat ? "fallen" : ""}>
                <img src={STAT_META[stat].icon} alt="" />
                <span className="name">{STAT_META[stat].label}</span>
                <span className="bar"><i style={{ width: `${state.stats[stat]}%`, background: STAT_META[stat].color }} /></span>
                <b>{state.stats[stat]}</b>
              </li>
            ))}
          </ul>
          <ul className="results" aria-label="Wyniki">
            {ROLES.map((role) => {
              const seat = state.seats[role];
              const won = result(role);
              return (
                <li key={role} className={won ? "win" : "lose"}>
                  <span><b>{seat?.kind === "human" ? (seat.id === me ? "Ty" : seat.name) : "Bot"}</b> · {ROLE_META[role].name}{current?.role === role ? " (zdrajca)" : ""}</span>
                  <span className={won ? "w" : "l"}>{won ? "Wygrana" : "Przegrana"}</span>
                </li>
              );
            })}
          </ul>
        </aside>
      </div>
    </Screen>
  );
}
