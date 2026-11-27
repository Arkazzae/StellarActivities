import { describe, expect, it } from "vitest";
import {
  advance,
  awards,
  castVote,
  closeResults,
  drawChoices,
  endMatch,
  memeOrder,
  offerGifs,
  Refusal,
  standings,
  startMatch,
  submitCaption,
  submitGif,
  updateSettings,
  voteTopic,
  type Assignments,
  type Decision,
} from "./rules.ts";
import { fillTopic, poolFor, shortName, TOPICS } from "./topics.ts";
import { DEFAULT_SETTINGS, initialState, type GameState, type Player } from "./types.ts";

const people = (n: number): Player[] =>
  ["Ola", "Kuba", "Maja", "Wiktor", "Zuza", "Bartek", "Ania", "Tomek", "Ewa"].slice(0, n).map((name) => ({ id: name.toLowerCase(), name, avatar: null }));

/** A tiny room: applies decisions the way Stellarr would, keeping assignments per player. */
class Table {
  state: GameState = initialState();
  assignments: Assignments = {};
  now = 1_000_000;
  connected: string[];
  constructor(public players: Player[]) {
    this.connected = players.map((p) => p.id);
  }
  get room() {
    return { now: this.now, connected: this.connected };
  }
  apply(decision: Decision) {
    this.state = { ...this.state, ...decision.patch };
    Object.assign(this.assignments, decision.assignments ?? {});
    return decision.result;
  }
  start(id = "match-1") {
    return this.apply(startMatch(this.state, this.players, id, this.now, true));
  }
  pass(ms: number) {
    this.now += ms;
  }
  nudge() {
    this.now = Math.max(this.now, this.state.endsAt);
    return this.apply(advance(this.state, { match: this.state.match?.id, round: this.state.round, phase: this.state.phase }, this.room, this.assignments));
  }
  topic(from: string, choice: number) {
    return this.apply(voteTopic(this.state, from, choice, this.room));
  }
  send(from: string, id: string) {
    return this.apply(submitGif(this.state, from, { id, w: 480, h: 270, alt: id }, this.room, this.assignments));
  }
  vote(from: string, key: string) {
    return this.apply(castVote(this.state, from, key, this.room, this.assignments));
  }
  keyOf(author: string) {
    const { authors } = memeOrder(this.state, this.assignments);
    return Object.keys(authors).find((k) => authors[k] === author)!;
  }
}

describe("starting a match", () => {
  it("needs three players and the host", () => {
    expect(() => startMatch(initialState(), people(2), "m", 0, true)).toThrow(Refusal);
    expect(() => startMatch(initialState(), people(3), "m", 0, false)).toThrow(/hostOnlyStart/);
    const t = new Table(people(3));
    t.start();
    expect(t.state.phase).toBe("topic");
    expect(t.state.choices).toHaveLength(2);
    expect(t.state.scores).toEqual({ ola: 0, kuba: 0, maja: 0 });
  });

  it("seats at most eight", () => {
    const d = startMatch(initialState(), people(9), "m", 0, true);
    expect(d.patch!.match!.players).toHaveLength(8);
  });

  it("lets only the host change settings, and only to known values", () => {
    expect(() => updateSettings(initialState(), { rounds: 5 }, false)).toThrow(Refusal);
    const d = updateSettings(initialState(), { rounds: 5, searchSeconds: 7, mode: "bogus", pack: "internet" }, true);
    expect(d.patch!.settings).toEqual({ ...DEFAULT_SETTINGS, rounds: 5, pack: "internet" });
  });
});

