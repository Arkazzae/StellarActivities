/**
 * The room: routes commands to the rules, nudges deadlines, carries stickers and keeps the
 * GIF images this tab has loaded.
 *
 * - Shared state is public; a player's GIF and vote live in their own assignment, which only
 *   they and the host see. A new host reads everyone's from the checkpoint.
 * - Only the host nudges a deadline, once per phase, with a stable command id.
 * - Stickers are `send` messages, never commands, so they don't fill the room's ledger.
 */
import {
  advance,
  castVote,
  endMatch,
  liveAssignment,
  offerGifs,
  Refusal,
  startMatch,
  submitCaption,
  submitGif,
  toLobby,
  updateSettings,
  voteTopic,
  type Decision,
  type Room,
} from "../game/rules.ts";
import { pick, rng, shortId, shuffle } from "../game/random.ts";
import { MAX_PLAYERS, type Assignment, type GameState, type GifRef, type Player, type Settings } from "../game/types.ts";
import type { ActivityState, GifErrorCode, GifImage, GifPage, JsonValue, Participant, Session } from "../stellarr/types.ts";
import { isErrorCode, langOf, translate, type Key, type Lang } from "../i18n/index.ts";

export const STICKERS = ["haha", "10na10", "nieee", "pff", "brawo"] as const;
export type StickerKind = (typeof STICKERS)[number];

export interface FlyingSticker {
  id: number;
  kind: StickerKind;
  from: string;
  meme: string;
  at: number;
}

export type GifProblem = GifErrorCode | null;

const TIMED = new Set(["topic", "search", "reveal", "vote", "results"]);
const STICKER_LIFE_MS = 3_800;

const errorCode = (error: unknown): GifErrorCode =>
  ((error as { code?: string })?.code as GifErrorCode) ?? "failed";

export class Game {
  state: GameState;
  people: Participant[] = [];
  seats: string[] = [];
  host: string | null = null;
  mine: unknown = null;
  connection: "connected" | "reconnecting" | "closed" = "connected";
  device: "desktop" | "tablet" | "phone";
  /** The last refusal or failure, shown as a toast. */
  notice: { text: string; at: number } | null = null;
  stickers: FlyingSticker[] = [];
  stickerCounts: Record<string, Record<string, number>> = {};
  /** Set when this player's GIFs are off or the instance has none. */
  gifProblem: GifProblem = null;
  /** This player's language, from their Stellarr interface. */
  lang: Lang = "pl";

  t = (key: Key, params?: Record<string, string | number>) => translate(this.lang, key, params);

  private version = 0;
  private listeners = new Set<() => void>();
  private nudged = "";
  private offered = "";
  private probedAt = 0;
  private stickerSeq = 0;
  private images = new Map<string, Promise<GifImage>>();
  private loaded = new Map<string, GifImage>();

  constructor(readonly session: Session<ActivityState>) {
    this.state = session.state.get() as unknown as GameState;
    this.device = session.context.device;
    this.lang = langOf(session.context.locale);
    session.state.subscribe((state) => {
      this.state = state as unknown as GameState;
      this.forget();
      this.bump();
    });
    session.participants.subscribe((people) => { this.people = people; this.bump(); });
    session.seats.subscribe((seats) => { this.seats = seats; this.bump(); });
    session.host.subscribe((host) => { this.host = host; this.bump(); });
    session.assignments.subscribe((value) => { this.mine = value; this.bump(); });
    session.connection.subscribe((status) => { this.connection = status; this.bump(); });
    session.device.subscribe((device) => { this.device = device; this.bump(); });
    session.locale.subscribe((locale) => {
      this.lang = langOf(locale);
      document.documentElement.lang = this.lang;
      this.bump();
    });

    const handle = (kind: string, decide: (data: JsonValue, from: string, state: GameState, assignments: Record<string, JsonValue>, id: string) => Decision) =>
      session.commands.handle(kind, (data, meta, current, priv) => {
        try {
          return decide(data, meta.from, current as unknown as GameState, priv.assignments, meta.id) as unknown as ReturnType<Parameters<typeof session.commands.handle>[1]>;
        } catch (error) {
          if (error instanceof Refusal) throw new Error(error.message);
          throw error;
        }
      });

    handle("settings", (data, from, state) => updateSettings(state, data, from === this.session.host.get()));
    // The match id comes from the command id, so a retried start decides the same match.
    handle("start", (_data, from, state, _assignments, id) => startMatch(state, this.roster(), `m${shortId(id)}`, this.session.now(), from === this.session.host.get()));
    handle("lobby", (_data, from, state) => toLobby(state, from === this.session.host.get()));
    handle("end", (_data, from, state) => endMatch(state, from === this.session.host.get(), this.session.now()));
    handle("topic", (data, from, state) => voteTopic(state, from, data, this.room()));
    handle("gif", (data, from, state, assignments) => submitGif(state, from, data, this.room(), assignments));
    handle("caption", (data, from, state, assignments) => submitCaption(state, from, data, this.room(), assignments));
    handle("gifs", (data, from, state) => offerGifs(state, data, from === this.session.host.get()));
    handle("vote", (data, from, state, assignments) => castVote(state, from, data, this.room(), assignments));
    handle("advance", (data, _from, state, assignments) => advance(state, data, this.room(), assignments));

    session.on("sticker", (data, meta) => this.receiveSticker(data, meta.from));

    setInterval(() => this.tick(), 250);
  }

