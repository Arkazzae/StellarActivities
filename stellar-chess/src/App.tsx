/**
 * Stellar Chess: a chess-site shell for Stellarr. Statistics as the start page, a ladder of bots,
 * puzzles, Chaos Chess, and the voice channel's shared board for games between the people in the room.
 */

import { useEffect, useRef } from "react";
import { useSettingsStore } from "@/state/settings";
import { useUiStore } from "@/state/ui";
import { useBotMove } from "@/hooks/useBotMove";
import { usePremove } from "@/hooks/usePremove";
import { useGameLifecycle } from "@/hooks/useGameLifecycle";
import { useChaosBotDraft } from "@/hooks/useChaosBotDraft";
import { preloadSounds, resumeAudio, setSoundsEnabled, setVolume } from "@/sounds";
import { Sidebar } from "@/components/shell/Sidebar";
import { Toast } from "@/components/shell/Toast";
import { StatsPage } from "@/components/home/StatsPage";
import { LadderPage } from "@/components/home/LadderPage";
import { PuzzlesPage } from "@/components/home/PuzzlesPage";
import { ChaosPage } from "@/components/chaos/ChaosPage";
import { PlayPage } from "@/components/play/PlayPage";
import { SettingsDialog } from "@/components/play/SettingsDialog";
import { PgnDialog } from "@/components/play/PgnDialog";
import { useTranslation } from "@/i18n";
import "@/styles/board.css";
import "@/styles/app.css";
import "@/styles/shell.css";
import "@/styles/chaos.css";

export function App() {
  const view = useUiStore((s) => s.view);
  const sound = useSettingsStore((s) => s.sound);
  const volume = useSettingsStore((s) => s.volume);
  // Re-render the whole shell when the language changes.
  const { t, locale } = useTranslation();
  useEffect(() => {
    document.title = t("app.title");
  }, [locale, t]);

  useBotMove();
  usePremove();
  useGameLifecycle();
  useChaosBotDraft();

  useEffect(() => setSoundsEnabled(sound), [sound]);
  useEffect(() => setVolume(volume), [volume]);
  useEffect(() => void preloadSounds(), []);

  const mainRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [view]);

  return (
    <div className="app" onPointerDown={resumeAudio}>
      <Sidebar />
      <main className="app__main" ref={mainRef}>
        {view === "home" ? <StatsPage /> : view === "ladder" ? <LadderPage /> : view === "puzzles" ? <PuzzlesPage /> : view === "chaos" ? <ChaosPage /> : <PlayPage />}
      </main>
      <SettingsDialog />
      <PgnDialog />
      <Toast />
    </div>
  );
}
