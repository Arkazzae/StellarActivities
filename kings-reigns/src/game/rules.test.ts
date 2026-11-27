import { describe, expect, it, vi } from "vitest";
import {
  CAUGHT_BONUS,
  DECREES_PER_YEAR,
  INITIAL_STATE,
  Refused,
  TIMING,
  TRIAL_MS,
  WRONG_PENALTY,
  buildYearDeck,
  decide,
  openSecret,
  sealSecret,
  type DecideContext,
  type Decision,
  type RosterEntry,
  type SharedState,
} from "./rules";
import { eventById } from "./catalog";
import { ADVISORS, ROLES, type AdvisorRole } from "./types";

// Poselstwa are closed in the game (features.ts) but their rules stay tested here.
vi.mock("./features", () => ({ EMBASSY_ENABLED: true }));

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ola: RosterEntry = { id: "ola", name: "Ola", avatar: null, connected: true };
const kuba: RosterEntry = { id: "kuba", name: "Kuba", avatar: null, connected: true };

class Table {
  state: SharedState = structuredClone(INITIAL_STATE);
  assignments: Record<string, unknown> = {};
  now = 1_000_000;
  random: () => number;
  constructor(public roster: RosterEntry[] = [ola, kuba], seed = 7, public host = "ola") {
    this.random = seeded(seed);
  }
  ctx(from: string): DecideContext {
    return { from, now: this.now, host: this.host, roster: this.roster, random: this.random };
  }
  apply(decision: Decision): Decision {
    if (decision.patch) this.state = { ...this.state, ...structuredClone(decision.patch) };
    if (decision.assignments) {
      for (const [id, value] of Object.entries(decision.assignments)) {
        // Like the SDK: a note for someone who is not in the room refuses the whole decision.
        if (!this.roster.some((entry) => entry.id === id)) throw new Error(`Assignment for ${id}, who is not in the room`);
        if (value === null) delete this.assignments[id];
        else this.assignments[id] = value;
      }
    }
    return decision;
  }
  send(from: string, kind: string, data: Record<string, unknown> = {}): Decision {
    return this.apply(decide(kind, data, this.state, this.ctx(from)));
  }
  /** Let time pass in steps, nudging like the clients do. */
  wait(ms: number, step = 500): void {
    for (let t = 0; t < ms; t += step) {
      this.now += step;
      this.send("ola", "nudge");
    }
  }
  secret() {
    return openSecret(this.state.vault);
  }
}

function startedTable(seed = 7): Table {
  const table = new Table([ola, kuba], seed);
  table.send("ola", "sit", { role: "king" });
  table.send("kuba", "sit", { role: "treasury" });
  table.send("ola", "start");
  return table;
}

describe("lobby and start", () => {
  it("fills empty chairs with bots and hides the traitor", () => {
    const table = startedTable();
    expect(table.state.phase).toBe("reveal");
    for (const role of ROLES) expect(table.state.seats[role]).not.toBeNull();
    expect(table.state.seats.army).toEqual({ kind: "bot" });
    const secret = table.secret();
    expect(ADVISORS).toContain(secret.traitor);
    expect(table.assignments.kuba).toEqual({ traitor: secret.traitor === "treasury" });
    expect(table.assignments.ola).toEqual({ traitor: false });
    expect(JSON.stringify(table.state)).not.toMatch(/"traitor"/);
    expect(table.state.deck).toHaveLength(DECREES_PER_YEAR);
  });

  it("only lets the host start and refuses taken chairs", () => {
    const table = new Table();
    table.send("ola", "sit", { role: "king" });
    expect(() => table.send("kuba", "sit", { role: "king" })).toThrow(Refused);
    table.send("kuba", "sit", { role: "army" });
    expect(() => table.send("kuba", "start")).toThrow(Refused);
  });

  it("re-sends a returning player's own note", () => {
    const table = startedTable();
    table.assignments = {};
    table.send("kuba", "hello");
    expect(table.assignments.kuba).toBeDefined();
  });
});

