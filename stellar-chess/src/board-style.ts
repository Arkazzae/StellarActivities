/**
 * How the board looks: the piece set and the colours of the squares, both chosen in the settings
 * and saved with the player's progress. Every picture of a piece goes through `pieceUrl`, so a new
 * set shows everywhere at once: the board, captured pieces, colour pickers, mini boards.
 */

import { useEffect } from "react";
import { useSettingsStore } from "@/state/settings";
import type { PieceColor, PieceType } from "@/engine/types";

export interface PieceSet {
  id: string;
  ext: "webp" | "svg";
}

/** Classic (drawn for Arcade Chess, the default), Stellar (cartoon), Tournament (cburnett, GPLv2+). */
export const PIECE_SETS: PieceSet[] = [
  { id: "classic", ext: "webp" },
  { id: "stellar", ext: "webp" },
  { id: "cburnett", ext: "svg" },
];

export interface BoardTheme {
  id: string;
  light: string;
  dark: string;
}

export const BOARD_THEMES: BoardTheme[] = [
  { id: "green", light: "#ebecd0", dark: "#739552" },
  { id: "brown", light: "#f0d9b5", dark: "#b58863" },
  { id: "blue", light: "#dee3e6", dark: "#8ca2ad" },
  { id: "purple", light: "#e6e0f0", dark: "#8a72b3" },
  { id: "coral", light: "#f3e4d4", dark: "#cf8a71" },
  { id: "slate", light: "#c9d2dc", dark: "#5f7184" },
];

/** Whether the drawn Classic set is in public/pieces/classic yet; until then the default is Stellar. */
const CLASSIC_READY = true;
export const DEFAULT_PIECE_SET = CLASSIC_READY ? "classic" : "stellar";
/** The sets offered in the settings. */
export const OFFERED_SETS = PIECE_SETS.filter((set) => CLASSIC_READY || set.id !== "classic");
export const DEFAULT_BOARD_THEME = "green";

/** A saved choice, or the app's default set for "" (no choice made), so the default can change later. */
export const pieceSet = (id: string) => OFFERED_SETS.find((item) => item.id === id) ?? OFFERED_SETS.find((item) => item.id === DEFAULT_PIECE_SET)!;
export const boardTheme = (id: string) => BOARD_THEMES.find((item) => item.id === id) ?? BOARD_THEMES[0];

/** The picture of a piece in a set (the chosen one by default). */
export function pieceUrl(color: PieceColor, type: PieceType | string, set = useSettingsStore.getState().pieceSet): string {
  const chosen = pieceSet(set);
  return `pieces/${chosen.id}/${color}${type}.${chosen.ext}`;
}

/** `pieceUrl` for a component, which then follows a change of set. */
export function usePieceUrl(): (color: PieceColor, type: PieceType | string) => string {
  const set = useSettingsStore((s) => s.pieceSet);
  return (color, type) => pieceUrl(color, type, set);
}

/** Paint the squares in the chosen colours (the board, mini boards and coordinates read these variables). */
export function useBoardTheme(): void {
  const id = useSettingsStore((s) => s.boardTheme);
  useEffect(() => {
    const theme = boardTheme(id);
    const root = document.documentElement.style;
    root.setProperty("--board-light", theme.light);
    root.setProperty("--board-dark", theme.dark);
  }, [id]);
}
