/**
 * The rules of the council, as one pure function every client registers. The elected host runs
 * it on each command and commits the result; whoever becomes host after a disconnect carries on
 * from the shared state alone. Bots and deadlines advance through `nudge`, which any seated
 * client may send: it applies only what is due at the session clock.
 *
 * Shared state names events by id and never holds who the traitor is in the clear. The traitor
 * sits in `vault`, an obfuscated field only the rules decode (the SDK has no private place that
 * survives a player leaving), and each human advisor is told their own status through a
 * per-seat assignment.
 */

import {
  BASE_EVENTS,
  OMEN_EVENTS,
  OMEN_IDS,
  OMEN_META,
  applyDeltas,
  collapsedStat,
  dangerScore,
  destructiveSide,
  effectiveEffects,
  eventById,
  type OmenId,
} from "./catalog";
import {
  ADVISORS,
  CHANNELS,
  ROLE_META,
  ROLES,
  STATS,
  type AdvisorRole,
  type ChoiceSide,
  type DiplomaticChannelId,
  type RoleId,
  type StatId,
  type Stats,
} from "./types";
import {
  START_RELATIONS,
  channelMeta,
  choiceOf,
  dispatchById,
  dispatchesOf,
  focusOf,
  nextRelation,
  rankReplies,
  replyEffects,
  worstReply,
} from "./embassy";
import { EMBASSY_ENABLED } from "./features";

export const YEARS = 3;
export const DECREES_PER_YEAR = 12;
export const TRIAL_MS = 60_000;
export const MAJORITY = 3;
export const CAUGHT_BONUS = 10;
/** How often a traitor bot in Poselstwa backs the reply that truly hurts most. */
export const TRAITOR_WORST_REPLY = 0.45;
export const WRONG_PENALTY = 12;
/** At the start of each new year every pillar moves this far back toward the middle. */
export const NEW_YEAR_RELIEF = 6;
const MESSAGE_LIMIT = 40;

/** How long bots and absent players wait before acting, in milliseconds. */
export const TIMING = {
  botVote: [2200, 3800, 5400, 7000],
  botKing: 9000,
  absentAdvisor: 25_000,
  autoBegin: 5000,
  autoNext: 7000,
  autoVerdict: 9000,
  botAccuse: [3000, 5000, 7000, 9000, 11000],
};

export type Phase = "lobby" | "reveal" | "omen" | "council" | "outcome" | "trial" | "verdict" | "ended";
export type GameMode = "council" | "diplomacy";

export type SeatHolder = { kind: "human"; id: string; name: string; avatar: string | null } | { kind: "bot" };
export type Seats = Record<RoleId, SeatHolder | null>;
export type Accusation = AdvisorRole | "none";

export interface Message {
  id: string;
  role: RoleId | null;
  name: string;
  text: string;
  bot: boolean;
  system: boolean;
  at: number;
}

export interface Outcome {
  eventId: string;
  side: ChoiceSide;
  deltas: Stats;
  passive: Partial<Stats>;
  votes: Partial<Record<AdvisorRole, ChoiceSide>>;
  collapse: StatId | null;
}

/** What a bot advisor told the council about its own pillar (the traitor may lie). */
export interface Report {
  left: number;
  right: number;
}

/** One decree or sealed reply of the year, kept for the trial. `side` and `worse` are a decree side or a reply id. */
export interface LogEntry {
  kind?: "dispatch";
  eventId: string;
  side: string;
  worse: string;
  votes: Partial<Record<AdvisorRole, string>>;
  reports: Partial<Record<AdvisorRole, Report>>;
  /** Poselstwa: the advisor who saw the hidden layer. */
  liaison?: AdvisorRole;
}

/** A sealed reply in Poselstwa: what changed, the hidden part now revealed. */
export interface Reply {
  dispatchId: string;
  choiceId: string;
  channel: DiplomaticChannelId;
  visible: Partial<Stats>;
  hidden: Partial<Stats>;
  passive: Partial<Stats>;
  relation: number;
  hiddenRelation: number;
  picks: Partial<Record<AdvisorRole, string>>;
  collapse: StatId | null;
}

export interface Trial {
  votes: Partial<Record<RoleId, Accusation>>;
  deadline: number;
}

export interface Verdict {
  executed: AdvisorRole | null;
  wasTraitor: boolean;
  penalty: Partial<Stats>;
  votes: Partial<Record<RoleId, Accusation>>;
  collapse: StatId | null;
}

export interface YearRecord {
  year: number;
  omen: OmenId;
  executed: AdvisorRole | null;
  wasTraitor: boolean;
}

export interface TraitorRecord {
  role: AdvisorRole;
  from: number;
  caught: boolean;
}

export interface Ending {
  winner: "court" | "traitor" | "none";
  collapse: StatId | null;
  year: number;
  decree: number;
  traitors: TraitorRecord[];
}

export interface SharedState {
  [key: string]: unknown;
  v: 1;
  phase: Phase;
  mode: GameMode;
  seats: Seats;
  ready: string[];
  year: number;
  decree: number;
  omen: OmenId | null;
  stats: Stats;
  deck: string[];
  used: string[];
  event: string | null;
  /** The current case was forced in by the previous decree. */
  chained: boolean;
  forced: string | null;
  votes: Partial<Record<AdvisorRole, ChoiceSide>>;
  reports: Partial<Record<AdvisorRole, Report>>;
  outcome: Outcome | null;
  /** Poselstwa: relations with the three factions, 0–100. */
  relations: Record<DiplomaticChannelId, number>;
  /** Poselstwa: each channel's open case, or null once answered. */
  cases: Record<DiplomaticChannelId, string | null>;
  dispatchDecks: Record<DiplomaticChannelId, string[]>;
  /** Poselstwa: the case on the table this decree. */
  dispatch: string | null;
  picks: Partial<Record<AdvisorRole, string>>;
  reply: Reply | null;
  log: LogEntry[];
  trial: Trial | null;
  verdict: Verdict | null;
  chronicle: YearRecord[];
  ending: Ending | null;
  messages: Message[];
  phaseAt: number;
  seq: number;
  vault: string;
}

