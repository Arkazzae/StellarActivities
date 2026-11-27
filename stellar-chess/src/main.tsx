/**
 * Join the Stellarr session, load the player's saved progress, then start the interface. The
 * stores read their saved part when first imported, so the app is imported only after that.
 */

// Latin and Latin Extended only (English and Polish); both fonts are OFL-1.1.
import "@fontsource/montserrat/latin-600.css";
import "@fontsource/montserrat/latin-ext-600.css";
import "@fontsource/montserrat/latin-700.css";
import "@fontsource/montserrat/latin-ext-700.css";
import "@fontsource/montserrat/latin-800.css";
import "@fontsource/montserrat/latin-ext-800.css";
import "@fontsource/noto-sans/latin-400.css";
import "@fontsource/noto-sans/latin-ext-400.css";
import "@fontsource/noto-sans/latin-500.css";
import "@fontsource/noto-sans/latin-ext-500.css";
import "@fontsource/noto-sans/latin-600.css";
import "@fontsource/noto-sans/latin-ext-600.css";
import "@fontsource/noto-sans/latin-700.css";
import "@fontsource/noto-sans/latin-ext-700.css";
import { StrictMode } from "react";
import type { ActivityState } from "@stellarr/sdk";
import { createRoot } from "react-dom/client";
import { connectSession } from "@/stellarr/sdk";
import { loadSaved, readSaved, writeSaved } from "@/stellarr/storage";
import { followHostLocale, initLocale, LOCALE_KEY, setLocaleStore } from "@/i18n";
import { setHostVolume } from "@/sounds";
import { INITIAL_STATE } from "@/online/protocol";

async function boot(): Promise<void> {
  const session = await connectSession(INITIAL_STATE as unknown as ActivityState);
  await loadSaved();
  initLocale(session.locale.get(), readSaved(LOCALE_KEY));
  setLocaleStore((locale) => writeSaved(LOCALE_KEY, locale));
  session.locale.subscribe(followHostLocale);
  session.device.subscribe((device) => { document.documentElement.dataset.device = device; });
  session.media.volume.subscribe(setHostVolume);

  const [{ App }, { startOnline }] = await Promise.all([import("@/App"), import("@/online/sync")]);
  startOnline();
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

boot().catch((error) => {
  console.error(error);
  const root = document.getElementById("root")!;
  root.innerHTML = "";
  const message = document.createElement("p");
  message.className = "boot-error";
  message.textContent = `Stellar Chess could not start: ${error instanceof Error ? error.message : String(error)}`;
  root.append(message);
});