describe("topics", () => {
  it("are unique ids and never use a past-tense second person", () => {
    expect(new Set(TOPICS.map((t) => t.id)).size).toBe(TOPICS.length);
    // No \b: in JavaScript it doesn't see a word end after a Polish letter.
    for (const t of TOPICS) expect(t.text).not.toMatch(/(łeś|łaś|liście|łyście)(?![a-ząćęłńóśźż])/);
  });

  it("put the name in as written, shortened when long", () => {
    const template = TOPICS.find((t) => t.text.startsWith("{gracz} po znalezieniu"))!;
    expect(fillTopic(template, "Bartek")).toEqual({ text: "Bartek po znalezieniu 20 zł w starej kurtce", name: "Bartek" });
    expect(shortName("Konstantynopolitańczykowianeczka")).toHaveLength(18);
  });

  it("leave out named topics when names are off", () => {
    expect(poolFor("mix", false).some((t) => t.text.includes("{gracz}"))).toBe(false);
  });

  it("do not repeat until the pack runs out", () => {
    let used: string[] = [];
    const seen = new Set<string>();
    const pool = poolFor("praca", true).length;
    for (let round = 0; round < Math.floor(pool / 2); round++) {
      const draw = drawChoices("m", round, { ...DEFAULT_SETTINGS, pack: "praca" }, used, people(3));
      for (const c of draw.choices) {
        expect(seen.has(c.id)).toBe(false);
        seen.add(c.id);
      }
      used = draw.used;
    }
  });

  it("are drawn the same way by any host", () => {
    const a = drawChoices("abc", 3, DEFAULT_SETTINGS, [], people(4));
    const b = drawChoices("abc", 3, DEFAULT_SETTINGS, [], people(4));
    expect(a).toEqual(b);
  });
});

