import { useState } from "react";
import type { Participant } from "@stellarr/sdk";
import { DIPLOMATIC_CHANNELS, channelMeta, choiceOf, dispatchArt, dispatchById, replyEffects, worstReply } from "@/game/embassy";
import { DECREES_PER_YEAR, type SharedState } from "@/game/rules";
import { ADVISORS, ROLE_META, STATS, STAT_META, type AdvisorRole, type RoleId, type StatId, type Stats } from "@/game/types";
import { ROMAN, signed } from "@/game/view";
import { send } from "@/stellarr/room";
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

const LETTER = ["I", "II", "III"];

export function Embassy({ state, me, role, traitor, host, participants, onMenu }: Props) {
  const dispatchId = state.dispatch ?? state.reply?.dispatchId;
  const dispatch = dispatchById(dispatchId!);
  const steer = me === host || role === "king";
  const letterOf = (choiceId: string | undefined) => (choiceId ? LETTER[dispatch.choices.findIndex((choice) => choice.id === choiceId)] ?? "…" : "…");
  const badge = (advisor: AdvisorRole) => {
    const pick = state.phase === "outcome" ? state.reply?.picks[advisor] : state.picks[advisor];
    return { text: letterOf(pick), on: !!pick };
  };
  const deltas = state.phase === "outcome" && state.reply ? totalDeltas(state.reply.visible, state.reply.hidden, state.reply.passive) : null;

  return (
    <Screen bg={dispatchArt(dispatch)}>
      <Header state={state} deltas={deltas} onMenu={onMenu} label="Depesza" />
      <div className="round embassy">
        <aside className="round-left embassy-left" aria-label="Kanały i Twoja rola">
          <Channels state={state} focus={dispatch.channelId} />
          {role && (
            <div className="embassy-role">
              <RoleCard role={role} traitor={traitor} size={{ w: 172, h: 246 }} mode="diplomacy" />
              {traitor && <TraitorNote stats={state.stats} decreesLeft={DECREES_PER_YEAR - state.decree} unit="dispatch" />}
            </div>
          )}
        </aside>
        <main className="round-center embassy-center">
          {state.phase === "council" ? (
            <Dispatch state={state} role={role} traitor={traitor} />
          ) : (
            <Sealed state={state} steer={steer} />
          )}
        </main>
        <Council state={state} me={me} participants={participants} badge={badge} />
      </div>
    </Screen>
  );
}

function totalDeltas(...parts: Partial<Stats>[]): Partial<Stats> {
  const total: Partial<Stats> = {};
  for (const stat of STATS) {
    const value = parts.reduce((sum, part) => sum + (part[stat] ?? 0), 0);
    if (value) total[stat] = value;
  }
  return total;
}

function Channels({ state, focus }: { state: SharedState; focus: string }) {
  return (
    <nav className="channels" aria-label="Kanały poselstw">
      {DIPLOMATIC_CHANNELS.map((channel) => {
        const open = state.cases[channel.id];
        const relation = state.relations[channel.id];
        const status = channel.id === focus
          ? "Na stole Rady"
          : open ? `Czeka: ${dispatchById(open).title}` : "Odpowiedziano, wkrótce nowa depesza";
        return (
          <div key={channel.id} className={"channel" + (channel.id === focus ? " on" : "")}>
            <img src={channel.emblem} alt="" />
            <div className="channel-body">
              <b>{channel.shortName}</b>
              <span>{status}</span>
              <span className="relation">
                <span className="track"><i style={{ width: `${relation}%` }} className={relation <= 20 ? "low" : relation >= 70 ? "high" : ""} /></span>
                <b>{relation}</b>
              </span>
            </div>
          </div>
        );
      })}
    </nav>
  );
}

const tone = (value: number) => (value > 0 ? "up" : value < 0 ? "down" : "flat");

/**
 * A reply's effects as a table: pillar, public number, and for the liaison a second column with
 * the hidden number, so the secret adds a column instead of a second list.
 */