  // ------------------------------------------------------------ store plumbing

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  getVersion = () => this.version;

  private bump() {
    this.version++;
    for (const listener of this.listeners) listener();
  }

  now() {
    return this.session.now();
  }

  // ------------------------------------------------------------ who is who

  get me() {
    return this.session.context.me.id;
  }

  get isHost() {
    return this.host === this.me;
  }

  /** Whether this tab plays in the running match (late joiners watch). */
  get playing() {
    return !!this.state.match?.players.some((p) => p.id === this.me);
  }

  get assignment(): Assignment | null {
    return liveAssignment(this.mine, this.state);
  }

  connected(id: string) {
    return this.people.some((p) => p.id === id && p.connected);
  }

  /** Who would play if the match started now: connected seated people, in join order. */
  roster(): Player[] {
    const seated = new Set(this.session.seats.get());
    return this.session.participants
      .get()
      .filter((p) => p.connected && (seated.size === 0 || seated.has(p.id)))
      .slice(0, MAX_PLAYERS)
      .map(({ id, name, avatar }) => ({ id, name, avatar }));
  }

  player(id: string): Player | Participant | undefined {
    return this.state.match?.players.find((p) => p.id === id) ?? this.people.find((p) => p.id === id);
  }

  private room(): Room {
    return { now: this.session.now(), connected: this.session.participants.get().filter((p) => p.connected).map((p) => p.id) };
  }

  // ------------------------------------------------------------ actions

  private async submit(kind: string, data: JsonValue, id?: string) {
    try {
      return await this.session.commands.submit(kind, data, id ? { id } : undefined);
    } catch (error) {
      const code = (error as Error)?.message ?? "";
      this.say(isErrorCode(code) ? this.t(`err.${code}`) : this.t("generic"));
      return undefined;
    }
  }

  say(text: string) {
    this.notice = { text, at: Date.now() };
    this.bump();
  }

  /** Sends only the changed field: the host merges it into the current settings, so quick clicks don't undo each other. */
  setSettings(change: Partial<Settings>) {
    return this.submit("settings", change as unknown as JsonValue);
  }

  start() {
    return this.submit("start", null);
  }

  toLobby() {
    return this.submit("lobby", null);
  }

  endMatch() {
    return this.submit("end", null);
  }

  voteTopic(choice: number) {
    return this.submit("topic", choice);
  }

  sendGif(gif: GifRef) {
    return this.submit("gif", gif as unknown as JsonValue);
  }

  vote(key: string) {
    return this.submit("vote", key);
  }

  sendCaption(text: string) {
    return this.submit("caption", text);
  }

  /**
   * Napisy: the host looks for two GIFs to vote on. GIPHY searches in the player's language,
   * so the seed words are short reactions that work in any.
   */
  private async offerRoundGifs(key: string) {
    const WORDS = ["reaction", "shocked", "dance", "fail", "cat", "dog", "wow", "awkward", "laugh", "facepalm", "oops", "confused", "excited", "sleepy", "dramatic", "celebrate"];
    const random = rng(`${key}:words`);
    const page = await this.session.media.gifs.search(pick(WORDS, random), { limit: 12 });
    const items = shuffle(page.items, random).slice(0, 2);
    if (items.length === 0) throw new Error("no GIFs");
    await this.session.commands.submit("gifs", items.map((it) => ({ id: it.id, w: it.width, h: it.height, ...(it.alt ? { alt: it.alt } : {}) })), { id: `gifs-${key}` });
  }

  // ------------------------------------------------------------ deadlines

  private tick() {
    const s = this.state;
    if (this.isHost && s.match && s.phase === "topic" && s.settings.mode === "napisy" && s.gifChoices.length === 0) {
      const key = `${s.match.id}:${s.round}`;
      if (this.offered !== key) {
        this.offered = key;
        this.offerRoundGifs(key).catch(() => setTimeout(() => { if (this.offered === key) this.offered = ""; }, 3_000));
      }
    }
    if (this.isHost && s.match && TIMED.has(s.phase) && this.session.now() >= s.endsAt + 150) {
      const key = `${s.match.id}:${s.round}:${s.phase}`;
      if (this.nudged !== key) {
        this.nudged = key;
        void this.session.commands
          .submit("advance", { match: s.match.id, round: s.round, phase: s.phase }, { id: `adv-${key}` })
          .catch(() => { if (this.nudged === key) this.nudged = ""; });
      }
    }
    const cut = Date.now() - STICKER_LIFE_MS;
    if (this.stickers.some((st) => st.at < cut)) {
      this.stickers = this.stickers.filter((st) => st.at >= cut);
      this.bump();
    }
  }