describe("a round", () => {
  it("picks the topic with most votes once everyone voted", () => {
    const t = new Table(people(3));
    t.start();
    t.topic("ola", 1);
    t.topic("kuba", 1);
    expect(t.state.phase).toBe("topic");
    t.topic("maja", 0);
    expect(t.state.phase).toBe("search");
    expect(t.state.topic).toEqual(t.state.choices[1]);
  });

  it("breaks a topic tie the same way every time", () => {
    const run = () => {
      const t = new Table(people(4));
      t.start("tie");
      t.topic("ola", 0);
      t.topic("kuba", 1);
      t.nudge();
      return t.state.topic;
    };
    expect(run()).toEqual(run());
  });

  it("refuses spectators and broken GIFs", () => {
    const t = new Table(people(3));
    t.start();
    t.nudge();
    expect(() => t.send("stranger", "abc")).toThrow(/spectator/);
    expect(() => t.apply(submitGif(t.state, "ola", { id: "https://evil", w: 1, h: 1 }, t.room, t.assignments))).toThrow(/notAGif/);
    expect(() => t.apply(submitGif(t.state, "ola", { id: "abc", w: 0, h: 1 }, t.room, t.assignments))).toThrow(/notAGif/);
  });

  it("keeps GIFs private until the reveal, which hides the authors", () => {
    const t = new Table(people(3));
    t.start();
    t.nudge();
    t.send("ola", "gifA");
    expect(t.state.done).toEqual(["ola"]);
    expect(JSON.stringify(t.state)).not.toContain("gifA");
    t.send("kuba", "gifB");
    t.send("maja", "gifC");
    expect(t.state.phase).toBe("reveal");
    expect(t.state.memes.map((m) => m.gif.id).sort()).toEqual(["gifA", "gifB", "gifC"]);
    expect(JSON.stringify(t.state.memes)).not.toMatch(/ola|kuba|maja/);
  });

  it("lets a player change the GIF while the search runs", () => {
    const t = new Table(people(3));
    t.start();
    t.nudge();
    t.send("ola", "first");
    t.send("ola", "second");
    t.nudge();
    expect(t.state.memes.map((m) => m.gif.id)).toEqual(["second"]);
  });

  it("refuses a late GIF", () => {
    const t = new Table(people(3));
    t.start();
    t.nudge();
    t.pass(DEFAULT_SETTINGS.searchSeconds * 1000 + 5_000);
    expect(() => t.send("ola", "late")).toThrow(/searchOver/);
  });

  it("goes straight to results when nobody sends anything", () => {
    const t = new Table(people(3));
    t.start();
    t.nudge();
    t.nudge();
    expect(t.state.phase).toBe("results");
    expect(t.state.result!.missing).toEqual(["ola", "kuba", "maja"]);
    t.nudge();
    expect(t.state.phase).toBe("topic");
    expect(t.state.round).toBe(1);
  });

  it("scores one point per vote and refuses votes for your own meme", () => {
    const t = new Table(people(4));
    t.start();
    t.nudge();
    for (const p of ["ola", "kuba", "maja", "wiktor"]) t.send(p, `g${p}`);
    t.nudge();
    expect(t.state.phase).toBe("vote");
    expect(() => t.vote("ola", t.keyOf("ola"))).toThrow(/ownMeme/);
    t.vote("ola", t.keyOf("maja"));
    t.vote("kuba", t.keyOf("maja"));
    t.vote("wiktor", t.keyOf("maja"));
    expect(t.state.phase).toBe("vote");
    t.vote("maja", t.keyOf("kuba"));
    expect(t.state.phase).toBe("results");
    expect(t.state.result!.winners).toEqual(["maja"]);
    expect(t.state.scores).toEqual({ ola: 0, kuba: 1, maja: 3, wiktor: 0 });
    expect(t.state.highlights).toHaveLength(1);
    expect(t.state.highlights[0]).toMatchObject({ author: "maja", votes: 3, round: 0 });
  });

  it("counts a changed vote once", () => {
    const t = new Table(people(3));
    t.start();
    t.nudge();
    for (const p of ["ola", "kuba", "maja"]) t.send(p, `g${p}`);
    t.nudge();
    t.vote("ola", t.keyOf("kuba"));
    t.vote("ola", t.keyOf("maja"));
    t.nudge();
    expect(t.state.result!.points).toEqual({ ola: 0, kuba: 0, maja: 1 });
  });

  it("lets everyone win a tie", () => {
    const t = new Table(people(3));
    t.start();
    t.nudge();
    for (const p of ["ola", "kuba", "maja"]) t.send(p, `g${p}`);
    t.nudge();
    t.vote("ola", t.keyOf("kuba"));
    t.vote("kuba", t.keyOf("ola"));
    t.vote("maja", t.keyOf("ola"));
    expect(t.state.result!.winners).toEqual(["ola"]);
    const u = new Table(people(4));
    u.start();
    u.nudge();
    for (const p of ["ola", "kuba", "maja", "wiktor"]) u.send(p, `g${p}`);
    u.nudge();
    u.vote("ola", u.keyOf("kuba"));
    u.vote("kuba", u.keyOf("ola"));
    u.nudge();
    expect(u.state.result!.winners.sort()).toEqual(["kuba", "ola"]);
  });

  it("does not wait for the only author when one meme is shown", () => {
    const t = new Table(people(3));
    t.start();
    t.nudge();
    t.send("ola", "solo");
    t.nudge();
    t.nudge();
    expect(t.state.memes).toHaveLength(1);
    t.vote("kuba", t.keyOf("ola"));
    t.vote("maja", t.keyOf("ola"));
    expect(t.state.phase).toBe("results");
    expect(t.state.scores.ola).toBe(2);
  });

  it("does not wait for a player who left", () => {
    const t = new Table(people(4));
    t.start();
    t.connected = ["ola", "kuba", "maja"];
    t.nudge();
    t.send("ola", "a");
    t.send("kuba", "b");
    t.send("maja", "c");
    expect(t.state.phase).toBe("reveal");
  });

  it("ends the match when fewer than two players are left", () => {
    const t = new Table(people(3));
    t.start();
    t.nudge();
    t.nudge();
    t.connected = ["ola"];
    t.apply(closeResults(t.state, t.room));
    expect(t.state.phase).toBe("final");
  });

  it("ignores nudges that are early or for an older phase", () => {
    const t = new Table(people(3));
    t.start();
    const stale = t.apply(advance(t.state, { match: "match-1", round: 0, phase: "search" }, t.room, t.assignments));
    expect(stale).toBe("stale");
    const early = t.apply(advance(t.state, { match: "match-1", round: 0, phase: "topic" }, t.room, t.assignments));
    expect(early).toBe("early");
    expect(t.state.phase).toBe("topic");
  });

  it("gives a new host the same reveal order and results from the assignments", () => {
    const t = new Table(people(4));
    t.start();
    t.nudge();
    for (const p of ["ola", "kuba", "maja", "wiktor"]) t.send(p, `g${p}`);
    const before = memeOrder(t.state, t.assignments);
    const copy = JSON.parse(JSON.stringify({ state: t.state, assignments: t.assignments }));
    expect(memeOrder(copy.state, copy.assignments)).toEqual(before);
  });

  it("orders the reveal by something players can't see", () => {
    const order = (sentMs: number) => {
      const t = new Table(people(4));
      t.start("same");
      t.nudge();
      for (const p of ["ola", "kuba", "maja", "wiktor"]) t.send(p, `g${p}`);
      const assignments = { ...t.assignments, ola: { ...(t.assignments.ola as object), sentMs } };
      return memeOrder(t.state, assignments).memes.map((m) => m.gif.id).join();
    };
    const orders = new Set([0, 1, 2, 3, 4, 5, 6, 7].map(order));
    expect(orders.size).toBeGreaterThan(1);
  });

  it("ignores assignments from an older round", () => {
    const t = new Table(people(3));
    t.start();
    t.nudge();
    for (const p of ["ola", "kuba", "maja"]) t.send(p, `g${p}`);
    t.nudge();
    t.nudge();
    t.nudge();
    t.nudge();
    expect(t.state.round).toBe(1);
    expect(t.state.phase).toBe("search");
    t.nudge();
    expect(t.state.phase).toBe("results");
    expect(t.state.memes).toHaveLength(0);
  });
});

