import type { Participant } from "@stellarr/sdk";
import { artOf, eventById } from "@/game/catalog";
import { DECREES_PER_YEAR, type SharedState } from "@/game/rules";
import { ADVISORS, ROLE_META, STATS, STAT_META, type ChoiceSide, type RoleId } from "@/game/types";
import { ROMAN, shownDeltas, signed } from "@/game/view";
import { send } from "@/stellarr/room";
import { CaseCard } from "./CaseCard";
import { Council, Header, Icon, RoleCard, Screen, TraitorNote } from "./parts";

interface Props {
  state: SharedState;
  me: string;
  role: RoleId | null;
  traitor: boolean;
  host: string | null;
  participants: Participant[];
  onMenu: () => void;
}

export function Round({ state, me, role, traitor, host, participants, onMenu }: Props) {
  const event = eventById(state.event ?? state.outcome!.eventId);
  const steer = me === host || role === "king";
  const decreesLeft = DECREES_PER_YEAR - state.decree;

  const badge = (advisor: (typeof ADVISORS)[number]) => {
    const vote = state.phase === "outcome" ? state.outcome?.votes[advisor] : state.votes[advisor];
    return { text: vote ? (vote === "left" ? "A" : "B") : "…", on: !!vote };
  };

  return (
    <Screen bg={artOf(event)}>
      <Header state={state} deltas={shownDeltas(state)} onMenu={onMenu} />
      <div className="round">
        <aside className="round-left" aria-label="Twoja rola">
          {role ? (
            <>
              <RoleCard role={role} traitor={traitor} />
              <span className="hint">Najedź na kartę, żeby ją odwrócić</span>
              {traitor && <TraitorNote stats={state.stats} decreesLeft={decreesLeft} />}
            </>
          ) : (
            <div className="loyal-panel">
              <h1>Oglądasz</h1>
              <p className="muted">Wszystkie krzesła są zajęte. Widzisz to, co cała Rada: sprawę, głosy i dekrety.</p>
            </div>
          )}
        </aside>

        <main className="round-center">
          {state.phase === "council" ? <CouncilCenter state={state} role={role} traitor={traitor} /> : <Proclamation state={state} steer={steer} />}
        </main>

        <Council state={state} me={me} participants={participants} badge={badge} />
      </div>
    </Screen>
  );
}

function CouncilCenter({ state, role, traitor }: { state: SharedState; role: RoleId | null; traitor: boolean }) {
  const voted = ADVISORS.filter((advisor) => state.votes[advisor]).length;
  const complete = voted === ADVISORS.length;
  const myVote = role && role !== "king" ? state.votes[role] : undefined;

  let status: { text: string; tone: "wait" | "ok" };
  if (role === "king") status = complete ? { text: "Rada zagłosowała. Przechyl kartę, żeby wydać dekret.", tone: "ok" } : { text: `Rada głosuje: ${voted} z 4`, tone: "wait" };
  else if (role) status = myVote ? { text: `Twój głos: ${myVote === "left" ? "A" : "B"} · przechyl na drugą stronę, żeby zmienić`, tone: "ok" } : { text: "Twój głos jeszcze nie padł", tone: "wait" };
  else status = { text: `Rada głosuje: ${voted} z 4`, tone: "wait" };

  const canCommit = role === "king" ? complete : !!role;
  const commit = (side: ChoiceSide) => {
    if (role === "king") void send("decree", { side });
    else void send("vote", { side });
  };

  return (
    <>
      <p className={"status " + status.tone}>{status.tone === "ok" ? <Icon.check /> : <Icon.hourglass />}{status.text}</p>
      <CaseCard state={state} role={role} traitor={traitor} canCommit={canCommit} onCommit={commit} />
    </>
  );
}

function Proclamation({ state, steer }: { state: SharedState; steer: boolean }) {
  const outcome = state.outcome!;
  const event = eventById(outcome.eventId);
  const choice = event[outcome.side];
  const support = ADVISORS.filter((role) => outcome.votes[role] === outcome.side).length;
  const passive = Object.entries(outcome.passive).filter(([, value]) => value);
  const label = outcome.collapse ? "Zobacz koniec" : state.decree >= DECREES_PER_YEAR ? "Na sąd roku" : "Następny dekret";
  const kingIsBot = state.seats.king?.kind !== "human";

  return (
    <>
      <p className="status ok"><Icon.check />Dekret wydany. Rada była {support} do {4 - support} za.</p>
      <div className="stage">
        <div className="slot">
          <article className="decree-card" aria-labelledby="decree-title">
            <span className="corner tl" /><span className="corner tr" /><span className="corner bl" /><span className="corner br" />
            <div className="numeral"><span /><b>{ROMAN[state.decree]}</b><span /></div>
            <img className="herald" src="assets/court/decree-herald.webp" alt="Herold z trąbą ogłasza dekret" />
            <span className="kicker">Dekret Króla · {outcome.side === "left" ? "A" : "B"}</span>
            <h1 id="decree-title">{choice.label}</h1>
            <p className="consequence">{choice.consequence}</p>
            <ul className="deltas" aria-label="Zmiany filarów">
              {STATS.map((stat) => {
                const value = outcome.deltas[stat] + (outcome.passive[stat] ?? 0);
                return (
                  <li key={stat}>
                    <img src={STAT_META[stat].icon} alt="" />
                    <span>{STAT_META[stat].short}</span>
                    <b className={value > 0 ? "up" : value < 0 ? "down" : "flat"}>{value > 0 ? "▴" : value < 0 ? "▾" : ""}{Math.abs(value) || "0"}</b>
                  </li>
                );
              })}
            </ul>
            {passive.length > 0 && <p className="omen-line">W tym znak roku: {passive.map(([stat, value]) => `${STAT_META[stat as keyof typeof STAT_META].label} ${signed(value!)}`).join(", ")}</p>}
            {outcome.collapse && <p className="collapse-line">{STAT_META[outcome.collapse].label} {state.stats[outcome.collapse] <= 0 ? "spadła do 0" : "doszła do 100"}. Tron upada.</p>}
          </article>
          <img className="seal-stamp" src="assets/year/seal-decree.webp" alt="" style={{ right: -54, top: 96, width: 124, height: 124, transform: "rotate(-14deg)" }} />
        </div>
      </div>
      {steer ? (
        <button type="button" className="btn primary" onClick={() => void send("next")}>{label}<Icon.next /></button>
      ) : (
        <p className="hint">{kingIsBot ? "Za chwilę kolejna sprawa." : `Czekamy, aż ${ROLE_META.king.name} ogłosi dalej.`}</p>
      )}
    </>
  );
}