function EffectRows({ effects, relation, hidden, hiddenRelation }: { effects: Partial<Stats>; relation: number; hidden?: Partial<Stats>; hiddenRelation?: number }) {
  const secret = !!hidden;
  const rows = STATS.filter((stat) => effects[stat] || hidden?.[stat]);
  const cell = (value: number | undefined, className: string) => <dd className={className + " " + tone(value ?? 0)}>{value ? signed(value) : "·"}</dd>;
  return (
    <dl className={"reply-facts" + (secret ? " with-secret" : "")}>
      {secret && (
        <div className="fact-head" aria-hidden="true">
          <span />
          <span>jawne</span>
          <span>ukryte</span>
        </div>
      )}
      {rows.map((stat) => (
        <div key={stat}>
          <dt><img src={STAT_META[stat].icon} alt="" />{STAT_META[stat].label}</dt>
          {cell(effects[stat], "open")}
          {secret && cell(hidden?.[stat], "hidden")}
        </div>
      ))}
      {(relation !== 0 || (secret && hiddenRelation)) && (
        <div>
          <dt>Relacja</dt>
          {cell(relation, "open")}
          {secret && cell(hiddenRelation, "hidden")}
        </div>
      )}
    </dl>
  );
}

function Dispatch({ state, role, traitor }: { state: SharedState; role: RoleId | null; traitor: boolean }) {
  const dispatch = dispatchById(state.dispatch!);
  const channel = channelMeta(dispatch.channelId);
  const liaison = role === dispatch.liaisonRole;
  const isKing = role === "king";
  const myPick = role && role !== "king" ? state.picks[role] : undefined;
  const complete = ADVISORS.every((advisor) => state.picks[advisor]);
  const [chosen, setChosen] = useState<string | null>(null);
  const worst = traitor ? worstReply(state.stats, state.relations[dispatch.channelId], dispatch, state.omen) : null;
  const picked = ADVISORS.filter((advisor) => state.picks[advisor]).length;

  let status: { text: string; tone: "wait" | "ok" };
  if (isKing) status = complete ? { text: "Rada zagłosowała. Wybierz odpowiedź i przyłóż pieczęć.", tone: "ok" } : { text: `Rada głosuje: ${picked} z 4`, tone: "wait" };
  else if (role) status = myPick ? { text: `Twój głos: ${choiceOf(dispatch, myPick).label}. Możesz go zmienić.`, tone: "ok" } : { text: "Kliknij odpowiedź, żeby zagłosować.", tone: "wait" };
  else status = { text: `Rada głosuje: ${picked} z 4`, tone: "wait" };

  const choose = (choiceId: string) => {
    if (isKing) { if (complete) setChosen(choiceId); }
    else if (role) void send("vote", { choice: choiceId });
  };

  return (
    <>
      <section className="case-panel" aria-labelledby="dispatch-title">
        <img className="case-art" src={dispatchArt(dispatch)} alt="" />
        <div className="case-body">
          <div className="envoy">
            <img src={channel.portrait} alt="" />
            <span><b>{channel.contact}</b><small>{channel.name}</small></span>
          </div>
          <h1 id="dispatch-title">
            {dispatch.title}
            <span className="bars" role="img" aria-label={`Napięcie ${dispatch.intensity} z 3`}>{[1, 2, 3].map((n) => <i key={n} className={n <= dispatch.intensity ? "on" : ""} />)}</span>
          </h1>
          <p className="envoy-says">„{dispatch.message}”</p>
          <p className="liaison-line">
            <img src={ROLE_META[dispatch.liaisonRole].asset} alt="" />
            {liaison ? "Jesteś łącznikiem: widzisz ukryte skutki." : `Łącznik: ${ROLE_META[dispatch.liaisonRole].name}. Zna ukryte skutki.`}
          </p>
        </div>
      </section>
      <p className={"status " + status.tone}>{status.tone === "ok" ? <Icon.check /> : <Icon.hourglass />}{status.text}</p>
      <div className="replies">
        {dispatch.choices.map((choice, index) => {
          const { visible, hidden, relation, hiddenRelation } = replyEffects(choice, state.omen);
          const voters = ADVISORS.filter((advisor) => state.picks[advisor] === choice.id);
          const selected = isKing ? chosen === choice.id : myPick === choice.id;
          return (
            <button
              key={choice.id}
              type="button"
              className={"reply" + (selected ? " chosen" : "")}
              aria-pressed={selected}
              disabled={!role || (isKing && !complete)}
              onClick={() => choose(choice.id)}
            >
              <span className="reply-top">
                <span className="reply-num">{LETTER[index]}</span>
                <span className="reply-votes" aria-label={voters.length ? `Głosy: ${voters.map((advisor) => ROLE_META[advisor].name).join(", ")}` : "Bez głosów"}>
                  {voters.map((advisor) => <img key={advisor} src={ROLE_META[advisor].asset} alt="" title={ROLE_META[advisor].name} />)}
                </span>
              </span>
              <strong>{choice.label}</strong>
              <span className="reply-desc">{choice.description}</span>
              {liaison ? (
                <>
                  <EffectRows effects={visible} relation={relation} hidden={hidden} hiddenRelation={hiddenRelation} />
                  <span className="intel-note">{choice.intel}</span>
                </>
              ) : (
                <EffectRows effects={visible} relation={relation} />
              )}
              {worst === choice.id && <span className="worse-line">Ta odpowiedź bardziej szkodzi.</span>}
            </button>
          );
        })}
      </div>
      {isKing && complete && (
        <div className="seal-row">
          <button type="button" className="btn danger" disabled={!chosen} onClick={() => chosen && void send("decree", { choice: chosen })}>
            <img src="assets/year/seal-decree.webp" alt="" style={{ width: 36, height: 36 }} />
            {chosen ? `Opieczętuj: ${choiceOf(dispatch, chosen).label}` : "Wybierz odpowiedź"}
          </button>
          <span className="hint">Jedna pieczęć. Ukryte skutki poznacie po jej przyłożeniu.</span>
        </div>
      )}
    </>
  );
}

