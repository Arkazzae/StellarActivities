import { useEffect, useLayoutEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import type { Game } from "../net/game.ts";
import { Caption } from "./Caption.tsx";
import { Final } from "./Final.tsx";
import { Lobby } from "./Lobby.tsx";
import { GameContext } from "./parts.tsx";
import { Results } from "./Results.tsx";
import { Reveal } from "./Reveal.tsx";
import { Search } from "./Search.tsx";
import { TopicVote } from "./TopicVote.tsx";
import { Vote } from "./Vote.tsx";

const STAGE_W = 1360;
const STAGE_H = 812;

/** Phones and narrow frames get the stacked layout; everything else the 1360×812 stage, scaled to fit. */
function useLayout() {
  const read = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    return { narrow: w < 760 || w < h * 0.95, scale: Math.min(w / STAGE_W, h / STAGE_H) };
  };
  const [layout, setLayout] = useState(read);
  useLayoutEffect(() => {
    const update = () => setLayout(read());
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return layout;
}

function Stage({ children }: { children: ReactNode }) {
  const { narrow, scale } = useLayout();
  useEffect(() => {
    document.documentElement.dataset.layout = narrow ? "narrow" : "stage";
  }, [narrow]);
  const tile = { backgroundImage: "url(./art/bg-tile.webp)" };
  if (narrow) return <div className="stage narrow" style={tile}>{children}</div>;
  return (
    <div className="viewport" style={tile}>
      <div className="stage" style={{ width: STAGE_W, height: STAGE_H, transform: `translate(-50%, -50%) scale(${scale})` }}>
        {children}
      </div>
    </div>
  );
}

function Toast({ game }: { game: Game }) {
  const [, force] = useState(0);
  const notice = game.notice;
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => force((n) => n + 1), 3600);
    return () => clearTimeout(timer);
  }, [notice]);
  if (!notice || Date.now() - notice.at > 3500) return null;
  return <div className="toast" role="status">{notice.text}</div>;
}

export function App({ game }: { game: Game }) {
  useSyncExternalStore(game.subscribe, game.getVersion);
  const s = game.state;
  let screen: ReactNode;
  switch (s.phase) {
    case "topic":
      screen = <TopicVote />;
      break;
    case "search":
      screen = s.settings.mode === "napisy" ? <Caption /> : <Search />;
      break;
    case "reveal":
      screen = <Reveal />;
      break;
    case "vote":
      screen = <Vote />;
      break;
    case "results":
      screen = <Results />;
      break;
    case "final":
      screen = <Final />;
      break;
    default:
      screen = <Lobby />;
  }
  return (
    <GameContext.Provider value={game}>
      <Stage>
        {screen}
        {game.connection !== "connected" && <div className="toast toast-warn">{game.t("connecting")}</div>}
        <Toast game={game} />
      </Stage>
    </GameContext.Provider>
  );
}
