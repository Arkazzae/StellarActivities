/**
 * The parts of the Stellarr activity SDK this game uses, typed against the host's
 * own `sdk/client.d.ts` (the npm package lags behind the host build).
 */

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type ActivityState = Record<string, JsonValue>;
export type Unsubscribe = () => void;

export interface Observable<T> {
  get(): T;
  subscribe(listener: (value: T) => void): Unsubscribe;
}

export interface Participant {
  id: string;
  username?: string;
  name: string;
  avatar: string | null;
  connected: boolean;
}

export type DeviceClass = "desktop" | "tablet" | "phone";

export interface ActivityContext {
  standalone: boolean;
  launchMode: "voice" | "personal";
  sessionId: string;
  me: Participant;
  place: { id: string } | null;
  locale: string;
  device: DeviceClass;
}

/**
 * Why a `media.gifs` call was refused: `permission` (manifest lacks `media.gifs`),
 * `unavailable` (the instance offers no GIFs), `declined` (this player turned GIPHY off),
 * `rateLimited`, `notFound` or `failed`.
 */
export type GifErrorCode = "permission" | "unavailable" | "declined" | "rateLimited" | "notFound" | "failed";
export interface GifItem { id: string; alt?: string; width: number; height: number }
export interface GifPage { items: GifItem[]; offset: number; total: number }
export interface GifImage {
  /** A `blob:` URL made in this frame from bytes the host sent. */
  url: string;
  type: string;
  width: number;
  height: number;
  alt?: string;
  release(): void;
}

export interface CommandDecision<S> {
  patch?: Partial<S>;
  result?: JsonValue;
  assignments?: Record<string, JsonValue>;
}

export type CommandHandler<S> = (
  data: JsonValue,
  meta: { id: string; from: string },
  currentState: S,
  privateState: { assignments: Record<string, JsonValue> },
) => CommandDecision<S> | void | Promise<CommandDecision<S> | void>;

export interface Session<S extends ActivityState = ActivityState> {
  context: ActivityContext;
  limits: { stateBytes: number; messageBytes: number; writesPerSecond: number; messagesPerSecond: number; graceSeconds: number; emptySeconds: number; maxParticipants: number };
  capabilities: string[];
  now(): number;
  close(): Promise<void>;
  connection: Observable<"connected" | "reconnecting" | "closed">;
  locale: Observable<string>;
  device: Observable<DeviceClass>;
  progress: {
    load(): Promise<{ revision: number; data: ActivityState | null }>;
    save(data: ActivityState, expectedRevision: number): Promise<number>;
  };
  media: {
    volume: Observable<number>;
    /** Requires `media.gifs` in the manifest. An empty query lists trending GIFs. */
    gifs: {
      search(query?: string, options?: { offset?: number; limit?: number }): Promise<GifPage>;
      load(id: string, size?: "preview" | "full"): Promise<GifImage>;
    };
  };
  participants: Observable<Participant[]>;
  send(kind: string, data: JsonValue | ArrayBuffer | ArrayBufferView, options?: { to?: string; latest?: boolean }): boolean;
  on(kind: string, listener: (data: JsonValue | Uint8Array, meta: { from: string }) => void): Unsubscribe;
  state: {
    get(): S;
    subscribe(listener: (state: S, revision: number) => void): Unsubscribe;
    set(patch: Partial<S>): Promise<number>;
    set(change: (current: S) => Partial<S> | void): Promise<number | undefined>;
  };
  seats: Observable<string[]> & { claim(): Promise<void>; release(): Promise<void> };
  assignments: Observable<JsonValue> & {
    checkpoint(): Promise<{ revision: number; state: S; assignments: Record<string, JsonValue> }>;
  };
  host: Observable<string | null>;
  commands: {
    handle(kind: string, handler: CommandHandler<S>): Unsubscribe;
    submit(kind: string, data: JsonValue, options?: { id?: string }): Promise<JsonValue | undefined>;
  };
}
