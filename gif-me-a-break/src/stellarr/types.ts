import type { ActivityState, DevSession, Observable } from "@stellarr/sdk";

export type { ActivityContext, ActivityState, CommandDecision, DeviceClass, JsonValue, Observable,
  Participant, Unsubscribe, GifErrorCode, GifImage, GifItem, GifPage } from "@stellarr/sdk";

export type CommandHandler<S extends ActivityState> = Parameters<DevSession<S>["commands"]["handle"]>[1];

// The offline preview implements only the parts of the host session used by this game.
export type Session<S extends ActivityState = ActivityState> =
  Omit<DevSession<S>, "theme" | "media" | "host"> & {
    media: Pick<DevSession<S>["media"], "volume" | "gifs">;
    host: Observable<string | null>;
  };