describe("a year of decrees", () => {
  it("moves from reveal to the omen once everyone at the table is ready", () => {
    const table = startedTable();
    table.send("ola", "ready");
    expect(table.state.phase).toBe("reveal");
    table.send("kuba", "ready");
    expect(table.state.phase).toBe("omen");
    table.send("ola", "begin");
    expect(table.state.phase).toBe("council");
    expect(table.state.decree).toBe(1);
    expect(table.state.event).toBeTruthy();
  });

  it("has bots vote in turn and waits for the human King", () => {
    const table = startedTable();
    table.send("ola", "ready");
    table.send("kuba", "ready");
    table.send("ola", "begin");
    table.send("kuba", "vote", { side: "left" });
    table.wait(TIMING.botVote[3] + 500);
    expect(Object.keys(table.state.votes).sort()).toEqual([...ADVISORS].sort());
    expect(table.state.phase).toBe("council");
    expect(table.state.messages.some((message) => message.bot)).toBe(true);
    expect(() => table.send("kuba", "decree", { side: "left" })).toThrow(Refused);
    table.send("ola", "decree", { side: "left" });
    expect(table.state.phase).toBe("outcome");
  });

  it("applies the omen's drain on top of the decree", () => {
    const table = startedTable();
    table.state = { ...table.state, omen: "drought" };
    table.send("ola", "ready");
    table.send("kuba", "ready");
    table.send("ola", "begin");
    const event = eventById(table.state.event!);
    for (const role of ADVISORS) table.state.votes[role] = "right";
    const before = table.state.stats.people;
    table.send("ola", "decree", { side: "right" });
    expect(table.state.outcome!.passive).toEqual({ people: -1 });
    expect(table.state.stats.people).toBe(Math.max(0, Math.min(100, before + event.right.effects.people - 1)));
  });

  it("opens the trial after the twelfth decree", () => {
    const table = startedTable();
    table.send("ola", "ready");
    table.send("kuba", "ready");
    table.send("ola", "begin");
    for (let decree = 1; decree <= DECREES_PER_YEAR; decree++) {
      expect(table.state.decree).toBe(decree);
      for (const role of ADVISORS) table.state.votes[role] = "left";
      table.state.stats = { faith: 50, people: 50, army: 50, treasury: 50, stability: 50 };
      table.send("ola", "decree", { side: "left" });
      table.send("ola", "next");
    }
    expect(table.state.phase).toBe("trial");
    expect(table.state.trial!.deadline).toBe(table.now + TRIAL_MS);
  });
});

function tableAtTrial(traitor: AdvisorRole, seed = 7): Table {
  const table = startedTable(seed);
  table.state = {
    ...table.state,
    phase: "trial",
    decree: DECREES_PER_YEAR,
    trial: { votes: {}, deadline: table.now + TRIAL_MS },
    vault: sealSecret({ traitor, history: [{ role: traitor, from: 1, caught: false }] }),
    stats: { faith: 50, people: 50, army: 50, treasury: 50, stability: 50 },
    phaseAt: table.now,
  };
  return table;
}

describe("the trial", () => {
  it("executes a caught traitor: stability bonus and no traitor left", () => {
    const table = tableAtTrial("army");
    table.state.trial!.votes = { faith: "army", people: "army" };
    table.send("ola", "accuse", { target: "army" });
    expect(table.state.phase).toBe("trial");
    table.send("kuba", "accuse", { target: "army" });
    // Three votes reached, but the trial waits for everyone or the deadline.
    table.now = table.state.trial!.deadline;
    table.send("ola", "nudge");
    expect(table.state.phase).toBe("verdict");
    expect(table.state.verdict).toMatchObject({ executed: "army", wasTraitor: true });
    expect(table.state.stats.stability).toBe(50 + CAUGHT_BONUS);
    expect(table.secret().traitor).toBeNull();
    expect(table.secret().history[0].caught).toBe(true);
  });

  it("punishes a wrong execution on the executed advisor's pillar", () => {
    const table = tableAtTrial("army");
    table.state.trial!.votes = { faith: "people", army: "people", people: "faith" };
    table.send("ola", "accuse", { target: "people" });
    table.send("kuba", "accuse", { target: "none" });
    expect(table.state.phase).toBe("verdict");
    expect(table.state.verdict).toMatchObject({ executed: "people", wasTraitor: false });
    expect(table.state.stats.people).toBe(50 - WRONG_PENALTY);
    expect(table.secret().traitor).toBe("army");
  });

  it("spares everyone without a majority", () => {
    const table = tableAtTrial("army");
    table.state.trial!.votes = { faith: "people", army: "none", people: "faith" };
    table.send("ola", "accuse", { target: "army" });
    table.send("kuba", "accuse", { target: "army" });
    expect(table.state.verdict).toMatchObject({ executed: null, wasTraitor: false });
  });

  it("refuses accusing yourself or the King", () => {
    const table = tableAtTrial("army");
    expect(() => table.send("kuba", "accuse", { target: "treasury" })).toThrow(Refused);
    expect(() => table.send("kuba", "accuse", { target: "king" })).toThrow(Refused);
  });

  it("starts the next year with a new omen and maybe a new traitor", () => {
    const table = tableAtTrial("army");
    table.state.chronicle = [];
    table.state.omen = "drought";
    table.state.trial!.votes = { faith: "army", people: "army", army: "none" };
    table.send("ola", "accuse", { target: "army" });
    table.send("kuba", "accuse", { target: "army" });
    table.send("ola", "next");
    expect(table.state.phase).toBe("omen");
    expect(table.state.year).toBe(2);
    expect(table.state.omen).not.toBe("drought");
    expect(table.state.deck).toHaveLength(DECREES_PER_YEAR);
    const secret = table.secret();
    if (secret.traitor) expect(secret.history.at(-1)).toMatchObject({ role: secret.traitor, from: 2 });
  });
});

