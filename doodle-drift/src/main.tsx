import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Game } from "./net/game.ts";
import { initialState } from "./net/protocol.ts";
import { connectSession } from "./stellarr/sdk.ts";
import type { ActivityState } from "./stellarr/types.ts";
import { App } from "./ui/App.tsx";
import "./styles.css";

const root = createRoot(document.getElementById("root")!);
root.render(<div className="center-msg"><div><div className="spinner" />Doodle Drift</div></div>);

connectSession(initialState() as unknown as ActivityState)
  .then((session) => {
    const game = new Game(session);
    (window as unknown as { doodleDrift?: Game }).doodleDrift = game;
    root.render(
      <StrictMode>
        <App game={game} />
      </StrictMode>,
    );
  })
  .catch((error) => {
    console.error(error);
    root.render(<div className="center-msg">Doodle Drift: {String(error?.message ?? error)}</div>);
  });
