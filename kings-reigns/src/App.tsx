import { useEffect, useRef, useState } from "react";
import { roleOf } from "@/game/rules";
import { EMBASSY_ENABLED } from "@/game/features";
import { isTraitor } from "@/game/view";
import { send, useRoom } from "@/stellarr/room";
import { Embassy } from "@/ui/Embassy";
import { Lobby, Menu, Reveal } from "@/ui/Entry";
import { GameMenu, Rules } from "@/ui/parts";
import { Round } from "@/ui/Round";
import { Ending, Omen, Trial, Verdict } from "@/ui/Year";

export function App() {
  const room = useRoom();
  /** The title screen is shown first, and again whenever the menu asks for it. */
  const [title, setTitle] = useState(true);
  const [rules, setRules] = useState(false);
  const [menu, setMenu] = useState(false);
  const { state, me, host, participants, assignment } = room;
  const role = roleOf(state, me);
  const traitor = isTraitor(assignment);
  const steer = me === host || role === "king" || (state.seats.king?.kind !== "human" && !!role);
  const solo = room.launchMode === "personal";
  const inGame = state.phase !== "lobby";
  const openMenu = () => setMenu(true);

  // Joining a reign already under way, or a reign starting, skips the title screen once.
  // Alone, a reign that ends early goes back to the title screen: the lobby is for groups.
  const lastPhase = useRef(state.phase);
  useEffect(() => {
    if (lastPhase.current === "lobby" && state.phase !== "lobby") setTitle(false);
    if (solo && lastPhase.current !== "lobby" && state.phase === "lobby") setTitle(true);
    lastPhase.current = state.phase;
  }, [state.phase, solo]);
  useEffect(() => {
    if (room.ready && state.phase !== "lobby") setTitle(false);
    // Only on first connection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.ready]);

  const enter = async (mode: "council" | "diplomacy" = "council") => {
    setTitle(false);
    if (solo && state.phase === "lobby") {
      if (state.mode !== mode) await send("mode", { mode });
      await send("sit", { role: "king" });
      await send("start");
    }
  };

  if (!room.ready) return <div className="screen" style={{ display: "grid", placeItems: "center" }}><p className="muted">Zwołuję Radę…</p></div>;

  let screen;
  if (title) screen = <Menu participants={participants} solo={solo} inGame={inGame} onEnter={(mode) => void enter(mode)} onRules={() => setRules(true)} />;
  else switch (state.phase) {
    case "lobby": screen = <Lobby state={state} me={me} host={host} participants={participants} onMenu={openMenu} />; break;
    case "reveal": screen = <Reveal state={state} me={me} role={role} traitor={traitor} onMenu={openMenu} />; break;
    case "omen": screen = <Omen state={state} steer={steer} onMenu={openMenu} />; break;
    case "council":
    case "outcome":
      screen = state.mode === "diplomacy"
        ? <Embassy state={state} me={me} role={role} traitor={traitor} host={host} participants={participants} onMenu={openMenu} />
        : <Round state={state} me={me} role={role} traitor={traitor} host={host} participants={participants} onMenu={openMenu} />;
      break;
    case "trial": screen = <Trial state={state} me={me} role={role} participants={participants} onMenu={openMenu} />; break;
    case "verdict": screen = <Verdict state={state} steer={steer} onMenu={openMenu} />; break;
    case "ended": screen = <Ending state={state} me={me} amHost={me === host} onMenu={openMenu} />; break;
  }

  return (
    <>
      {screen}
      {menu && (
        <GameMenu
          onClose={() => setMenu(false)}
          onRules={() => { setMenu(false); setRules(true); }}
          onTitle={() => { setMenu(false); setTitle(true); }}
          canAbort={me === host}
          inGame={inGame}
        />
      )}
      {rules && <Rules onClose={() => setRules(false)} mode={state.phase === "lobby" && !EMBASSY_ENABLED ? "council" : state.mode} />}
      {room.error && <div className="toast" role="alert">{room.error}</div>}
      {room.connection !== "connected" && <div className="toast" role="status" style={{ background: "#2a2e22", borderColor: "rgba(238,235,223,0.3)" }}>{room.connection === "reconnecting" ? "Łączę ponownie…" : "Połączenie zamknięte."}</div>}
    </>
  );
}
