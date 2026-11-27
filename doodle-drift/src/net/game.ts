/**
 * One object that owns the room for the UI: it mirrors Stellarr state, keeps the pictures
 * and sentences this tab holds, runs the host's rules when this player is the host, and
 * moves pictures with acknowledged binary messages.
 */
import { LATE_GRACE_MS, COUNTDOWN_MS } from "../game/rules.ts";
import { TEXT_LIMIT } from "../game/types.ts";
import type { MatchSettings, RoundRule, TaskSpec } from "../game/types.ts";
import type { JsonValue, Participant, Session } from "../stellarr/types.ts";
import { hashBytes, pack, unpack } from "./codec.ts";
import type { Assignment, GameState, Player } from "./protocol.ts";
import { initialState, pageKey, parseKey, playerIndex, rosterFor, startPatch, taskImageRefs } from "./protocol.ts";
import { revealOrder, revealedKeys } from "./reveal.ts";

export interface Picture {
  key: string;
  hash: string;
  mime: string;
  bytes: Uint8Array;
}

interface ImgHeader {
  match: string;
  key: string;
  hash: string;
  mime: string;
}

interface TileHeader {
  match: string;
  round: number;
  tile: number;
  hash: string;
  mime: string;
}

export interface Reaction {
  id: number;
  stamp: string;
  from: string;
  at: number;
}

type Outgoing = { kind: string; data: JsonValue | Uint8Array; to?: string; latest?: boolean };

