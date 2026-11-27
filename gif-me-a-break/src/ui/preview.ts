/**
 * Canned rooms for looking at one screen without playing up to it: open the built app (or
 * `vite dev`) with `?preview=<phase>`, optionally `&as=guest`. Only used outside Stellarr.
 */
import { REVEAL_EACH_MS, REVEAL_INTRO_MS } from "../game/rules.ts";
import { emptyStats, initialState, type GameState, type Meme, type Phase, type Player } from "../game/types.ts";
import type { Preview } from "../stellarr/sdk.ts";
import type { JsonValue, Participant } from "../stellarr/types.ts";

const names = ["Ola", "Kuba", "Maja", "Wiktor", "Zuza", "Bartek"];
const players: Player[] = names.map((name) => ({ id: name.toLowerCase(), name, avatar: null }));
const people: Participant[] = players.map((p) => ({ ...p, connected: true }));

const gif = (id: string, alt: string) => ({ id, w: 640, h: 480, alt });
const GIFS = {
  szop: gif("demoraccooncash", "szop liczy banknoty"),
  kot: gif("democatshades", "kot w okularach na leżaku"),
  pies: gif("demodogdance", "pies tańczy na chodniku"),
  ges: gif("demogooseshop", "gęś wchodzi do sklepu"),
  fajer: gif("demofireworks", "fajerwerki nad miastem"),
  lzy: gif("demodogtears", "pies wzruszony do łez"),
};

const topic = { id: "c18", text: "Bartek po znalezieniu 20 zł w starej kurtce", name: "Bartek" };
const memes: Meme[] = [GIFS.pies, GIFS.szop, GIFS.lzy, GIFS.kot, GIFS.fajer, GIFS.ges].map((g, i) => ({ key: `r1m${i}`, gif: g }));
/** Who made which preview meme: Kuba (this tab) made the goose. */
const authors: Record<string, string> = { r1m0: "wiktor", r1m1: "maja", r1m2: "zuza", r1m3: "ola", r1m4: "bartek", r1m5: "kuba" };

const CAPTIONS = ["Ja, kiedy w końcu jest piątek", "Mina po otwarciu lodówki o 3 w nocy", "Kiedy ktoś mówi „to zajmie chwilkę”", "Ja w poniedziałek o 8:00", "Gdy Wi-Fi wraca po minucie", "Kiedy kurier dzwoni domofonem"];

/** The canned room for a phase, optionally in Reżyser (this tab directs) or Napisy. */
export function previewRoom(phase: Phase, guest: boolean, mode: string | null = null): { state: GameState; preview: Preview } {
  const room = baseRoom(phase, guest);
  const s = room.state;
  if (mode === "rezyser") {
    s.settings = { ...s.settings, mode: "rezyser" };
    s.director = "kuba";
    if (phase === "results") s.result = { ...s.result!, votes: { ...Object.fromEntries(Object.keys(s.result!.votes).map((k) => [k, []])), r1m1: ["kuba"] }, points: { ola: 0, kuba: 0, maja: 3, wiktor: 0, zuza: 0, bartek: 0 } };
  }
  if (mode === "napisy") {
    s.settings = { ...s.settings, mode: "napisy" };
    s.topic = null;
    if (phase === "topic") s.gifChoices = [GIFS.szop, GIFS.kot];
    if (phase !== "topic") s.roundGif = GIFS.pies;
    s.memes = s.memes.map((m, i) => ({ ...m, gif: GIFS.pies, caption: CAPTIONS[i] }));
    if (phase === "vote") room.preview.mine = { match: "preview", round: 1, gif: null, caption: CAPTIONS[5], sentMs: 9000, vote: null };
  }
  return room;
}

function baseRoom(phase: Phase, guest: boolean): { state: GameState; preview: Preview } {
  const now = Date.now();
  const match = { id: "preview", players, startedAt: now - 600_000 };
  const base: GameState = { ...initialState(), match, round: 1, scores: { ola: 4, kuba: 3, maja: 6, wiktor: 2, zuza: 0, bartek: 1 } };
  const me = people[1];
  let state: GameState = base;
  let mine: JsonValue = null;
  let host = guest ? "ola" : "kuba";

  switch (phase) {
    case "lobby":
      state = { ...initialState() };
      break;
    case "topic":
      state = {
        ...base,
        phase,
        startsAt: now - 4_000,
        endsAt: now + 8_000,
        choices: [topic, { id: "p01", text: "Kiedy szef pisze „masz chwilę?” w piątek o 16:58" }],
        topicVotes: { ola: 0, maja: 1, zuza: 0 },
      };
      host = "ola";
      break;
    case "search":
      state = { ...base, phase, topic, startsAt: now - 13_000, endsAt: now + 32_000, done: ["ola", "maja", "zuza"] };
      host = "ola";
      break;
    case "reveal":
      state = { ...base, phase, topic, memes, startsAt: now - REVEAL_INTRO_MS - 2 * REVEAL_EACH_MS - 800, endsAt: now + 60_000 };
      host = "ola";
      break;
    case "vote":
      state = { ...base, phase, topic, memes, startsAt: now - 9_000, endsAt: now + 11_000, done: ["ola", "maja", "zuza"] };
      mine = { match: "preview", round: 1, gif: GIFS.ges, sentMs: 9000, vote: null };
      host = "ola";
      break;
    case "results": {
      const votes = { r1m0: ["maja"], r1m1: ["ola", "kuba", "bartek"], r1m2: [], r1m3: ["wiktor"], r1m4: [], r1m5: ["zuza"] };
      state = {
        ...base,
        phase,
        topic,
        memes,
        startsAt: now - 2_000,
        endsAt: now + 8_000,
        result: { authors, votes, points: { ola: 1, kuba: 1, maja: 3, wiktor: 1, zuza: 0, bartek: 0 }, winners: ["maja"], missing: [] },
        scores: { ola: 4, kuba: 3, maja: 6, wiktor: 2, zuza: 0, bartek: 1 },
        stats: { ...emptyStats(), streak: { maja: 2 }, bestStreak: { maja: 2 } },
      };
      host = "ola";
      break;
    }
    case "final":
      state = {
        ...base,
        phase,
        round: 7,
        scores: { ola: 21, kuba: 19, maja: 27, wiktor: 12, zuza: 9, bartek: 15 },
        highlights: [GIFS.szop, GIFS.szop, GIFS.kot, GIFS.pies, GIFS.ges, GIFS.fajer, GIFS.lzy, GIFS.kot].map((g, round) => ({
          round,
          topic,
          gif: g,
          author: ["maja", "maja", "maja", "ola", "kuba", "wiktor", "bartek", "ola"][round],
          votes: 3,
        })),
        stats: {
          sendMs: { kuba: 72_000, ola: 160_000, maja: 140_000, bartek: 150_000, wiktor: 170_000, zuza: 180_000 },
          sends: { kuba: 8, ola: 8, maja: 8, bartek: 8, wiktor: 8, zuza: 8 },
          wins: { maja: 3, ola: 2, kuba: 1, wiktor: 1, bartek: 1 },
          streak: {},
          bestStreak: { maja: 3, ola: 1 },
          silent: { zuza: 3, wiktor: 1 },
          best: { player: "wiktor", votes: 5, round: 5 },
        },
      };
      break;
  }
  return { state, preview: { me, people, host, mine } };
}
