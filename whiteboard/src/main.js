import { Backup } from "./collab/backup.js";
import { FileSync } from "./collab/files.js";
import { Room } from "./collab/room.js";
import { setLocale, t } from "./i18n.js";
import { loadFonts } from "./render/text.js";
import { SceneStore } from "./store/scene.js";
import { mountApp } from "./ui/app.js";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Connects to the Stellarr session and mounts the board into `root`. */
export const boot = async (connect, root) => {
  const session = await connect({ initialState: {} });
  setLocale(session.locale?.get?.() ?? session.context.locale);
  await Promise.race([loadFonts(), wait(2_500)]);

  let toast = () => undefined;
  const lastError = new Map();
  const messages = {
    full: () => t("Tablica jest pełna — usuń coś, zanim dodasz więcej."),
    rejected: () => t("Stellarr nie przyjął ostatniej zmiany."),
    sync: () => t("Nie udało się zapisać zmian. Sprawdź połączenie."),
  };
  const store = new SceneStore(session.state, {
    stateBytes: session.limits?.stateBytes,
    onError(kind) {
      const now = Date.now();
      if (now - (lastError.get(kind) ?? 0) < 3_000) return;
      lastError.set(kind, now);
      toast((messages[kind] ?? messages.rejected)());
    },
  });
  const room = new Room(session, store);
  const files = new FileSync(session, store);
  const backup = new Backup(session, store);
  const { prefs, board } = await backup.load();
  const editor = mountApp(root, {
    session,
    store,
    room,
    files,
    backup,
    prefs,
    board,
    setToast: (show) => (toast = show),
  });
  // Handle for automated browser checks.
  window.__whiteboard = { session, store, room, files, backup, editor };
  window.addEventListener("pagehide", () => {
    store.flush();
    if (store.size > 0) void backup.saveNow();
  });
  return editor;
};

export const fail = (root, error) => {
  console.error(error);
  root.replaceChildren();
  const main = document.createElement("main");
  main.className = "fatal";
  main.setAttribute("role", "alert");
  const title = document.createElement("h1");
  title.textContent = t("Nie udało się otworzyć tablicy");
  const text = document.createElement("p");
  text.textContent = t("Otwórz Whiteboard z kanału głosowego albo z Aktywności w Stellarr. Jeśli to nie pomoże, uruchom aktywność ponownie.");
  main.append(title, text);
  root.append(main);
};