  // ------------------------------------------------------------ stickers

  /** Throws a sticker on the meme being shown: everyone else gets a message, this tab shows it at once. */
  throwSticker(kind: StickerKind, meme: string) {
    if (!this.addSticker({ kind, meme }, this.me)) return;
    this.session.send("sticker", { kind, meme });
  }

  private receiveSticker(data: JsonValue | Uint8Array, from: string) {
    if (from === this.me) return;
    this.addSticker(data, from);
  }

  private addSticker(data: JsonValue | Uint8Array, from: string) {
    if (!data || typeof data !== "object" || data instanceof Uint8Array) return false;
    const { kind, meme } = data as { kind?: string; meme?: string };
    if (!STICKERS.includes(kind as StickerKind) || typeof meme !== "string") return false;
    // One sticker per player every 0.7 s, so a held key can't flood the screen.
    if (this.stickers.some((st) => st.from === from && Date.now() - st.at < 700)) return false;
    this.stickers = [...this.stickers.slice(-30), { id: ++this.stickerSeq, kind: kind as StickerKind, from, meme, at: Date.now() }];
    const counts = (this.stickerCounts[meme] ??= {});
    counts[kind as string] = (counts[kind as string] ?? 0) + 1;
    this.bump();
    return true;
  }

  // ------------------------------------------------------------ GIFs

  /**
   * Whether GIFs work for this player, asked with the smallest search. The lobby calls it so
   * that a match doesn't start on an instance without GIFs. At most once every 1.5 s.
   */
  async probeGifs() {
    if (Date.now() - this.probedAt < 1_500) return;
    this.probedAt = Date.now();
    try {
      await this.session.media.gifs.search("", { limit: 1 });
      if (this.gifProblem) { this.gifProblem = null; this.bump(); }
    } catch (error) {
      const code = errorCode(error);
      if (code === "declined" || code === "unavailable" || code === "permission") {
        if (this.gifProblem !== code) { this.gifProblem = code; this.bump(); }
      }
    }
  }

  async search(query: string, offset = 0): Promise<GifPage | null> {
    try {
      // Pages of 12: each result is a load, and a frame may load 120 GIFs a minute.
      const page = await this.session.media.gifs.search(query, { offset, limit: 12 });
      if (this.gifProblem) { this.gifProblem = null; this.bump(); }
      return page;
    } catch (error) {
      const code = errorCode(error);
      if (code === "declined" || code === "unavailable" || code === "permission") { this.gifProblem = code; this.bump(); }
      else if (code === "rateLimited") this.say(this.t("rateLimited"));
      else this.say(this.t("searchFailed"));
      return null;
    }
  }

  /**
   * Search thumbnails wait in their own lane, at most two at a time, so the memes everyone is
   * looking at (full size) get the frame's four load slots first.
   */
  private previewSlots = 2;
  private previewQueue: (() => void)[] = [];

  private async inPreviewLane<T>(work: () => Promise<T>): Promise<T> {
    if (this.previewSlots === 0) await new Promise<void>((go) => this.previewQueue.push(go));
    this.previewSlots--;
    try {
      return await work();
    } finally {
      this.previewSlots++;
      this.previewQueue.shift()?.();
    }
  }

  /** The image for a GIF id, loaded once per size and kept while the round needs it. */
  image(id: string, size: "preview" | "full" = "preview"): Promise<GifImage> {
    const key = `${id}:${size}`;
    let pending = this.images.get(key);
    if (!pending) {
      const load = () => this.session.media.gifs.load(id, size);
      pending = (size === "preview" ? this.inPreviewLane(load) : load()).then(
        (image) => { this.loaded.set(key, image); return image; },
        (error) => {
          this.images.delete(key);
          const code = errorCode(error);
          if (code === "declined" || code === "unavailable") { this.gifProblem = code; this.bump(); }
          throw error;
        },
      );
      this.images.set(key, pending);
    }
    return pending;
  }

  /** Lets go of images no part of the current state shows any more. */
  private forget() {
    const keep = new Set<string>();
    for (const m of this.state.memes) keep.add(m.gif.id);
    for (const g of this.state.gifChoices) keep.add(g.id);
    if (this.state.roundGif) keep.add(this.state.roundGif.id);
    for (const h of this.state.highlights) keep.add(h.gif.id);
    const mine = this.assignment?.gif?.id;
    if (mine) keep.add(mine);
    if (this.state.phase === "search") return;
    for (const [key, image] of this.loaded) {
      if (!keep.has(key.split(":")[0])) {
        image.release();
        this.loaded.delete(key);
        this.images.delete(key);
      }
    }
  }
}
