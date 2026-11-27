import { createContext, useContext, useSyncExternalStore } from "react";
import type { Game } from "../net/game.ts";

export const GameContext = createContext<Game | null>(null);

/** The game, re-rendering whenever anything in it changes. */
export function useGame(): Game {
  const game = useContext(GameContext);
  if (!game) throw new Error("useGame outside GameContext");
  useSyncExternalStore(game.subscribe, game.getVersion);
  return game;
}

export interface Prefs {
  lang: "pl" | "en";
  sound: number;
  lessMotion: boolean;
}

export interface PrefsApi {
  prefs: Prefs;
  setPrefs: (next: Partial<Prefs>) => void;
  openMenu: () => void;
}

export const PrefsContext = createContext<PrefsApi | null>(null);

export function usePrefs(): PrefsApi {
  const value = useContext(PrefsContext);
  if (!value) throw new Error("usePrefs outside PrefsContext");
  return value;
}