const randomId = () => (crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`).replace(/-/g, "").slice(0, 12);

export function cleanText(text: string, rule: RoundRule | null): string {
  let out = String(text ?? "").replace(/\s+/g, " ").trim().slice(0, TEXT_LIMIT);
  if (rule === "telegram") out = out.split(" ").filter(Boolean).slice(0, 4).join(" ");
  return out;
}

export class Game {
  readonly session: Session;
  readonly me: string;
  readonly bootId = randomId();
  state: GameState;
  people: Participant[] = [];
  host: string | null = null;
  assignment: Assignment | null = null;
  connection: "connected" | "reconnecting" | "closed" = "connected";

  /** Pictures of the current match this tab holds (own, received, or as host: everyone's). */
  readonly pictures = new Map<string, Picture>();
  /** Sentences this tab holds: as host every one, otherwise its own. */
  readonly texts = new Map<string, string>();
  /** Live mosaic tiles from the other artists, by `${album}:${tile}`. */
  readonly tiles = new Map<string, Picture>();
  reactions: Reaction[] = [];
  /** Page keys this tab handed in this match. */
  readonly submitted = new Set<string>();

  private heldMatch = "";
  private version = 0;
  private listeners = new Set<() => void>();
  private outbox: Outgoing[] = [];
  private pumping = false;
  private acks = new Map<string, () => void>();
  private wanted = new Set<string>();
  private asked = new Map<string, number>();
  private wantTimer: ReturnType<typeof setTimeout> | null = null;
  private hostTimer: ReturnType<typeof setTimeout> | null = null;
  private guestTimer: ReturnType<typeof setTimeout> | null = null;
  private storeSeen = "";
  private reactionId = 0;

  constructor(session: Session) {
    this.session = session;
    this.me = session.context.me.id;
    this.state = { ...initialState(), ...(session.state.get() as unknown as GameState) };

    session.state.subscribe((next) => this.onState(next as unknown as GameState));
    session.participants.subscribe((people) => { this.people = people; this.bump(); this.hostChecks(); this.checkLeavers(); });
    session.host.subscribe((host) => { this.host = host; this.bump(); this.hostChecks(); });
    session.assignments.subscribe((value) => { this.assignment = (value as unknown as Assignment) ?? null; this.adoptOwn(); this.bump(); });
    session.connection.subscribe((status) => { this.connection = status; this.bump(); });

    session.commands.handle("submit", (data, meta, current, priv) => this.onSubmit(data, meta.from, current as unknown as GameState, priv.assignments));
    session.commands.handle("advance", (data, _meta, current, priv) => this.onAdvance(data, current as unknown as GameState, priv.assignments));

    session.on("img", (data, meta) => this.onImage(data, meta.from));
    session.on("ack", (data) => this.onAck(data));
    session.on("need", (data, meta) => this.onNeed(data, meta.from));
    session.on("resync", () => this.resendAll());
    session.on("text", (data, meta) => this.onText(data, meta.from));
    session.on("react", (data, meta) => this.onReact(data, meta.from));
    session.on("vote", (data, meta) => this.onVote(data, meta.from));
    session.on("tile", (data) => this.onTile(data));
  }

  // ── React glue ────────────────────────────────────────────────────────────

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  getVersion = () => this.version;

  private bump() {
    this.version++;
    for (const listener of this.listeners) listener();
  }

  // ── Derived facts ─────────────────────────────────────────────────────────

  get isHost() {
    return this.host === this.me;
  }

  get match() {
    return this.state.match;
  }

  get myIndex() {
    return playerIndex(this.state.match, this.me);
  }

  /** The task this player works on now, if any. */
  get task(): TaskSpec | null {
    const { match, round } = this.state;
    if (this.state.phase !== "play" || !match || !round) return null;
    return match.plan.rounds[round.index]?.tasks[this.myIndex] ?? null;
  }

  /** This round's prompt text, only once the assignment for this very round has arrived. */
  get prompt(): string | null {
    const { match, round } = this.state;
    const a = this.assignment;
    if (!a || !match || !round || a.match !== match.id || a.round !== round.index) return null;
    return a.prompt;
  }

  get roundRule(): RoundRule | null {
    const { match, round } = this.state;
    return match && round ? match.plan.rounds[round.index]?.rule ?? null : null;
  }

  now() {
    return this.session.now();
  }

  isConnected(id: string) {
    return this.people.some((p) => p.id === id && p.connected);
  }

  /** People in the channel who can play the next match. */
  lobbyPlayers(): Player[] {
    return rosterFor(this.people);
  }

  picture(key: string): Picture | undefined {
    return this.pictures.get(key);
  }

  textOf(key: string): string | undefined {
    return this.state.texts[key] ?? this.texts.get(key) ?? (this.assignment?.own?.[key]);
  }

  // ── State changes ─────────────────────────────────────────────────────────

  private onState(next: GameState) {
    const previous = this.state;
    this.state = { ...initialState(), ...next };
    const matchId = this.state.match?.id ?? "";
    if (matchId !== this.heldMatch) {
      this.heldMatch = matchId;
      this.pictures.clear();
      this.texts.clear();
      this.tiles.clear();
      this.submitted.clear();
      this.asked.clear();
    }
    // A different store means the host lost what it held (reload or a new host): send ours back.
    if (this.state.store && this.state.store !== this.storeSeen) {
      const hadOne = this.storeSeen !== "";
      this.storeSeen = this.state.store;
      if (hadOne && !this.isHost && this.state.match) this.resendAll();
    }
    if (previous.round?.index !== this.state.round?.index || previous.phase !== this.state.phase) this.tiles.clear();
    this.bump();
    this.hostChecks();
    this.armGuestTimer();
    this.wantMissing();
  }

  private adoptOwn() {
    const own = this.assignment?.own;
    if (!own || this.assignment?.match !== this.state.match?.id) return;
    for (const [key, text] of Object.entries(own)) if (!this.texts.has(key)) this.texts.set(key, text);
  }

  // ── Host duties ───────────────────────────────────────────────────────────

  private async hostChecks() {
    if (!this.isHost) {
      if (this.hostTimer) clearTimeout(this.hostTimer);
      this.hostTimer = null;
      return;
    }
    if (this.state.store !== this.bootId) await this.takeOverStore();
    this.armHostTimer();
  }

  private takingOver = false;

  /** This tab is host but the pictures live elsewhere (reload or failover): rebuild and ask for them. */
  private async takeOverStore() {
    if (this.takingOver) return;
    this.takingOver = true;
    try {
      if (this.state.match) {
        try {
          const checkpoint = await this.session.assignments.checkpoint();
          const match = this.state.match;
          for (const [id, value] of Object.entries(checkpoint.assignments)) {
            const assignment = value as unknown as Assignment | null;
            if (assignment?.match !== match.id) continue;
            for (const [key, text] of Object.entries(assignment.own ?? {})) this.texts.set(key, text);
            // The prompt a player holds is someone else's sentence, possibly by a player who already left.
            const task = match.plan.rounds[assignment.round]?.tasks[playerIndex(match, id)];
            if (task?.prompt && typeof assignment.prompt === "string") {
              const key = pageKey(task.prompt);
              if (!this.texts.has(key)) this.texts.set(key, assignment.prompt);
            }
          }
        } catch (error) {
          console.warn("Could not read the assignment checkpoint", error);
        }
      }
      // Everyone watches `store` and sends their pages back when it changes.
      await this.session.state.set({ store: this.bootId } as never);
    } catch (error) {
      console.warn("Could not claim the store", error);
    } finally {
      this.takingOver = false;
    }
  }

  private advanceSeq = 0;

  /** Ask the host to close the round. Each request gets a fresh id: the room caches every outcome per id. */
  private requestAdvance(matchId: string, round: number) {
    const id = `${matchId}-adv-${round}-${this.bootId.slice(0, 4)}${++this.advanceSeq}`;
    void this.session.commands.submit("advance", { match: matchId, round }, { id }).catch(() => {});
  }

  /** Someone left mid-round and everyone still here has handed in: move on now. */
  private checkLeavers() {
    const { phase, round, match } = this.state;
    if (!this.isHost || phase !== "play" || !round || !match || this.now() < round.startsAt) return;
    if (this.state.done.length && this.allDone(this.state, this.state.done)) this.requestAdvance(match.id, round.index);
  }

  private armHostTimer() {
    if (this.hostTimer) clearTimeout(this.hostTimer);
    this.hostTimer = null;
    const { phase, round, match } = this.state;
    if (phase !== "play" || !round || !match || !this.isHost) return;
    const wait = Math.max(0, round.endsAt + LATE_GRACE_MS - this.now());
    this.hostTimer = setTimeout(() => this.requestAdvance(match.id, round.index), wait + 50);
  }

  /** Any player can ask to move on once the deadline has passed (a hidden host tab sleeps). */
  private armGuestTimer() {
    if (this.guestTimer) clearTimeout(this.guestTimer);
    this.guestTimer = null;
    const { phase, round, match } = this.state;
    if (phase !== "play" || !round || !match || this.isHost || this.myIndex < 0) return;
    const wait = Math.max(0, round.endsAt + LATE_GRACE_MS + 4000 - this.now());
    this.guestTimer = setTimeout(() => this.requestAdvance(match.id, round.index), wait);
  }

  private allDone(state: GameState, done: string[]) {
    const players = state.match?.players ?? [];
    if (players.every((p) => done.includes(p.id))) return true;
    // People who left the channel are not waited for.
    return players.every((p) => done.includes(p.id) || !this.isConnected(p.id));
  }

  private onSubmit(data: JsonValue, from: string, state: GameState, assignments: Record<string, JsonValue>) {
    const input = (data ?? {}) as { match?: string; round?: number; key?: string; text?: string; hash?: string };
    const { match, round } = state;
    if (state.phase !== "play" || !match || !round || input.match !== match.id || input.round !== round.index) return { result: "stale" };
    const index = playerIndex(match, from);
    if (index < 0) return { result: "not-player" };
    const task = match.plan.rounds[round.index].tasks[index];
    const key = pageKey(task);
    if (input.key !== key) return { result: "stale" };
    const nextAssignments: Record<string, JsonValue> = {};
    if (task.output === "text") {
      const text = cleanText(input.text ?? "", match.plan.rounds[round.index].rule);
      this.texts.set(key, text);
      const previous = assignments[from] as unknown as Assignment | null;
      const own = previous?.match === match.id ? { ...previous.own } : {};
      own[key] = text;
      nextAssignments[from] = { match: match.id, round: round.index, prompt: previous?.match === match.id ? previous.prompt : null, own } as unknown as JsonValue;
    } else {
      const picture = this.pictures.get(key);
      if (!picture || picture.hash !== input.hash) return { result: "resend" };
    }
    const done = state.done.includes(from) ? state.done : [...state.done, from];
    if (this.allDone(state, done)) {
      const merged = { ...assignments, ...nextAssignments };
      const decision = this.advance(state, merged);
      return { ...decision, assignments: { ...nextAssignments, ...(decision.assignments ?? {}) }, result: "ok" };
    }
    return { patch: { done } as never, assignments: nextAssignments, result: "ok" };
  }

  private onAdvance(data: JsonValue, state: GameState, assignments: Record<string, JsonValue>) {
    const input = (data ?? {}) as { match?: string; round?: number };
    const { match, round } = state;
    if (state.phase !== "play" || !match || !round || input.match !== match.id || input.round !== round.index) return { result: "stale" };
    if (this.now() < round.endsAt + LATE_GRACE_MS - 500 && !this.allDone(state, state.done)) return { result: "early" };
    return { ...this.advance(state, assignments), result: "ok" };
  }

  /** Close the current round: mark missing pages empty, then deal the next round or open the reveal. */
  private advance(state: GameState, assignments: Record<string, JsonValue>) {
    const match = state.match!;
    const round = state.round!;
    const plan = match.plan;
    const empty = [...state.empty];
    plan.rounds[round.index].tasks.forEach((task, i) => {
      const key = pageKey(task);
      const has = task.output === "text" ? this.texts.has(key) : this.pictures.has(key);
      const handedIn = state.done.includes(match.players[i].id);
      if (!has || !handedIn) {
        if (task.output === "text" && !this.texts.has(key)) this.texts.set(key, "");
        if (!has && !empty.includes(key)) empty.push(key);
      }
    });
    const next = round.index + 1;
    if (next < plan.rounds.length) {
      const startsAt = this.now() + COUNTDOWN_MS;
      const nextAssignments: Record<string, JsonValue> = {};
      // Only seated people can receive an assignment; someone who left would make the room refuse the whole decision.
      const seated = new Set(this.session.seats.get());
      plan.rounds[next].tasks.forEach((task, i) => {
        const id = match.players[i].id;
        if (!seated.has(id)) return;
        const previous = assignments[id] as unknown as Assignment | null;
        const own = previous?.match === match.id ? previous.own : {};
        const prompt = task.prompt ? this.texts.get(pageKey(task.prompt)) ?? "" : null;
        nextAssignments[id] = { match: match.id, round: next, prompt, own } as unknown as JsonValue;
      });
      setTimeout(() => this.deliverTaskPictures(next), 200);
      return {
        patch: { round: { index: next, startsAt, endsAt: startsAt + plan.rounds[next].seconds * 1000 }, done: [], empty } as never,
        assignments: nextAssignments,
      };
    }
    const first = revealOrder(plan)[0];
    const texts = this.textsFor(first?.keys ?? []);
    setTimeout(() => this.broadcastPictures(first?.keys ?? []), 200);
    return { patch: { phase: "reveal", round: null, done: [], empty, reveal: { index: 0 }, texts } as never };
  }

  private textsFor(keys: string[], base: Record<string, string> = {}) {
    const out = { ...base };
    for (const key of keys) {
      const text = this.texts.get(key);
      if (text !== undefined) out[key] = text;
    }
    return out;
  }

  /** Send each player the pictures their new task shows. */
  private deliverTaskPictures(round: number) {
    const match = this.state.match;
    if (!match || !this.isHost) return;
    match.players.forEach((player, i) => {
      if (player.id === this.me) return;
      for (const key of taskImageRefs(match.plan, round, i)) this.sendPicture(key, player.id);
    });
  }

  private broadcastPictures(keys: string[]) {
    for (const key of keys) this.sendPicture(key);
  }

  private sendPicture(key: string, to?: string) {
    const picture = this.pictures.get(key);
    const match = this.state.match;
    if (!picture || !match) return;
    const header: ImgHeader = { match: match.id, key, hash: picture.hash, mime: picture.mime };
    this.queue({ kind: "img", data: pack(header, picture.bytes), to });
  }

  // ── Host: settings, start, reveal ─────────────────────────────────────────

  async setSettings(settings: MatchSettings) {
    if (!this.isHost) return;
    await this.session.state.set({ settings } as never);
  }

  async start() {
    if (!this.isHost || this.state.phase !== "lobby") return;
    const players = this.lobbyPlayers();
    const matchId = randomId();
    await this.session.state.set({ ...startPatch(this.state.settings, players, matchId, this.now()), store: this.bootId } as never);
  }

  async revealStep(delta: 1 | -1) {
    const { match, reveal } = this.state;
    if (!this.isHost || !match || !reveal || this.state.phase !== "reveal") return;
    const order = revealOrder(match.plan);
    const index = reveal.index + delta;
    if (index < 0) return;
    if (index >= order.length) {
      const all = order.flatMap((step) => step.keys);
      await this.session.state.set({ phase: "end", reveal: null, texts: this.textsFor(all, this.state.texts) } as never);
      return;
    }
    const keys = order[index].keys;
    await this.session.state.set({ reveal: { index }, texts: this.textsFor(keys, this.state.texts) } as never);
    if (delta > 0) this.broadcastPictures(keys);
  }

  async backToLobby() {
    if (!this.isHost) return;
    await this.session.state.set({ phase: "lobby", match: null, round: null, done: [], reveal: null, texts: {}, empty: [], votes: {} } as never);
  }

  /** Reopen the reveal from the end screen at a given album. */
  async replayAlbum(album: number) {
    const match = this.state.match;
    if (!this.isHost || !match) return;
    const index = revealOrder(match.plan).findIndex((step) => step.album === album);
    if (index < 0) return;
    await this.session.state.set({ phase: "reveal", reveal: { index } } as never);
    this.broadcastPictures(revealOrder(match.plan).filter((s) => s.album === album).flatMap((s) => s.keys));
  }

  // ── Player: handing in ────────────────────────────────────────────────────

  async submitText(text: string) {
    const { match, round } = this.state;
    const task = this.task;
    if (!match || !round || !task) return;
    const key = pageKey(task);
    const clean = cleanText(text, this.roundRule);
    this.texts.set(key, clean);
    this.submitted.add(key);
    this.bump();
    await this.submitWithRetry({ match: match.id, round: round.index, key, text: clean }, key);
  }

  async submitPicture(bytes: Uint8Array, mime: string) {
    const { match, round } = this.state;
    const task = this.task;
    if (!match || !round || !task) return;
    const key = pageKey(task);
    const hash = hashBytes(bytes);
    this.storePicture(key, hash, mime, bytes);
    this.submitted.add(key);
    this.bump();
    if (!this.isHost) await this.deliverOwn(key);
    else this.backupOwn(key);
    await this.submitWithRetry({ match: match.id, round: round.index, key, hash }, key);
  }

  private async submitWithRetry(data: { match: string; round: number; key: string; text?: string; hash?: string }, key: string) {
    for (let attempt = 0; attempt < 6; attempt++) {
      if (this.state.match?.id !== data.match || this.state.round?.index !== data.round) return;
      try {
        const result = await this.session.commands.submit("submit", data, { id: `${data.match}-${data.round}-${attempt}` });
        if (result !== "resend") return;
        await this.deliverOwn(key);
      } catch (error) {
        console.warn("Submit failed", error);
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
    }
  }

  /** Send one of my pictures to the host and wait for the acknowledgement. */
  private async deliverOwn(key: string) {
    const host = this.host;
    if (!host || host === this.me) return;
    for (let attempt = 0; attempt < 5; attempt++) {
      const acked = new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => { this.acks.delete(key); resolve(false); }, 2500);
        this.acks.set(key, () => { clearTimeout(timer); resolve(true); });
      });
      this.sendPicture(key, host);
      if (await acked) return;
    }
  }

  /** The host keeps its own pictures only in memory: leave a copy with another player in case this tab reloads. */
  private backupOwn(key: string) {
    const peer = this.state.match?.players.find((p) => p.id !== this.me && this.isConnected(p.id));
    if (peer) this.sendPicture(key, peer.id);
  }

  private storePicture(key: string, hash: string, mime: string, bytes: Uint8Array) {
    this.pictures.set(key, { key, hash, mime, bytes });
  }

  // ── Messages ──────────────────────────────────────────────────────────────

  private onImage(data: JsonValue | Uint8Array, from: string) {
    if (!(data instanceof Uint8Array)) return;
    const packet = unpack<ImgHeader>(data);
    const match = this.state.match;
    if (!packet || !match || packet.header.match !== match.id) return;
    const { key, mime } = packet.header;
    const hash = hashBytes(packet.payload);
    if (hash !== packet.header.hash) return;
    if (!this.pictures.has(key) || this.pictures.get(key)!.hash !== hash) {
      // Only the author may replace a picture the host already holds.
      const author = match.players[match.plan.albums[parseKey(key).album]?.authors[parseKey(key).page] ?? -1]?.id;
      if (!this.pictures.has(key) || author === from) this.storePicture(key, hash, mime, packet.payload);
      this.bump();
    }
    if (this.isHost && from !== this.me) this.queue({ kind: "ack", data: { match: match.id, key, hash }, to: from });
  }

  private onAck(data: JsonValue | Uint8Array) {
    if (data instanceof Uint8Array) return;
    const input = data as { key?: string };
    if (input?.key) this.acks.get(input.key)?.();
  }

  private onText(data: JsonValue | Uint8Array, from: string) {
    if (!this.isHost || data instanceof Uint8Array) return;
    const input = data as { match?: string; key?: string; text?: string };
    const match = this.state.match;
    if (!match || input.match !== match.id || !input.key || typeof input.text !== "string") return;
    const { album, page } = parseKey(input.key);
    const author = match.players[match.plan.albums[album]?.authors[page] ?? -1]?.id;
    if (author === from && !this.texts.has(input.key)) this.texts.set(input.key, cleanText(input.text, null));
  }

  private onNeed(data: JsonValue | Uint8Array, from: string) {
    if (!this.isHost || data instanceof Uint8Array) return;
    const input = data as { match?: string; keys?: string[] };
    const match = this.state.match;
    if (!match || input.match !== match.id || !Array.isArray(input.keys)) return;
    const allowed = new Set<string>();
    if (this.state.phase === "play" && this.state.round) {
      for (const key of taskImageRefs(match.plan, this.state.round.index, playerIndex(match, from))) allowed.add(key);
    } else if (this.state.phase === "reveal" && this.state.reveal) {
      for (const key of revealedKeys(match.plan, this.state.reveal.index)) allowed.add(key);
    } else if (this.state.phase === "end") {
      for (const step of revealOrder(match.plan)) step.keys.forEach((key) => allowed.add(key));
    }
    for (const key of input.keys.slice(0, 40)) if (allowed.has(key)) this.sendPicture(key, from);
  }

  /** Ask the host for pictures this screen shows but this tab lacks. */
  want(keys: string[]) {
    let added = false;
    for (const key of keys) {
      if (this.pictures.has(key) || this.state.empty.includes(key)) continue;
      const asked = this.asked.get(key) ?? 0;
      if (asked >= 6) continue;
      this.asked.set(key, asked + 1);
      this.wanted.add(key);
      added = true;
    }
    if (!added || this.wantTimer) return;
    this.wantTimer = setTimeout(() => {
      this.wantTimer = null;
      const keys = [...this.wanted].filter((key) => !this.pictures.has(key));
      this.wanted.clear();
      const match = this.state.match;
      if (!keys.length || !match || !this.host || this.isHost) return;
      this.queue({ kind: "need", data: { match: match.id, keys }, to: this.host });
      // Ask again later if they still haven't arrived.
      setTimeout(() => this.want(keys), 3000);
    }, 600);
  }

  private wantMissing() {
    const { match, phase, round, reveal } = this.state;
    if (!match || this.isHost) return;
    if (phase === "play" && round && this.myIndex >= 0) this.want(taskImageRefs(match.plan, round.index, this.myIndex));
    if (phase === "reveal" && reveal) this.want(revealedKeys(match.plan, reveal.index));
  }

  /** The host changed or reloaded: hand back every page this tab holds. */
  private resendAll() {
    const match = this.state.match;
    const host = this.host;
    if (!match || !host || host === this.me) return;
    for (const key of this.pictures.keys()) this.sendPicture(key, host);
    for (const [key, text] of this.texts) {
      const { album, page } = parseKey(key);
      if (match.players[match.plan.albums[album]?.authors[page] ?? -1]?.id === this.me) {
        this.queue({ kind: "text", data: { match: match.id, key, text }, to: host });
      }
    }
  }

  // ── Reactions, votes, live tiles ──────────────────────────────────────────

  react(stamp: string) {
    this.queue({ kind: "react", data: { stamp } });
    this.onReact({ stamp }, this.me);
  }

  private onReact(data: JsonValue | Uint8Array, from: string) {
    if (data instanceof Uint8Array) return;
    const stamp = (data as { stamp?: string })?.stamp;
    if (!stamp || !["laugh", "love", "wow", "fire", "clap"].includes(stamp)) return;
    const at = Date.now();
    this.reactions = [...this.reactions.filter((r) => at - r.at < 2600), { id: ++this.reactionId, stamp, from, at }];
    this.bump();
  }

  vote(key: string, on: boolean) {
    const match = this.state.match;
    if (!match) return;
    if (this.isHost) void this.applyVote(key, this.me, on);
    else if (this.host) this.queue({ kind: "vote", data: { match: match.id, key, on }, to: this.host });
  }

  private onVote(data: JsonValue | Uint8Array, from: string) {
    if (!this.isHost || data instanceof Uint8Array) return;
    const input = data as { match?: string; key?: string; on?: boolean };
    if (input.match !== this.state.match?.id || !input.key) return;
    void this.applyVote(input.key, from, !!input.on);
  }

  private async applyVote(key: string, voter: string, on: boolean) {
    const match = this.state.match;
    if (!match || playerIndex(match, voter) < 0) return;
    const { album, page } = parseKey(key);
    if (match.players[match.plan.albums[album]?.authors[page] ?? -1]?.id === voter) return;
    await this.session.state.set((current) => {
      const state = current as unknown as GameState;
      const voters = new Set(state.votes?.[key] ?? []);
      if (on === voters.has(voter)) return undefined;
      if (on) voters.add(voter);
      else voters.delete(voter);
      return { votes: { ...(state.votes ?? {}), [key]: [...voters] } } as never;
    });
  }

  /** Mosaic: share a low-quality snapshot of my tile so neighbours can line up. */
  shareTile(bytes: Uint8Array, mime: string) {
    const { match, round } = this.state;
    const task = this.task;
    if (!match || !round || !task?.tile) return;
    const header: TileHeader = { match: match.id, round: round.index, tile: task.tile.index, hash: hashBytes(bytes), mime };
    this.session.send("tile", pack(header, bytes), { latest: true });
  }

  private onTile(data: JsonValue | Uint8Array) {
    if (!(data instanceof Uint8Array)) return;
    const packet = unpack<TileHeader>(data);
    const { match, round } = this.state;
    if (!packet || !match || !round || packet.header.match !== match.id || packet.header.round !== round.index) return;
    const key = `${round.index}:${packet.header.tile}`;
    this.tiles.set(key, { key, hash: packet.header.hash, mime: packet.header.mime, bytes: packet.payload });
    this.bump();
  }

  // ── Outbox ────────────────────────────────────────────────────────────────

  private queue(message: Outgoing) {
    this.outbox.push(message);
    void this.pump();
  }

  /** Paced sending: the room allows 96 messages a second and 32 queued per peer. */
  private async pump() {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (this.outbox.length) {
        const message = this.outbox[0];
        const ok = this.session.send(message.kind, message.data as JsonValue, { to: message.to, latest: message.latest });
        if (!ok) {
          if (this.session.connection.get() === "closed") break;
          await new Promise((resolve) => setTimeout(resolve, 250));
          continue;
        }
        this.outbox.shift();
        await new Promise((resolve) => setTimeout(resolve, 30));
      }
    } finally {
      this.pumping = false;
    }
  }
}