describe("whole reigns", () => {
  function playOut(seed: number): Table {
    // Kuba sits as Skarbnik but is away, so the rules play every chair; Ola only watches.
    const table = new Table([ola, kuba], seed);
    table.send("ola", "seat", { role: "king", bot: true });
    table.send("kuba", "sit", { role: "treasury" });
    table.send("ola", "start");
    table.roster = [ola];
    for (let step = 0; step < 4000 && table.state.phase !== "ended"; step++) {
      table.now += 1000;
      table.send("ola", "nudge");
    }
    return table;
  }

  it("always reaches an ending and stays within the state limit", () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const table = playOut(seed);
      expect(table.state.phase).toBe("ended");
      expect(["court", "traitor", "none"]).toContain(table.state.ending!.winner);
      expect(JSON.stringify(table.state).length).toBeLessThan(256 * 1024);
      if (table.state.ending!.winner === "court") {
        expect(table.state.year).toBe(3);
        expect(table.state.chronicle).toHaveLength(3);
      } else {
        expect(table.state.ending!.collapse).not.toBeNull();
      }
    }
  });

  it("lets a new host carry on from the shared state alone", () => {
    const table = startedTable();
    table.send("ola", "ready");
    table.send("kuba", "ready");
    table.send("ola", "begin");
    table.host = "kuba";
    table.roster = [kuba];
    table.send("kuba", "vote", { side: "right" });
    table.wait(TIMING.botKing + 1000);
    expect(table.state.phase).toBe("outcome");
  });

  it("never decrees for a human King whose connection only blinked", () => {
    const table = startedTable();
    table.send("ola", "ready");
    table.send("kuba", "ready");
    table.send("ola", "begin");
    table.send("kuba", "vote", { side: "left" });
    table.roster = [{ ...ola, connected: false }, kuba];
    table.wait(TIMING.botVote[3] + TIMING.botKing + 5000);
    expect(table.state.phase).toBe("council");
    expect(Object.keys(table.state.votes)).toHaveLength(4);
  });

  it("gives the chair of someone who left to a bot at the start", () => {
    const table = new Table();
    table.send("ola", "sit", { role: "king" });
    table.send("kuba", "sit", { role: "army" });
    table.roster = [ola];
    table.send("ola", "start");
    expect(table.state.seats.army).toEqual({ kind: "bot" });
    expect(Object.keys(table.assignments)).toEqual(["ola"]);
  });

  it("lets the host free a chair whose owner left, but not a taken one", () => {
    const table = new Table();
    table.send("kuba", "sit", { role: "army" });
    expect(() => table.send("ola", "seat", { role: "army", bot: true })).toThrow(Refused);
    table.roster = [ola];
    table.send("ola", "seat", { role: "army", bot: true });
    expect(table.state.seats.army).toEqual({ kind: "bot" });
  });

  it("deals no case twice", () => {
    const random = seeded(3);
    const used: string[] = [];
    for (const omen of ["drought", "war", "comet"] as const) {
      const deck = buildYearDeck(omen, used, random);
      for (const id of deck) expect(used).not.toContain(id);
      used.push(...deck);
    }
  });
});

