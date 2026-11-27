/**
 * User settings store (Zustand). Saved with the player's Stellarr progress (see src/stellarr/storage),
 * so it follows the account across rooms and devices. The language lives in i18n.
 */

import { create } from "zustand";
import { readSaved, writeSaved } from "@/stellarr/storage";

interface Settings {
  sound: boolean;
  volume: number; // 0-100
  showCoords: boolean;
  showLegalMoves: boolean;
  /** Promote straight to a queen instead of opening the piece picker. */
  autoQueen: boolean;
  premoveEnabled: boolean;
  moveAnimation: boolean;
  /** Let the bots comment on the game in their speech bubble. */
  botChat: boolean;
}

export interface SettingsState extends Settings {
  setSound: (enabled: boolean) => void;
  setVolume: (volume: number) => void;
  setShowCoords: (show: boolean) => void;
  setShowLegalMoves: (show: boolean) => void;
  setAutoQueen: (auto: boolean) => void;
  setPremoveEnabled: (enabled: boolean) => void;
  setMoveAnimation: (enabled: boolean) => void;
  setBotChat: (enabled: boolean) => void;
}

const DEFAULTS: Settings = {
  sound: true,
  volume: 80,
  showCoords: true,
  showLegalMoves: true,
  autoQueen: false,
  premoveEnabled: true,
  moveAnimation: true,
  botChat: true,
};

const KEY = "settings";
const KEYS = Object.keys(DEFAULTS) as (keyof Settings)[];

/** The saved fields of a state, ignoring anything of the wrong type. */
function pick(source: Partial<Record<keyof Settings, unknown>>): Partial<Settings> {
  return Object.fromEntries(KEYS.filter((key) => typeof source[key] === typeof DEFAULTS[key]).map((key) => [key, source[key]]));
}

function load(): Settings {
  try {
    const saved = readSaved(KEY) as Partial<Settings> | null;
    const settings = { ...DEFAULTS, ...pick(saved ?? {}) };
    return { ...settings, volume: clampVolume(settings.volume) };
  } catch {
    return { ...DEFAULTS };
  }
}

function save(settings: Partial<Settings>): void {
  writeSaved(KEY, settings);
}

function clampVolume(volume: number): number {
  return Number.isFinite(volume) ? Math.max(0, Math.min(100, volume)) : DEFAULTS.volume;
}

export const useSettingsStore = create<SettingsState>((set, get) => {
  const update = (patch: Partial<Settings>) => {
    set(patch);
    save(pick(get()));
  };
  return {
    ...load(),
    setSound: (sound) => update({ sound }),
    setVolume: (volume) => update({ volume: clampVolume(volume) }),
    setShowCoords: (showCoords) => update({ showCoords }),
    setShowLegalMoves: (showLegalMoves) => update({ showLegalMoves }),
    setAutoQueen: (autoQueen) => update({ autoQueen }),
    setPremoveEnabled: (premoveEnabled) => update({ premoveEnabled }),
    setMoveAnimation: (moveAnimation) => update({ moveAnimation }),
    setBotChat: (botChat) => update({ botChat }),
  };
});
