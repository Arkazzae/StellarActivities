import "@fontsource-variable/fredoka/index.css";
import "@fontsource-variable/atkinson-hyperlegible-next/index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { initialState, type Phase } from "./game/types.ts";
import { Game } from "./net/game.ts";
import { connectSession, previewSession } from "./stellarr/sdk.ts";
import type { ActivityState } from "./stellarr/types.ts";
import { App } from "./ui/App.tsx";
import { previewRoom } from "./ui/preview.ts";
import "./styles.css";

const root = createRoot(document.getElementById("root")!);
root.render(<div className="boot"><img src="./art/cat-wait.webp" alt="" /><span>Gif Me a Break</span></div>);

const params = new URLSearchParams(location.search);
const wanted = params.get("preview") as Phase | null;
const PHASES: Phase[] = ["lobby", "topic", "search", "reveal", "vote", "results", "final"];

async function boot() {
  if (wanted && PHASES.includes(wanted) && window.parent === window) {
    const { state, preview } = previewRoom(wanted, params.get("as") === "guest", params.get("mode"));
    return previewSession(state as unknown as ActivityState, { ...preview, locale: params.get("lang") ?? navigator.language });
  }
  return connectSession(initialState() as unknown as ActivityState);
}

boot()
  .then((session) => {
    const game = new Game(session);
    (window as unknown as { petla?: Game }).petla = game;
    root.render(
      <StrictMode>
        <App game={game} />
      </StrictMode>,
    );
  })
  .catch((error) => {
    console.error(error);
    root.render(<div className="boot">Gif Me a Break: {String(error?.message ?? error)}</div>);
  });