/** What the rules keep from everyone: who the traitor is and has been. */
export interface Secret {
  traitor: AdvisorRole | null;
  history: TraitorRecord[];
}

/** A seat's own private note. */
export interface Assignment {
  traitor: boolean;
}

const START_STATS: Stats = { faith: 50, people: 50, army: 50, treasury: 50, stability: 50 };

export const INITIAL_STATE: SharedState = {
  v: 1,
  phase: "lobby",
  mode: "council",
  seats: { king: null, treasury: null, army: null, faith: null, people: null },
  ready: [],
  year: 0,
  decree: 0,
  omen: null,
  stats: { ...START_STATS },
  deck: [],
  used: [],
  event: null,
  chained: false,
  forced: null,
  votes: {},
  reports: {},
  outcome: null,
  relations: { ...START_RELATIONS },
  cases: { pirates: null, free_ports: null, amber_guilds: null },
  dispatchDecks: { pirates: [], free_ports: [], amber_guilds: [] },
  dispatch: null,
  picks: {},
  reply: null,
  log: [],
  trial: null,
  verdict: null,
  chronicle: [],
  ending: null,
  messages: [],
  phaseAt: 0,
  seq: 0,
  vault: "",
};

export const COMMANDS = [
  "hello", "sit", "stand", "seat", "mode", "start", "ready", "begin", "vote", "decree",
  "next", "accuse", "say", "restart", "abort", "nudge",
] as const;

export interface RosterEntry {
  id: string;
  name: string;
  avatar: string | null;
  connected: boolean;
}

export interface DecideContext {
  from: string;
  now: number;
  host: string | null;
  roster: RosterEntry[];
  random: () => number;
}

export interface Decision {
  patch?: Partial<SharedState>;
  assignments?: Record<string, Assignment | null>;
  result?: unknown;
}

/** A command the rules refuse; the message goes back to whoever sent it. */
export class Refused extends Error {}

// ── The vault ──

const VAULT_KEY = "kings-reigns:trial-of-the-year";

function xor(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) out += String.fromCharCode(text.charCodeAt(i) ^ VAULT_KEY.charCodeAt(i % VAULT_KEY.length));
  return out;
}

export function sealSecret(secret: Secret): string {
  return btoa(xor(JSON.stringify(secret)));
}

export function openSecret(vault: string): Secret {
  if (!vault) return { traitor: null, history: [] };
  return JSON.parse(xor(atob(vault))) as Secret;
}

// ── Lookups ──

export function roleOf(state: SharedState, participant: string): RoleId | null {
  return ROLES.find((role) => {
    const seat = state.seats[role];
    return seat?.kind === "human" && seat.id === participant;
  }) ?? null;
}

/**
 * Whether a player is still in the room. The SDK keeps a dropped player for a 10 s grace before
 * removing them, so a blip of the connection never hands their turn to the rules.
 */
function present(ctx: DecideContext, id: string): boolean {
  return ctx.roster.some((entry) => entry.id === id);
}

/** A seat the rules play for: a bot, or a human who is not at the table. */
function playedByRules(state: SharedState, role: RoleId, ctx: DecideContext): boolean {
  const seat = state.seats[role];
  return !seat || seat.kind === "bot" || !present(ctx, seat.id);
}

function isBotSeat(state: SharedState, role: RoleId): boolean {
  return state.seats[role]?.kind !== "human";
}

/** Each human at the table who is still in the room gets their own note (the SDK refuses notes for anyone else). */
function humanAssignments(state: SharedState, secret: Secret, ctx: DecideContext): Record<string, Assignment> {
  const out: Record<string, Assignment> = {};
  for (const role of ROLES) {
    const seat = state.seats[role];
    if (seat?.kind === "human" && present(ctx, seat.id)) out[seat.id] = { traitor: secret.traitor === role };
  }
  return out;
}

/** May this participant steer the game flow (start, next)? The host and the King may. */
function canSteer(state: SharedState, ctx: DecideContext): boolean {
  return ctx.from === ctx.host || roleOf(state, ctx.from) === "king";
}