describe("Reżyser", () => {
  const directed = () => {
    const t = new Table(people(4));
    t.apply(updateSettings(t.state, { mode: "rezyser" }, true));
    t.start();
    return t;
  };

  it("gives the first player the chair, and only the director picks the topic", () => {
    const t = directed();
    expect(t.state.director).toBe("ola");
    expect(() => t.topic("kuba", 1)).toThrow(/directorPicksTopic/);
    t.topic("ola", 1);
    expect(t.state.phase).toBe("search");
    expect(t.state.topic).toEqual(t.state.choices[1]);
  });

  it("doesn't let the director search, and doesn't wait for them", () => {
    const t = directed();
    t.topic("ola", 0);
    expect(() => t.send("ola", "x")).toThrow(/directorDoesntSearch/);
    t.send("kuba", "k");
    t.send("maja", "m");
    expect(t.state.phase).toBe("search");
    t.send("wiktor", "w");
    expect(t.state.phase).toBe("reveal");
  });

  it("lets only the director pick the winner, worth three points", () => {
    const t = directed();
    t.topic("ola", 0);
    for (const p of ["kuba", "maja", "wiktor"]) t.send(p, `g${p}`);
    t.nudge();
    expect(() => t.vote("kuba", t.keyOf("maja"))).toThrow(/directorPicksWinner/);
    t.vote("ola", t.keyOf("maja"));
    expect(t.state.phase).toBe("results");
    expect(t.state.result!.winners).toEqual(["maja"]);
    expect(t.state.scores).toEqual({ ola: 0, kuba: 0, maja: 3, wiktor: 0 });
    expect(t.state.stats.silent).toEqual({});
  });

  it("passes the chair on, skipping someone who left", () => {
    const t = directed();
    t.topic("ola", 0);
    t.nudge();
    expect(t.state.phase).toBe("results");
    t.connected = ["ola", "maja", "wiktor"];
    t.nudge();
    expect(t.state.round).toBe(1);
    expect(t.state.director).toBe("maja");
  });
});

