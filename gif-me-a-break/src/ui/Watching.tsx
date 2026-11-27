import { useGame } from "./parts.tsx";

/** A line for people who joined after the start: they watch until the next match. */
export function Watching() {
  const game = useGame();
  if (!game.state.match || game.playing) return null;
  return <p className="watching">{game.t("watching")}</p>;
}