function pick<T>(items: readonly T[], random: () => number): T {
  return items[Math.floor(random() * items.length) % items.length];
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function message(state: SharedState, now: number, text: string, from: { role: RoleId | null; name: string; bot?: boolean; system?: boolean }): Pick<SharedState, "messages" | "seq"> {
  const seq = state.seq + 1;
  const entry: Message = { id: `m${seq}`, role: from.role, name: from.name, text, bot: !!from.bot, system: !!from.system, at: now };
  return { messages: [...state.messages, entry].slice(-MESSAGE_LIMIT), seq };
}

function seatName(state: SharedState, role: RoleId): string {
  const seat = state.seats[role];
  return seat?.kind === "human" ? seat.name : ROLE_META[role].name;
}

// ── Decks and omens ──

export function drawOmen(previous: readonly OmenId[], random: () => number): OmenId {
  const fresh = OMEN_IDS.filter((id) => !previous.includes(id));
  return pick(fresh.length ? fresh : OMEN_IDS, random);
}

/** Twelve cases for a year: four of the omen's own and eight from the pool, half of them leaning to the omen. */
export function buildYearDeck(omen: OmenId, used: readonly string[], random: () => number): string[] {
  const usedSet = new Set(used);
  const omenCases = shuffle(OMEN_EVENTS.filter((event) => event.omen === omen && !usedSet.has(event.id)), random).slice(0, 4);
  const categories = OMEN_META[omen].categories;
  const pool = BASE_EVENTS.filter((event) => !usedSet.has(event.id));
  const leaning = shuffle(pool.filter((event) => categories.includes(event.category)), random).slice(0, 4);
  const leaningIds = new Set(leaning.map((event) => event.id));
  const rest = shuffle(pool.filter((event) => !leaningIds.has(event.id)), random).slice(0, DECREES_PER_YEAR - omenCases.length - leaning.length);
  const cards = shuffle([...omenCases, ...leaning, ...rest], random);
  // Avoid two cases of the same category in a row where a swap can fix it.
  for (let i = 1; i < cards.length; i++) {
    if (cards[i].category !== cards[i - 1].category) continue;
    const j = cards.findIndex((card, k) => k > i && card.category !== cards[i - 1].category && (k + 1 >= cards.length || cards[k + 1].category !== cards[i].category));
    if (j > 0) [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards.map((card) => card.id);
}

/** What an omen does after each decree. Comet's jump is drawn here and committed with the decree. */
export function passiveOf(omen: OmenId | null, random: () => number): Partial<Stats> {
  switch (omen) {
    case "drought": return { people: -1 };
    case "war": return { treasury: -1 };
    case "plague": return { people: -1 };
    case "comet": return { stability: random() < 0.5 ? -2 : 2 };
    case "harvest": return { treasury: 1 };
    default: return {};
  }
}

// ── Bots ──

const SIGNED = (value: number) => (value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : "0");

const BOT_CLOSERS = [
  "Popieram {decree}.",
  "Głosuję za {decree}.",
  "Moje księgi wskazują {decree}.",
  "Wybrałbym {decree}. Reszta to modlitwa.",
];

function botLine(role: AdvisorRole, report: Report, side: ChoiceSide, random: () => number): string {
  const stat = ROLE_META[role].stat!;
  const decree = side === "left" ? "pierwszy dekret" : "drugi dekret";
  const closer = pick(BOT_CLOSERS, random).replace("{decree}", decree);
  return `${STAT_LABEL[stat]}: A ${SIGNED(report.left)}, B ${SIGNED(report.right)}. ${closer}`;
}

const STAT_LABEL: Record<StatId, string> = { faith: "Wiara", people: "Lud", army: "Armia", treasury: "Skarbiec", stability: "Stabilność" };

/** A bot advisor's own numbers as it tells them: the truth, or for the traitor often a swap. */
export function botReport(state: SharedState, role: AdvisorRole, traitor: boolean, side: ChoiceSide, random: () => number): Report {
  const event = eventById(state.event!);
  const stat = ROLE_META[role].stat!;
  const truth: Report = { left: effectiveEffects(event, "left", state.omen)[stat], right: effectiveEffects(event, "right", state.omen)[stat] };
  if (!traitor || random() < 0.4) return truth;
  // The lie makes the decree it backs look like the kinder one for its pillar.
  const backed = truth[side];
  const other = truth[side === "left" ? "right" : "left"];
  if (backed >= other) return truth;
  return side === "left" ? { left: other, right: backed } : { left: backed, right: other };
}

/** The King's estimate of each decree from what the council said; unknown pillars count as unchanged. */
export function kingChoice(state: SharedState, random: () => number): ChoiceSide {
  const reported = (side: ChoiceSide): Partial<Stats> => {
    const deltas: Partial<Stats> = {};
    for (const role of ADVISORS) {
      const report = state.reports[role];
      if (report) deltas[ROLE_META[role].stat!] = report[side];
    }
    return deltas;
  };
  const left = dangerScore(applyDeltas(state.stats, reported("left")));
  const right = dangerScore(applyDeltas(state.stats, reported("right")));
  if (left !== right) return left < right ? "left" : "right";
  const votesLeft = ADVISORS.filter((role) => state.votes[role] === "left").length;
  return votesLeft > 2 ? "left" : votesLeft < 2 ? "right" : random() < 0.5 ? "left" : "right";
}

/** A bot advisor's vote: the safer decree when loyal, the more dangerous one when not. */
export function botVote(state: SharedState, role: AdvisorRole, traitor: boolean, random: () => number): ChoiceSide {
  const event = eventById(state.event!);
  const worse = destructiveSide(state.stats, event, state.omen);
  const better: ChoiceSide = worse === "left" ? "right" : "left";
  if (traitor) {
    // A traitor blends in almost half the time, unless the worse decree would topple a pillar now.
    const fatal = collapsedStat(applyDeltas(state.stats, effectiveEffects(event, worse, state.omen))) !== null;
    return fatal || random() >= 0.45 ? worse : better;
  }
  // A loyal advisor knows only their own pillar and guards it; a close call is a coin toss.
  const stat = ROLE_META[role].stat!;
  const towardMiddle = (side: ChoiceSide) => Math.abs(state.stats[stat] + effectiveEffects(event, side, state.omen)[stat] - 50);
  const left = towardMiddle("left");
  const right = towardMiddle("right");
  if (Math.abs(left - right) <= 1) return random() < 0.5 ? better : worse;
  return left < right ? "left" : "right";
}

/**
 * How suspicious each advisor looks after this year: three points for every number a decree
 * proved false (the changes are public after each decree), one for backing the worse decree.
 */
export function suspicion(log: readonly LogEntry[], omen: OmenId | null): Record<AdvisorRole, number> {
  const score = { treasury: 0, army: 0, faith: 0, people: 0 } as Record<AdvisorRole, number>;
  for (const entry of log) {
    if (entry.kind === "dispatch") {
      // Once sealed, the hidden layer is public: a liaison who backed the worst reply looks bad.
      for (const role of ADVISORS) {
        if (entry.votes[role] === entry.worse) score[role] += entry.liaison === role ? 3 : 1;
      }
      continue;
    }
    const event = eventById(entry.eventId);
    const side = entry.side as ChoiceSide;
    for (const role of ADVISORS) {
      if (entry.votes[role] === entry.worse) score[role] += 1;
      const report = entry.reports?.[role];
      if (report && report[side] !== effectiveEffects(event, side, omen)[ROLE_META[role].stat!]) score[role] += 3;
    }
  }
  return score;
}

/** Times an advisor voted the way the King then decreed, this year. */
export function agreement(log: readonly LogEntry[], role: AdvisorRole): number {
  return log.filter((entry) => entry.votes[role] === entry.side).length;
}

export function botAccusation(state: SharedState, role: RoleId, traitor: AdvisorRole | null, random: () => number): Accusation {
  const score = suspicion(state.log, state.omen);
  const others = ADVISORS.filter((advisor) => advisor !== role);
  const ranked = [...others].sort((a, b) => score[b] - score[a]);
  if (traitor === role) {
    // The traitor points at whoever looks worst, or keeps quiet.
    return random() < 0.7 ? ranked[0] : "none";
  }
  const top = ranked[0];
  const runnerUp = ranked[1];
  if (score[top] >= 5 && score[top] - score[runnerUp] >= 3) return top;
  return random() < 0.15 ? top : "none";
}

// ── Phase changes ──

function drawCase(state: SharedState, ctx: DecideContext): Partial<SharedState> {
  if (state.mode === "diplomacy") return drawDispatch(state, ctx);
  let deck = [...state.deck];
  let id = state.forced && !state.used.includes(state.forced) ? state.forced : null;
  if (!id) {
    if (!deck.length) deck = buildYearDeck(state.omen ?? "drought", state.used, ctx.random);
    id = deck.shift()!;
  } else {
    deck = deck.filter((card) => card !== id);
  }
  return {
    phase: "council",
    decree: state.decree + 1,
    event: id,
    chained: id === state.forced,
    deck,
    used: [...state.used, id],
    forced: null,
    votes: {},
    reports: {},
    outcome: null,
    phaseAt: ctx.now,
  };
}

// ── Poselstwa ──

/** Take the next case from a channel's deck, reshuffling the channel once it has been through all of them. */
function takeDispatch(decks: Record<DiplomaticChannelId, string[]>, channel: DiplomaticChannelId, open: (string | null)[], random: () => number): string {
  if (!decks[channel].length) decks[channel] = shuffle(dispatchesOf(channel).filter((id) => !open.includes(id)), random);
  return decks[channel].shift()!;
}

export function openingCases(random: () => number): Pick<SharedState, "cases" | "dispatchDecks"> {
  const dispatchDecks = Object.fromEntries(CHANNELS.map((channel) => [channel, shuffle(dispatchesOf(channel), random)])) as Record<DiplomaticChannelId, string[]>;
  const cases = {} as Record<DiplomaticChannelId, string | null>;
  for (const channel of CHANNELS) cases[channel] = dispatchDecks[channel].shift()!;
  return { cases, dispatchDecks };
}

function drawDispatch(state: SharedState, ctx: DecideContext): Partial<SharedState> {
  const decree = state.decree + 1;
  const focus = focusOf(decree);
  const cases = { ...state.cases };
  const dispatchDecks = Object.fromEntries(CHANNELS.map((channel) => [channel, [...state.dispatchDecks[channel]]])) as Record<DiplomaticChannelId, string[]>;
  if (!cases[focus]) cases[focus] = takeDispatch(dispatchDecks, focus, Object.values(cases), ctx.random);
  return {
    phase: "council",
    decree,
    cases,
    dispatchDecks,
    dispatch: cases[focus],
    picks: {},
    reply: null,
    event: null,
    outcome: null,
    phaseAt: ctx.now,
  };
}

function applyReply(state: SharedState, choiceId: string, ctx: DecideContext): Partial<SharedState> {
  const dispatch = dispatchById(state.dispatch!);
  const choice = choiceOf(dispatch, choiceId);
  const channel = dispatch.channelId;
  const { visible, hidden, relation, hiddenRelation } = replyEffects(choice, state.omen);
  const passive = passiveOf(state.omen, ctx.random);
  const stats = applyDeltas(state.stats, visible, hidden, passive);
  const collapse = collapsedStat(stats);
  const reply: Reply = { dispatchId: dispatch.id, choiceId, channel, visible, hidden, passive, relation, hiddenRelation, picks: { ...state.picks }, collapse };
  const entry: LogEntry = {
    kind: "dispatch",
    eventId: dispatch.id,
    side: choiceId,
    worse: worstReply(state.stats, state.relations[channel], dispatch, state.omen),
    votes: { ...state.picks },
    reports: {},
    liaison: dispatch.liaisonRole,
  };
  const contact = channelMeta(channel).contact;
  const sealed = message(state, ctx.now, `Pieczęć Korony: „${choice.label}”.`, { role: "king", name: seatName(state, "king"), system: true });
  const answered = message({ ...state, ...sealed }, ctx.now, choice.response, { role: null, name: contact, system: true });
  return {
    phase: "outcome",
    stats,
    reply,
    relations: { ...state.relations, [channel]: nextRelation(state.relations[channel], choice) },
    cases: { ...state.cases, [channel]: null },
    log: [...state.log, entry],
    phaseAt: ctx.now,
    ...answered,
  };
}

const PICK_LINES = {
  liaisonLoyal: ["Tajny raport mówi jasno: „{reply}” niesie najmniej ryzyka.", "Widziałem, co kryje się pod spodem. Wybierzcie „{reply}”.", "Z raportu wynika, że „{reply}” to najmniejsze zło."],
  liaisonTraitor: ["Tajny raport mówi jasno: „{reply}” to najbezpieczniejsza droga.", "Widziałem, co kryje się pod spodem. Wybierzcie „{reply}”, nic tam nie ma."],
  other: ["Popieram „{reply}”.", "Głosuję za „{reply}”.", "Na oko „{reply}”. Niech łącznik powie, jeśli się mylę."],
};

/** A bot's pick: the liaison weighs the hidden layer, the others only what everyone sees; a traitor reaches for harm. */
export function botPick(state: SharedState, role: AdvisorRole, traitor: boolean, random: () => number): string {
  const dispatch = dispatchById(state.dispatch!);
  const relation = state.relations[dispatch.channelId];
  const liaison = dispatch.liaisonRole === role;
  if (traitor) {
    // Like the council's traitor: masks itself often, but never passes up a reply that topples the throne.
    const ranked = rankReplies(state.stats, relation, dispatch, state.omen, true);
    const worst = ranked.at(-1)!;
    const { visible, hidden } = replyEffects(worst, state.omen);
    const fatal = collapsedStat(applyDeltas(state.stats, visible, hidden)) !== null;
    return fatal || random() < TRAITOR_WORST_REPLY ? worst.id : ranked[1].id;
  }
  const ranked = rankReplies(state.stats, relation, dispatch, state.omen, liaison);
  return liaison || random() < 0.75 ? ranked[0].id : ranked[1].id;
}

/** The bot King follows the council's majority; on a tie, the liaison. */
export function kingPick(state: SharedState): string {
  const dispatch = dispatchById(state.dispatch!);
  const counts = new Map<string, number>();
  for (const role of ADVISORS) {
    const choice = state.picks[role];
    if (choice) counts.set(choice, (counts.get(choice) ?? 0) + 1);
  }
  const best = Math.max(...counts.values());
  const leaders = [...counts.entries()].filter(([, count]) => count === best).map(([choice]) => choice);
  const liaisonPick = state.picks[dispatch.liaisonRole];
  return leaders.length === 1 ? leaders[0] : liaisonPick && leaders.includes(liaisonPick) ? liaisonPick : leaders[0];
}

function pickLine(state: SharedState, role: AdvisorRole, traitor: boolean, choiceId: string, random: () => number): string {
  const dispatch = dispatchById(state.dispatch!);
  const label = choiceOf(dispatch, choiceId).label;
  const lines = dispatch.liaisonRole === role ? (traitor ? PICK_LINES.liaisonTraitor : PICK_LINES.liaisonLoyal) : PICK_LINES.other;
  return pick(lines, random).replace("{reply}", label);
}

function applyDecree(state: SharedState, side: ChoiceSide, ctx: DecideContext): Partial<SharedState> {
  const event = eventById(state.event!);
  const deltas = effectiveEffects(event, side, state.omen);
  const passive = passiveOf(state.omen, ctx.random);
  const stats = applyDeltas(state.stats, deltas, passive);
  const collapse = collapsedStat(stats);
  const trigger = event[side].triggers;
  const outcome: Outcome = { eventId: event.id, side, deltas, passive, votes: { ...state.votes }, collapse };
  const entry: LogEntry = { eventId: event.id, side, worse: destructiveSide(state.stats, event, state.omen), votes: { ...state.votes }, reports: { ...state.reports } };
  return {
    phase: "outcome",
    stats,
    outcome,
    log: [...state.log, entry],
    forced: trigger && !state.used.includes(trigger) ? trigger : null,
    phaseAt: ctx.now,
    ...message(state, ctx.now, `Dekret Króla: „${event[side].label}”.`, { role: "king", name: seatName(state, "king"), system: true }),
  };
}

function finish(state: SharedState, secret: Secret, collapse: StatId | null): Decision {
  const traitors = secret.history.map((record) => ({ ...record }));
  const winner: Ending["winner"] = collapse ? (secret.traitor ? "traitor" : "none") : "court";
  return {
    patch: {
      phase: "ended",
      ending: { winner, collapse, year: state.year, decree: state.decree, traitors },
    },
  };
}

function openTrial(ctx: DecideContext): Partial<SharedState> {
  return { phase: "trial", trial: { votes: {}, deadline: ctx.now + TRIAL_MS }, phaseAt: ctx.now };
}

function resolveTrial(state: SharedState, secret: Secret, ctx: DecideContext): Decision {
  const votes = state.trial?.votes ?? {};
  const counts = new Map<AdvisorRole, number>();
  for (const target of Object.values(votes)) {
    if (target && target !== "none") counts.set(target, (counts.get(target) ?? 0) + 1);
  }
  const executed = [...counts.entries()].find(([, count]) => count >= MAJORITY)?.[0] ?? null;
  const wasTraitor = executed !== null && executed === secret.traitor;
  let penalty: Partial<Stats> = {};
  let nextSecret = secret;
  if (wasTraitor) {
    penalty = { stability: CAUGHT_BONUS };
    nextSecret = {
      traitor: null,
      history: secret.history.map((record) => (record.role === executed && !record.caught ? { ...record, caught: true } : record)),
    };
  } else if (executed) {
    penalty = { [ROLE_META[executed].stat!]: -WRONG_PENALTY } as Partial<Stats>;
  }
  const stats = applyDeltas(state.stats, penalty);
  const collapse = collapsedStat(stats);
  const verdict: Verdict = { executed, wasTraitor, penalty, votes: { ...votes }, collapse };
  const record: YearRecord = { year: state.year, omen: state.omen!, executed, wasTraitor };
  const text = executed
    ? `Rada straciła ${ROLE_META[executed].name.toLowerCase()}a. ${wasTraitor ? "Był Zdrajcą." : "Był lojalny."}`
    : "Rada nikogo nie wskazała.";
  const patch: Partial<SharedState> = {
    phase: "verdict",
    stats,
    verdict,
    chronicle: [...state.chronicle, record],
    vault: sealSecret(nextSecret),
    phaseAt: ctx.now,
    ...message(state, ctx.now, text, { role: null, name: "Herold", system: true }),
  };
  const assignments = wasTraitor ? humanAssignments({ ...state, ...patch } as SharedState, nextSecret, ctx) : undefined;
  return { patch, assignments };
}

function newYear(state: SharedState, secret: Secret, ctx: DecideContext): Decision {
  const year = state.year + 1;
  let nextSecret = secret;
  if (!secret.traitor && ctx.random() < 0.5) {
    const role = pick(ADVISORS, ctx.random);
    nextSecret = { traitor: role, history: [...secret.history, { role, from: year, caught: false }] };
  }
  const omen = drawOmen(state.chronicle.map((record) => record.omen), ctx.random);
  const stats = { ...state.stats };
  for (const stat of STATS) {
    const gap = 50 - stats[stat];
    stats[stat] += Math.sign(gap) * Math.min(Math.abs(gap), NEW_YEAR_RELIEF);
  }
  const patch: Partial<SharedState> = {
    phase: "omen",
    year,
    stats,
    decree: 0,
    omen,
    deck: state.mode === "council" ? buildYearDeck(omen, state.used, ctx.random) : [],
    event: null,
    votes: {},
    outcome: null,
    dispatch: null,
    picks: {},
    reply: null,
    log: [],
    trial: null,
    verdict: null,
    vault: sealSecret(nextSecret),
    phaseAt: ctx.now,
  };
  return { patch, assignments: humanAssignments({ ...state, ...patch } as SharedState, nextSecret, ctx) };
}

function next(state: SharedState, ctx: DecideContext): Decision {
  const secret = openSecret(state.vault);
  if (state.phase === "outcome") {
    const collapse = state.outcome?.collapse ?? state.reply?.collapse ?? null;
    if (collapse) return finish(state, secret, collapse);
    if (state.decree >= DECREES_PER_YEAR) return { patch: openTrial(ctx) };
    return { patch: drawCase(state, ctx) };
  }
  if (state.phase === "verdict") {
    if (state.verdict?.collapse) return finish(state, secret, state.verdict.collapse);
    if (state.year >= YEARS) return finish(state, secret, null);
    return newYear(state, secret, ctx);
  }
  throw new Refused("Nie ma czego ogłaszać.");
}

function allAccused(state: SharedState): boolean {
  return ROLES.every((role) => state.trial?.votes[role] !== undefined);
}

/** Everything bots and the clock have to do right now, one step at a time. */
function due(state: SharedState, ctx: DecideContext): Decision | null {
  const secret = openSecret(state.vault);
  const elapsed = ctx.now - state.phaseAt;
  switch (state.phase) {
    case "reveal": {
      const waiting = ROLES.some((role) => {
        const seat = state.seats[role];
        return seat?.kind === "human" && present(ctx, seat.id) && !state.ready.includes(seat.id);
      });
      return waiting ? null : { patch: { phase: "omen", phaseAt: ctx.now } };
    }
    case "omen":
      return playedByRules(state, "king", ctx) && elapsed >= TIMING.autoBegin ? { patch: drawCase(state, ctx) } : null;
    case "council": {
      if (state.mode === "diplomacy") {
        for (const [index, role] of ADVISORS.entries()) {
          if (state.picks[role]) continue;
          const bot = isBotSeat(state, role);
          const wait = bot ? TIMING.botVote[index] : TIMING.absentAdvisor;
          if (!playedByRules(state, role, ctx) || elapsed < wait) continue;
          const traitor = secret.traitor === role;
          const choice = botPick(state, role, traitor, ctx.random);
          return { patch: { picks: { ...state.picks, [role]: choice }, ...message(state, ctx.now, pickLine(state, role, traitor, choice, ctx.random), { role, name: ROLE_META[role].name, bot: true }) } };
        }
        if (ADVISORS.every((role) => state.picks[role]) && playedByRules(state, "king", ctx) && elapsed >= TIMING.botKing) {
          return { patch: applyReply(state, kingPick(state), ctx) };
        }
        return null;
      }
      for (const [index, role] of ADVISORS.entries()) {
        if (state.votes[role]) continue;
        const bot = isBotSeat(state, role);
        const wait = bot ? TIMING.botVote[index] : TIMING.absentAdvisor;
        if (!playedByRules(state, role, ctx) || elapsed < wait) continue;
        const traitor = secret.traitor === role;
        const side = botVote(state, role, traitor, ctx.random);
        const patch: Partial<SharedState> = { votes: { ...state.votes, [role]: side } };
        {
          const report = botReport(state, role, traitor, side, ctx.random);
          patch.reports = { ...state.reports, [role]: report };
          Object.assign(patch, message(state, ctx.now, botLine(role, report, side, ctx.random), { role, name: ROLE_META[role].name, bot: true }));
        }
        return { patch };
      }
      const complete = ADVISORS.every((role) => state.votes[role]);
      if (complete && playedByRules(state, "king", ctx) && elapsed >= TIMING.botKing) {
        return { patch: applyDecree(state, kingChoice(state, ctx.random), ctx) };
      }
      return null;
    }
    case "outcome":
      return playedByRules(state, "king", ctx) && elapsed >= TIMING.autoNext ? next(state, ctx) : null;
    case "trial": {
      if (state.trial && (allAccused(state) || ctx.now >= state.trial.deadline)) return resolveTrial(state, secret, ctx);
      for (const [index, role] of ROLES.entries()) {
        if (!state.trial || state.trial.votes[role] !== undefined) continue;
        if (!isBotSeat(state, role) || elapsed < TIMING.botAccuse[index]) continue;
        const target = botAccusation(state, role, secret.traitor, ctx.random);
        return { patch: { trial: { ...state.trial, votes: { ...state.trial.votes, [role]: target } } } };
      }
      return null;
    }
    case "verdict":
      return playedByRules(state, "king", ctx) && elapsed >= TIMING.autoVerdict ? next(state, ctx) : null;
    default:
      return null;
  }
}

// ── Commands ──

type Handler = (data: Record<string, unknown>, state: SharedState, ctx: DecideContext) => Decision;

function asRole(value: unknown): RoleId {
  if (!ROLES.includes(value as RoleId)) throw new Refused("Nie ma takiego krzesła.");
  return value as RoleId;
}

function asSide(value: unknown): ChoiceSide {
  if (value !== "left" && value !== "right") throw new Refused("Nie ma takiego dekretu.");
  return value;
}

function asReply(state: SharedState, value: unknown): string {
  if (!state.dispatch) throw new Refused("Nie ma depeszy.");
  const dispatch = dispatchById(state.dispatch);
  if (!dispatch.choices.some((choice) => choice.id === value)) throw new Refused("Nie ma takiej odpowiedzi.");
  return value as string;
}

function requirePhase(state: SharedState, ...phases: Phase[]): void {
  if (!phases.includes(state.phase)) throw new Refused("To nie ten moment gry.");
}

function person(ctx: DecideContext): RosterEntry {
  return ctx.roster.find((entry) => entry.id === ctx.from) ?? { id: ctx.from, name: "Gość", avatar: null, connected: true };
}

const HANDLERS: Record<(typeof COMMANDS)[number], Handler> = {
  /** A player (re)joining asks for their own note. */
  hello(_data, state, ctx) {
    const role = roleOf(state, ctx.from);
    if (!role || state.phase === "lobby") return {};
    const secret = openSecret(state.vault);
    return { assignments: { [ctx.from]: { traitor: secret.traitor === role } } };
  },

  sit(data, state, ctx) {
    requirePhase(state, "lobby");
    const role = asRole(data.role);
    const seat = state.seats[role];
    if (seat?.kind === "human" && seat.id !== ctx.from) throw new Refused("To krzesło jest zajęte.");
    const me = person(ctx);
    const seats = { ...state.seats };
    for (const other of ROLES) {
      const holder = seats[other];
      if (holder?.kind === "human" && holder.id === ctx.from) seats[other] = null;
    }
    seats[role] = { kind: "human", id: me.id, name: me.name, avatar: me.avatar };
    return { patch: { seats } };
  },

  stand(_data, state, ctx) {
    requirePhase(state, "lobby");
    const role = roleOf(state, ctx.from);
    if (!role) return {};
    return { patch: { seats: { ...state.seats, [role]: null } } };
  },

  /** The host sets an empty chair to a bot or opens it again. */
  seat(data, state, ctx) {
    requirePhase(state, "lobby");
    if (ctx.from !== ctx.host) throw new Refused("Krzesła ustawia gospodarz.");
    const role = asRole(data.role);
    const seat = state.seats[role];
    if (seat?.kind === "human" && present(ctx, seat.id)) throw new Refused("Na tym krześle ktoś siedzi.");
    return { patch: { seats: { ...state.seats, [role]: data.bot ? { kind: "bot" } : null } } };
  },

  mode(data, state, ctx) {
    requirePhase(state, "lobby");
    if (ctx.from !== ctx.host) throw new Refused("Tryb wybiera gospodarz.");
    if (data.mode !== "council" && data.mode !== "diplomacy") throw new Refused("Nie ma takiego trybu.");
    if (data.mode === "diplomacy" && !EMBASSY_ENABLED) throw new Refused("Poselstwa są na razie zamknięte.");
    return { patch: { mode: data.mode } };
  },

  start(_data, state, ctx) {
    requirePhase(state, "lobby");
    if (ctx.from !== ctx.host) throw new Refused("Panowanie rozpoczyna gospodarz.");
    if (!ROLES.some((role) => { const seat = state.seats[role]; return seat?.kind === "human" && present(ctx, seat.id); })) throw new Refused("Usiądź na którymś krześle.");
    const seats = { ...state.seats };
    for (const role of ROLES) {
      const seat = seats[role];
      // Empty chairs, and chairs of people who already left the room, go to bots.
      if (!seat || (seat.kind === "human" && !present(ctx, seat.id))) seats[role] = { kind: "bot" };
    }
    const traitor = pick(ADVISORS, ctx.random);
    const secret: Secret = { traitor, history: [{ role: traitor, from: 1, caught: false }] };
    const omen = drawOmen([], ctx.random);
    // A lobby left in Poselstwa from before they closed starts an ordinary council.
    const mode = EMBASSY_ENABLED ? state.mode : "council";
    const patch: Partial<SharedState> = {
      ...INITIAL_STATE,
      mode,
      seats,
      phase: "reveal",
      ready: [],
      year: 1,
      decree: 0,
      omen,
      stats: { ...START_STATS },
      deck: mode === "council" ? buildYearDeck(omen, [], ctx.random) : [],
      ...(mode === "diplomacy" ? openingCases(ctx.random) : {}),
      relations: { ...START_RELATIONS },
      vault: sealSecret(secret),
      phaseAt: ctx.now,
      messages: [],
      seq: 0,
    };
    Object.assign(patch, message({ ...state, messages: [], seq: 0 }, ctx.now, "Rada zebrana. Jeden z doradców nosi znak zdrajcy.", { role: null, name: "Herold", system: true }));
    return { patch, assignments: humanAssignments({ ...state, ...patch } as SharedState, secret, ctx) };
  },

  ready(data, state, ctx) {
    requirePhase(state, "reveal");
    if (data.force) {
      if (!canSteer(state, ctx)) throw new Refused("Tylko gospodarz może przyspieszyć.");
      return { patch: { phase: "omen", phaseAt: ctx.now } };
    }
    if (!roleOf(state, ctx.from)) throw new Refused("Nie siedzisz przy stole.");
    const ready = state.ready.includes(ctx.from) ? state.ready : [...state.ready, ctx.from];
    const after = { ...state, ready };
    return { patch: { ready, ...(due(after, ctx)?.patch ?? {}) } };
  },

  begin(_data, state, ctx) {
    requirePhase(state, "omen");
    const role = roleOf(state, ctx.from);
    if (!canSteer(state, ctx) && !(role && playedByRules(state, "king", ctx))) throw new Refused("Rok rozpoczyna Król.");
    return { patch: drawCase(state, ctx) };
  },

  vote(data, state, ctx) {
    requirePhase(state, "council");
    const role = roleOf(state, ctx.from);
    if (!role || role === "king") throw new Refused("Głosują doradcy.");
    if (state.mode === "diplomacy") {
      const choice = asReply(state, data.choice);
      return { patch: { picks: { ...state.picks, [role]: choice } } };
    }
    const side = asSide(data.side);
    return { patch: { votes: { ...state.votes, [role]: side } } };
  },

  decree(data, state, ctx) {
    requirePhase(state, "council");
    if (roleOf(state, ctx.from) !== "king") throw new Refused("Dekret wydaje Król.");
    if (state.mode === "diplomacy") {
      if (!ADVISORS.every((role) => state.picks[role])) throw new Refused("Rada jeszcze głosuje.");
      return { patch: applyReply(state, asReply(state, data.choice), ctx) };
    }
    if (!ADVISORS.every((role) => state.votes[role])) throw new Refused("Rada jeszcze głosuje.");
    return { patch: applyDecree(state, asSide(data.side), ctx) };
  },

  next(_data, state, ctx) {
    requirePhase(state, "outcome", "verdict");
    const role = roleOf(state, ctx.from);
    if (!canSteer(state, ctx) && !(role && playedByRules(state, "king", ctx))) throw new Refused("Dalej prowadzi Król.");
    return next(state, ctx);
  },

  accuse(data, state, ctx) {
    requirePhase(state, "trial");
    const role = roleOf(state, ctx.from);
    if (!role) throw new Refused("Na sądzie głosują osoby przy stole.");
    const raw = data.target === "none" ? "none" : asRole(data.target);
    if (raw === "king") throw new Refused("Króla się nie sądzi.");
    const target: Accusation = raw;
    if (target === role) throw new Refused("Nie możesz oskarżyć siebie.");
    const trial = { ...state.trial!, votes: { ...state.trial!.votes, [role]: target } };
    const after = { ...state, trial };
    if (allAccused(after)) return resolveTrial(after, openSecret(state.vault), ctx);
    return { patch: { trial } };
  },

  say(data, state, ctx) {
    const text = String(data.text ?? "").trim().slice(0, 240);
    if (!text) throw new Refused("Pusta wiadomość.");
    const role = roleOf(state, ctx.from);
    return { patch: message(state, ctx.now, text, { role, name: person(ctx).name }) };
  },

  restart(_data, state, ctx) {
    if (ctx.from !== ctx.host) throw new Refused("Nowe panowanie zaczyna gospodarz.");
    requirePhase(state, "ended");
    return { patch: { ...INITIAL_STATE, mode: state.mode, seats: state.seats } };
  },

  /** The host ends a reign early; everyone goes back to the council chamber with their chairs. */
  abort(_data, state, ctx) {
    if (ctx.from !== ctx.host) throw new Refused("Panowanie kończy gospodarz.");
    if (state.phase === "lobby") return {};
    return { patch: { ...INITIAL_STATE, mode: state.mode, seats: state.seats } };
  },

  nudge(_data, state, ctx) {
    return due(state, ctx) ?? {};
  },
};

/** The verdict on one command; throws `Refused` for a command the rules turn down. */
export function decide(kind: string, data: unknown, state: SharedState, ctx: DecideContext): Decision {
  const handler = HANDLERS[kind as (typeof COMMANDS)[number]];
  if (!handler) throw new Refused("Nieznane polecenie.");
  const payload = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  return handler(payload, state, ctx);
}

/** Whether anything is waiting on bots or the clock, so clients know to nudge. */
export function needsNudge(state: SharedState): boolean {
  return state.phase !== "lobby" && state.phase !== "ended";
}

/**
 * An id for a nudge, keyed on the state it acts on: the host submits a nudge only when its own
 * run of the rules shows something is due, and the same moment is never logged twice.
 */
export function nudgeKey(state: SharedState): string {
  const trialVotes = state.trial ? Object.keys(state.trial.votes).length : 0;
  return `nudge-${state.phase}-${state.year}-${state.decree}-${state.phaseAt}-${Object.keys(state.votes).length}-${Object.keys(state.picks ?? {}).length}-${trialVotes}-${state.ready.length}`;
}

export { STATS };