function Sealed({ state, steer }: { state: SharedState; steer: boolean }) {
  const reply = state.reply!;
  const dispatch = dispatchById(reply.dispatchId);
  const choice = choiceOf(dispatch, reply.choiceId);
  const channel = channelMeta(reply.channel);
  const support = ADVISORS.filter((advisor) => reply.picks[advisor] === reply.choiceId).length;
  const label = reply.collapse ? "Zobacz koniec" : state.decree >= DECREES_PER_YEAR ? "Na sąd roku" : "Następna depesza";
  const total = (stat: StatId) => (reply.visible[stat] ?? 0) + (reply.hidden[stat] ?? 0) + (reply.passive[stat] ?? 0);
  const hiddenStats = STATS.filter((stat) => reply.hidden[stat]);
  return (
    <>
      <p className="status ok"><Icon.check />Pieczęć przyłożona. Rada była {support} do {4 - support} za.</p>
      <div className="stage">
        <div className="slot">
          <article className="decree-card sealed" aria-labelledby="sealed-title">
            <span className="corner tl" /><span className="corner tr" /><span className="corner bl" /><span className="corner br" />
            <div className="numeral"><span /><b>{ROMAN[state.decree]}</b><span /></div>
            <img className="herald" src={channel.portrait} alt="" style={{ objectPosition: "50% 20%" }} />
            <span className="kicker">Odpowiedź Korony · {channel.shortName}</span>
            <h1 id="sealed-title">{choice.label}</h1>
            <p className="consequence">{choice.response}</p>
            <ul className="deltas" aria-label="Zmiany filarów">
              {STATS.map((stat) => {
                const value = total(stat);
                return (
                  <li key={stat}>
                    <img src={STAT_META[stat].icon} alt="" />
                    <span>{STAT_META[stat].short}</span>
                    <b className={value > 0 ? "up" : value < 0 ? "down" : "flat"}>{value > 0 ? "▴" : value < 0 ? "▾" : ""}{Math.abs(value) || "0"}</b>
                  </li>
                );
              })}
            </ul>
            <p className="omen-line">
              Relacja z {channel.shortName}: {signed(reply.relation + reply.hiddenRelation)} (teraz {state.relations[reply.channel]})
              {hiddenStats.length > 0 && <> · ukryte: {hiddenStats.map((stat) => `${STAT_META[stat].label} ${signed(reply.hidden[stat]!)}`).join(", ")}</>}
            </p>
            {reply.collapse && <p className="collapse-line">{STAT_META[reply.collapse].label} {state.stats[reply.collapse] <= 0 ? "spadła do 0" : "doszła do 100"}. Tron upada.</p>}
          </article>
          <img className="seal-stamp" src="assets/year/seal-decree.webp" alt="" style={{ right: -54, top: 96, width: 124, height: 124, transform: "rotate(-14deg)" }} />
        </div>
      </div>
      {steer ? (
        <button type="button" className="btn primary" onClick={() => void send("next")}>{label}<Icon.next /></button>
      ) : (
        <p className="hint">{state.seats.king?.kind === "human" ? "Czekamy, aż Król ogłosi dalej." : "Za chwilę kolejna depesza."}</p>
      )}
    </>
  );
}