describe("Napisy", () => {
  const captions = () => {
    const t = new Table(people(3));
    t.apply(updateSettings(t.state, { mode: "napisy" }, true));
    t.start();
    return t;
  };
  const gifs = [{ id: "gifA", w: 480, h: 270 }, { id: "gifB", w: 480, h: 270 }];

  it("votes on GIFs the host offers instead of topics", () => {
    const t = captions();
    expect(t.state.choices).toEqual([]);
    expect(() => t.apply(offerGifs(t.state, gifs, false))).toThrow(/hostOnlyGifs/);
    t.apply(offerGifs(t.state, gifs, true));
    expect(t.state.gifChoices.map((g) => g.id)).toEqual(["gifA", "gifB"]);
    expect(t.apply(offerGifs(t.state, [{ id: "late", w: 1, h: 1 }], true))).toBe("stale");
    for (const p of ["ola", "kuba", "maja"]) t.topic(p, 1);
    expect(t.state.phase).toBe("search");
    expect(t.state.roundGif!.id).toBe("gifB");
    expect(t.state.topic).toBeNull();
  });

  it("skips the round when no GIFs came", () => {
    const t = captions();
    t.nudge();
    expect(t.state.phase).toBe("results");
    expect(t.state.memes).toEqual([]);
  });

  it("collects captions, refuses GIFs, and scores captions like memes", () => {
    const t = captions();
    t.apply(offerGifs(t.state, gifs, true));
    t.nudge();
    expect(() => t.send("ola", "x")).toThrow(/captionsOnly/);
    expect(() => t.apply(submitCaption(t.state, "ola", "   ", t.room, t.assignments))).toThrow(/emptyCaption/);
    const write = (from: string, text: string) => t.apply(submitCaption(t.state, from, text, t.room, t.assignments));
    write("ola", "Ja,  kiedy   widzę rachunek");
    write("kuba", "x".repeat(200));
    expect(JSON.stringify(t.state)).not.toContain("rachunek");
    write("maja", "Poniedziałek rano");
    expect(t.state.phase).toBe("reveal");
    expect(t.state.memes.every((m) => m.gif.id === "gifA")).toBe(true);
    expect(t.state.memes.map((m) => m.caption).sort()).toEqual(["Ja, kiedy widzę rachunek", "Poniedziałek rano", "x".repeat(90)]);
    t.nudge();
    t.vote("kuba", t.keyOf("ola"));
    t.vote("maja", t.keyOf("ola"));
    t.vote("ola", t.keyOf("maja"));
    expect(t.state.result!.winners).toEqual(["ola"]);
    expect(t.state.highlights[0]).toMatchObject({ author: "ola", caption: "Ja, kiedy widzę rachunek" });
  });
});

describe("a whole match", () => {
  it("ends after the set number of rounds with standings and awards", () => {
    const t = new Table(people(4));
    t.apply(updateSettings(t.state, { rounds: 5 }, true));
    t.start();
    for (let round = 0; round < 5; round++) {
      t.nudge();
      t.pass(4_000);
      t.send("ola", `o${round}`);
      t.pass(6_000);
      t.send("kuba", `k${round}`);
      t.pass(10_000);
      t.send("maja", `m${round}`);
      t.send("wiktor", `w${round}`);
      t.nudge();
      t.vote("ola", t.keyOf("maja"));
      t.vote("kuba", t.keyOf("maja"));
      t.vote("wiktor", t.keyOf("maja"));
      t.vote("maja", t.keyOf("kuba"));
      t.nudge();
    }
    expect(t.state.phase).toBe("final");
    const table = standings(t.state);
    expect(table[0]).toMatchObject({ place: 1, score: 15 });
    expect(table[0].player.id).toBe("maja");
    const list = awards(t.state);
    expect(list.find((a) => a.kind === "streak")).toMatchObject({ player: "maja", value: 5 });
    expect(list.find((a) => a.kind === "fast")!.player).toBe("ola");
    expect(list.find((a) => a.kind === "quiet")).toMatchObject({ player: "wiktor" });
  });
});

describe("ending a match early", () => {
  it("only the host can, and only during a match", () => {
    expect(() => endMatch(initialState(), true, 0)).toThrow(/notPlaying/);
    const t = new Table(people(3));
    t.start();
    expect(() => endMatch(t.state, false, t.now)).toThrow(/hostOnlyEnd/);
  });

  it("goes to the final screen with the scores as they are, without the unfinished round", () => {
    const t = new Table(people(3));
    t.start();
    t.nudge();
    for (const p of ["ola", "kuba", "maja"]) t.send(p, `g${p}`);
    t.nudge();
    t.vote("ola", t.keyOf("kuba"));
    t.vote("kuba", t.keyOf("maja"));
    t.vote("maja", t.keyOf("kuba"));
    t.nudge();
    t.nudge();
    expect(t.state.round).toBe(1);
    t.apply(endMatch(t.state, true, t.now));
    expect(t.state.phase).toBe("final");
    expect(t.state.played).toBe(1);
    expect(t.state.scores).toEqual({ ola: 0, kuba: 2, maja: 1 });
  });

  it("counts the round whose results are on screen", () => {
    const t = new Table(people(3));
    t.start();
    t.nudge();
    t.nudge();
    expect(t.state.phase).toBe("results");
    t.apply(endMatch(t.state, true, t.now));
    expect(t.state.played).toBe(1);
  });
});