describe("Poselstwa", () => {
  function embassyTable(seed = 7): Table {
    const table = new Table([ola, kuba], seed);
    table.send("ola", "mode", { mode: "diplomacy" });
    table.send("ola", "sit", { role: "king" });
    table.send("kuba", "sit", { role: "treasury" });
    table.send("ola", "start");
    table.send("ola", "ready");
    table.send("kuba", "ready");
    table.send("ola", "begin");
    return table;
  }

  it("opens a case in every channel and puts the pirates' on the table first", () => {
    const table = embassyTable();
    expect(table.state.mode).toBe("diplomacy");
    for (const channel of ["pirates", "free_ports", "amber_guilds"] as const) expect(table.state.cases[channel]).toBeTruthy();
    expect(table.state.dispatch).toBe(table.state.cases.pirates);
    expect(table.state.deck).toHaveLength(0);
    expect(table.state.relations).toEqual({ pirates: 34, free_ports: 56, amber_guilds: 48 });
  });

  it("refuses a reply that is not on the dispatch", () => {
    const table = embassyTable();
    expect(() => table.send("kuba", "vote", { choice: "nonsense" })).toThrow(Refused);
  });

  it("seals the King's reply with its hidden layer, moves the relation and rotates the channel", async () => {
    const { dispatchById, choiceOf, replyEffects, nextRelation } = await import("./embassy");
    const table = embassyTable();
    const dispatch = dispatchById(table.state.dispatch!);
    const choice = dispatch.choices[0];
    table.send("kuba", "vote", { choice: choice.id });
    table.wait(TIMING.botVote[3] + 500);
    expect(Object.keys(table.state.picks)).toHaveLength(4);
    expect(table.state.messages.some((message) => message.bot)).toBe(true);
    const before = { ...table.state.stats };
    const relation = table.state.relations.pirates;
    table.send("ola", "decree", { choice: choice.id });
    expect(table.state.phase).toBe("outcome");
    const { visible, hidden } = replyEffects(choiceOf(dispatch, choice.id), table.state.omen);
    const passive = table.state.reply!.passive;
    for (const stat of ["faith", "people", "army", "treasury", "stability"] as const) {
      const expected = Math.max(0, Math.min(100, before[stat] + (visible[stat] ?? 0) + (hidden[stat] ?? 0) + (passive[stat] ?? 0)));
      expect(table.state.stats[stat]).toBe(expected);
    }
    expect(table.state.relations.pirates).toBe(nextRelation(relation, choice));
    expect(table.state.cases.pirates).toBeNull();
    expect(table.state.log.at(-1)).toMatchObject({ kind: "dispatch", liaison: dispatch.liaisonRole });
    table.send("ola", "next");
    expect(table.state.decree).toBe(2);
    expect(table.state.dispatch).toBe(table.state.cases.free_ports);
  });

  it("picks for an advisor who left, after the longer wait for a human", () => {
    const table = embassyTable();
    table.roster = [ola];
    table.wait(TIMING.botVote[3] + 500);
    expect(Object.keys(table.state.picks)).toHaveLength(3);
    expect(table.state.picks.treasury).toBeUndefined();
    table.wait(TIMING.absentAdvisor);
    expect(table.state.picks.treasury).toBeTruthy();
    // The King is still here, so the seal stays hers.
    expect(table.state.phase).toBe("council");
  });

  it("seals for a King who left once the council has voted", async () => {
    const { dispatchById } = await import("./embassy");
    const table = new Table([ola, kuba], 7);
    table.send("ola", "mode", { mode: "diplomacy" });
    table.send("kuba", "sit", { role: "king" });
    table.send("ola", "sit", { role: "treasury" });
    table.send("ola", "start");
    table.send("ola", "ready");
    table.send("kuba", "ready");
    table.send("ola", "begin");
    table.send("ola", "vote", { choice: dispatchById(table.state.dispatch!).choices[0].id });
    table.roster = [ola];
    table.wait(TIMING.botKing + 1000);
    expect(table.state.phase).toBe("outcome");
    expect(table.state.reply?.dispatchId).toBeTruthy();
  });

  it("plays whole reigns to an ending", () => {
    for (const seed of [11, 12, 13, 14, 15]) {
      const table = new Table([ola, kuba], seed);
      table.send("ola", "mode", { mode: "diplomacy" });
      table.send("ola", "seat", { role: "king", bot: true });
      table.send("kuba", "sit", { role: "treasury" });
      table.send("ola", "start");
      table.roster = [ola];
      for (let step = 0; step < 4000 && table.state.phase !== "ended"; step++) {
        table.now += 1000;
        table.send("ola", "nudge");
      }
      expect(table.state.phase).toBe("ended");
      expect(JSON.stringify(table.state).length).toBeLessThan(256 * 1024);
      for (const channel of ["pirates", "free_ports", "amber_guilds"] as const) {
        expect(table.state.relations[channel]).toBeGreaterThanOrEqual(0);
        expect(table.state.relations[channel]).toBeLessThanOrEqual(100);
      }
    }
  });
});
