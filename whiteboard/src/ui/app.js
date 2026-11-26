import { Editor } from "../editor/editor.js";
import { FILE_EXTENSION, parseBoardFile, serializeBoard } from "../editor/clipboard.js";
import { plural, t } from "../i18n.js";
import { canHoldLabel, isLinear, isShape } from "../model/types.js";
import { confirmDialog, exportDialog, helpDialog } from "./dialogs.js";
import { clear, copyText, h, MOD } from "./dom.js";
import { icon } from "./icons.js";
import { Inspector } from "./inspector.js";
import { contextMenuEntries, mainMenuEntries, Popup } from "./menus.js";
import { TextEditor } from "./text-editor.js";
import { Toolbar } from "./toolbar.js";

const initials = (name) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
};

const avatar = (person, color, self) => {
  const node = h(
    "span",
    { class: `avatar${self ? " avatar--self" : ""}`, style: color ? `--avatar:${color}` : null, "data-tip": person.label },
    initials(person.name || "?"),
  );
  if (typeof person.avatar === "string" && person.avatar.length > 0) {
    const image = h("img", { class: "avatar__image", src: person.avatar, alt: "" });
    image.addEventListener("error", () => image.remove());
    node.append(image);
  }
  return node;
};

const timeAgo = (at) => {
  const minutes = Math.max(1, Math.round((Date.now() - at) / 60_000));
  if (minutes < 60) return plural(minutes, "{n} minutę temu", "{n} minuty temu", "{n} minut temu");
  const hours = Math.round(minutes / 60);
  if (hours < 48) return plural(hours, "{n} godzinę temu", "{n} godziny temu", "{n} godzin temu");
  return plural(Math.round(hours / 24), "{n} dzień temu", "{n} dni temu", "{n} dni temu");
};

/**
 * Builds the whole interface around the editor.
 * @param ctx { session, store, room, files, backup, prefs, board }
 */
export const mountApp = (root, ctx) => {
  const { session, store, room, files, backup } = ctx;
  clear(root);
  const stage = h("div", { class: "stage" });
  const app = h("div", { class: "app" }, stage);
  root.append(app);

  const editor = new Editor(stage, store, room, files, ctx.prefs);
  editor.onPrefs = (prefs) => backup.setPrefs(prefs);
  const popup = new Popup();
  const textEditor = new TextEditor(editor);
  stage.append(textEditor.element);

  /* ------------------------------------------------------------- toasts */
  const toasts = h("div", { class: "toasts", role: "status", "aria-live": "polite" });
  const toast = (message) => {
    const item = h("div", { class: "toast" }, message);
    toasts.append(item);
    setTimeout(() => item.classList.add("is-leaving"), 3_400);
    setTimeout(() => item.remove(), 3_800);
  };
  ctx.setToast(toast);

  /* -------------------------------------------------------------- files */
  const imagePicker = h("input", { type: "file", accept: "image/*", hidden: true });
  let imageTarget = null;
  imagePicker.addEventListener("change", () => {
    const file = imagePicker.files?.[0];
    const at = imageTarget ?? editor.screenToScene(editor.width / 2, editor.height / 2);
    imagePicker.value = "";
    if (file !== undefined) void editor.insertImage(file, at);
  });
  const pickImage = (at) => {
    imageTarget = at ?? null;
    imagePicker.click();
  };

  const filePicker = h("input", { type: "file", accept: `${FILE_EXTENSION},.kreska,application/json`, hidden: true });
  const importFile = async (file) => {
    const payload = parseBoardFile(await file.text());
    if (payload === null) {
      toast(t("To nie jest plik tablicy."));
      return;
    }
    let mode = "replace";
    if (!editor.isEmpty()) {
      mode = await confirmDialog(
        t("Otwórz plik"),
        t("„{file}” zawiera {n} elementów. Zastąpić nimi tablicę czy dodać je do niej? Zmianę można cofnąć.", {
          file: file.name,
          n: payload.elements.length,
        }),
        [
          { label: t("Dodaj do tablicy"), value: "merge" },
          { label: t("Zastąp tablicę"), value: "replace", primary: true },
        ],
      );
    }
    if (mode === null) return;
    if (!store.fits(payload.elements, mode === "replace")) {
      toast(t("Ten plik nie zmieści się na wspólnej tablicy (limit 256 KiB)."));
      return;
    }
    editor.importBoard(payload, mode === "replace");
    if (mode === "replace" && (payload.meta.name !== undefined || payload.meta.background !== undefined)) {
      store.setMeta(payload.meta);
    }
    toast(t("Wczytano plik."));
  };
  filePicker.addEventListener("change", () => {
    const file = filePicker.files?.[0];
    filePicker.value = "";
    if (file !== undefined) void importFile(file);
  });
  const copyBoard = () => {
    if (editor.isEmpty()) return;
    const json = serializeBoard(store.meta(), store.ordered(), (id) => store.file(id));
    toast(
      copyText(json)
        ? t("Skopiowano całą tablicę. Wklej ją ({mod}+V) na dowolnej tablicy albo zapisz jako plik .whiteboard.", { mod: MOD })
        : t("Nie udało się skopiować tablicy."),
    );
  };
  const clearBoard = async () => {
    const answer = await confirmDialog(
      t("Wyczyścić tablicę?"),
      t("Wszystkie elementy znikną dla wszystkich uczestników. Możesz to cofnąć skrótem {mod}+Z.", { mod: MOD }),
      [{ label: t("Wyczyść"), value: "clear", danger: true }],
    );
    if (answer === "clear") editor.clearBoard();
  };

  /* -------------------------------------------------------------- top bar */
  const menuButton = h("button", {
    type: "button",
    class: "brand",
    "aria-label": t("Menu tablicy"),
    "aria-haspopup": "menu",
    html: `<img class="brand__mark" src="./assets/icon.png" alt="" width="28" height="28"><span class="brand__name">Whiteboard</span>${icon("chevronDown", 16)}`,
  });
  const openMenu = () => {
    const rect = menuButton.getBoundingClientRect();
    menuButton.setAttribute("aria-expanded", "true");
    popup.open(
      mainMenuEntries(editor, {
        open: () => filePicker.click(),
        copyBoard,
        exportImage: () => exportDialog(editor, toast),
        clear: () => void clearBoard(),
        help: helpDialog,
        followTheme: () => editor.useHostTheme(session.theme.get().mode),
        background: (color) => {
          store.setMeta({ background: color });
          popup.close();
        },
      }),
      rect.left,
      rect.bottom + 6,
      () => menuButton.setAttribute("aria-expanded", "false"),
    );
  };
  menuButton.addEventListener("click", () => (popup.isOpen ? popup.close() : openMenu()));

  const nameInput = h("input", {
    class: "board-name",
    type: "text",
    maxlength: 120,
    spellcheck: false,
    placeholder: t("Bez tytułu"),
    "aria-label": t("Nazwa tablicy"),
    value: store.meta().name,
  });
  const commitName = () => {
    const value = nameInput.value.trim();
    if (value !== store.meta().name) store.setMeta({ name: value });
  };
  nameInput.addEventListener("change", commitName);
  nameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === "Escape") {
      if (event.key === "Escape") nameInput.value = store.meta().name;
      nameInput.blur();
    }
  });

  const presence = h("div", { class: "presence", "aria-label": t("Osoby na tablicy") });
  const status = h("div", { class: "status", role: "status", "aria-live": "polite" });
  const exportButton = h("button", {
    type: "button",
    class: "button button--primary topbar__export",
    onclick: () => exportDialog(editor, toast),
    html: `${icon("download", 18)}<span>${t("Eksport")}</span>`,
  });
  const helpButton = h("button", {
    type: "button",
    class: "icon-button",
    "aria-label": t("Skróty klawiszowe"),
    "data-tip": `${t("Skróty")} · ?`,
    onclick: helpDialog,
    html: icon("help"),
  });
  const topbar = h(
    "header",
    { class: "topbar" },
    h("div", { class: "topbar__left panel" }, menuButton, h("span", { class: "topbar__divider", "aria-hidden": "true" }), nameInput),
    h("div", { class: "topbar__right" }, h("div", { class: "panel topbar__presence" }, presence, status), helpButton, exportButton),
  );

  let known = null;
  let presenceKey = "";
  const renderPresence = () => {
    const usageBucket = Math.floor(store.usage * 20);
    const key = JSON.stringify([
      room.status,
      usageBucket,
      room.selfName,
      room.selfAvatar,
      room.others.map((person) => [person.id, person.name, person.avatar]),
      editor.peerList.map((peer) => peer.color),
    ]);
    // Announce people joining (not on first render).
    const ids = new Set(room.others.map((person) => person.id));
    if (known !== null) {
      for (const person of room.others) if (!known.has(person.id)) toast(t("{name} dołącza do tablicy", { name: person.name || t("Ktoś") }));
    }
    known = ids;
    if (key === presenceKey) return;
    presenceKey = key;
    clear(presence);
    const peers = editor.peerList;
    const others = room.others;
    presence.append(
      avatar({ name: room.selfName, avatar: room.selfAvatar, label: t("{name} (Ty)", { name: room.selfName || t("Ty") }) }, null, true),
    );
    for (const person of others.slice(0, 4)) {
      const color = peers.find((peer) => peer.id === person.id)?.color;
      presence.append(avatar({ name: person.name, avatar: person.avatar, label: person.name }, color, false));
    }
    if (others.length > 4) {
      presence.append(
        h("span", { class: "avatar avatar--more", "data-tip": others.slice(4).map((person) => person.name).join(", ") }, `+${others.length - 4}`),
      );
    }
    // No "live" badge: the avatars already show who is here. Text appears only
    // when something needs attention (connection trouble, a filling board).
    let label = null;
    if (room.status === "reconnecting") label = t("Łączenie ponownie…");
    else if (room.status === "closed") label = t("Rozłączono");
    const usage = store.usage;
    status.className = `status${label !== null ? " status--error" : ""}${usage >= 0.9 ? " status--full" : ""}`;
    status.title = t("Wspólna tablica zajmuje {p}% miejsca dostępnego w pokoju.", { p: Math.round(usage * 100) });
    clear(status);
    if (label !== null) {
      status.append(h("span", { class: "status__dot", "aria-hidden": "true" }), h("span", { class: "status__label" }, label));
    }
    if (usage >= 0.6) status.append(h("span", { class: "status__usage" }, t("{p}% miejsca", { p: Math.round(usage * 100) })));
    status.hidden = status.childElementCount === 0;
  };
  room.onStatus(() => renderPresence());

  /* ------------------------------------------------------ restore banner */
  const banner = h("div", { class: "banner panel", role: "region", "aria-label": t("Przywracanie tablicy"), hidden: true });
  const showRestore = (board) => {
    if (board === null || !editor.isEmpty()) return;
    clear(banner);
    const restore = h("button", { type: "button", class: "button button--primary" }, t("Przywróć"));
    const dismiss = h("button", { type: "button", class: "button", onclick: () => (banner.hidden = true) }, t("Nie teraz"));
    restore.addEventListener("click", async () => {
      restore.disabled = true;
      try {
        const done = await backup.restore(board);
        toast(done ? t("Przywrócono tablicę.") : t("Ktoś zaczął już rysować — nie nadpisuję tablicy."));
        if (done) editor.zoomToFit(false, 1);
      } catch {
        toast(t("Nie udało się przywrócić tablicy."));
      }
      banner.hidden = true;
    });
    banner.append(
      h(
        "div",
        { class: "banner__text" },
        h("strong", {}, t("Przywrócić ostatnią tablicę?")),
        h(
          "span",
          {},
          `${board.name ? `„${board.name}” · ` : ""}${plural(board.n ?? 0, "{n} element", "{n} elementy", "{n} elementów")} · ${t("zapisana")} ${timeAgo(board.at ?? Date.now())}`,
        ),
      ),
      h("div", { class: "banner__actions" }, dismiss, restore),
    );
    banner.hidden = false;
  };

  /* ---------------------------------------------------------------- dock */
  const zoomLabel = h("button", {
    type: "button",
    class: "dock__zoom",
    "aria-label": t("Powiększenie — kliknij, aby wrócić do 100%"),
    "data-tip": `100% · ${MOD}+0`,
    onclick: () => editor.resetZoom(),
  });
  const undoButton = h("button", {
    type: "button",
    class: "icon-button",
    "aria-label": t("Cofnij"),
    "data-tip": `${t("Cofnij")} · ${MOD}+Z`,
    html: icon("undo"),
    onclick: () => editor.undo(),
  });
  const redoButton = h("button", {
    type: "button",
    class: "icon-button",
    "aria-label": t("Ponów"),
    "data-tip": `${t("Ponów")} · ${MOD}+Shift+Z`,
    html: icon("redo"),
    onclick: () => editor.redo(),
  });
  const dock = h(
    "div",
    { class: "dock" },
    h(
      "div",
      { class: "panel dock__group" },
      h("button", { type: "button", class: "icon-button", "aria-label": t("Oddal"), "data-tip": `${t("Oddal")} · ${MOD}+-`, html: icon("minus"), onclick: () => editor.zoomBy(1 / 1.2) }),
      zoomLabel,
      h("button", { type: "button", class: "icon-button", "aria-label": t("Przybliż"), "data-tip": `${t("Przybliż")} · ${MOD}+=`, html: icon("plus"), onclick: () => editor.zoomBy(1.2) }),
      h("button", { type: "button", class: "icon-button", "aria-label": t("Pokaż wszystko"), "data-tip": `${t("Pokaż wszystko")} · Shift+1`, html: icon("fit"), onclick: () => editor.zoomToFit(false, 1) }),
    ),
    h("div", { class: "panel dock__group" }, undoButton, redoButton),
  );

  /* --------------------------------------------------- hints & empty state */
  const hint = h("div", { class: "hint", "aria-live": "polite" });
  const empty = h(
    "div",
    { class: "empty", "aria-hidden": "true" },
    h("p", { class: "empty__title" }, t("Pusta tablica.")),
    h(
      "p",
      { class: "empty__keys" },
      ...[
        ["R", "prostokąt"],
        ["O", "elipsa"],
        ["A", "strzałka"],
        ["P", "pióro"],
        ["T", "tekst"],
      ].map(([key, label]) => h("span", { class: "empty__key" }, h("kbd", {}, key), t(label))),
    ),
    h(
      "p",
      { class: "empty__sub" },
      room.mode === "personal"
        ? t("Ta tablica jest tylko Twoja. Dwuklik w dowolnym miejscu zaczyna pisanie.")
        : t("Każdy na kanale głosowym może tu rysować razem z Tobą. Dwuklik w dowolnym miejscu zaczyna pisanie."),
    ),
    h("p", { class: "empty__touch" }, t("Wybierz narzędzie z paska na dole i rysuj palcem. Dwa palce przesuwają i przybliżają widok.")),
  );

  const hintText = () => {
    if (editor.editingId !== null) return t("Esc albo kliknięcie obok kończy pisanie");
    switch (editor.gestureKind) {
      case "multipoint":
        return t("Klikaj kolejne punkty · kliknięcie w pierwszy zamyka kształt · Enter kończy");
      case "resize":
        return t("Shift — zachowaj proporcje · Alt — od środka");
      case "rotate":
        return t("Shift — obrót co 15°");
      case "create":
        return t("Shift — równe boki · Alt — od środka");
      default:
        break;
    }
    switch (editor.tool) {
      case "rectangle":
      case "diamond":
      case "ellipse":
        return t("Przeciągnij, aby narysować");
      case "arrow":
        return t("Przeciągnij albo klikaj punkty · koniec na kształcie przyczepia strzałkę");
      case "line":
        return t("Przeciągnij albo klikaj kolejne punkty");
      case "freedraw":
        return t("Rysuj swobodnie · rysik reaguje na nacisk");
      case "text":
        return t("Kliknij, aby pisać · kliknięcie w kształt dodaje podpis");
      case "eraser":
        return t("Przeciągnij po elementach, które mają zniknąć");
      case "laser":
        return t("Wskaźnik widzą wszyscy · ślad znika po chwili");
      case "hand":
        return t("Przeciągnij, aby przesunąć widok");
      default:
        break;
    }
    const selected = editor.selectedElements();
    if (selected.length === 1) {
      const el = selected[0];
      if (el.locked) return t("Element zablokowany · odblokuj z menu pod prawym przyciskiem");
      if (isLinear(el)) return t("Przeciągaj punkty · dwuklik na linii dodaje punkt, na punkcie go usuwa");
      if (canHoldLabel(el) && isShape(el)) return t("Dwuklik albo Enter — podpis w kształcie");
      if (el.type === "text") return t("Dwuklik albo Enter — edycja tekstu");
    }
    if (selected.length > 1) return t("{n} zaznaczonych · {mod}+G grupuje", { n: selected.length, mod: MOD });
    return "";
  };

  /* ------------------------------------------------------------- toolbar */
  const inspector = new Inspector(editor);
  const toolbar = new Toolbar(editor, () => pickImage(), () => inspector.toggle());
  app.append(topbar, banner, toolbar.element, inspector.element, dock, hint, empty, toasts, popup.element, imagePicker, filePicker);

  /* ---------------------------------------------------------------- host */
  editor.attachHost({
    openTextEditor: (el) => textEditor.open(el),
    closeTextEditor: () => {
      if (textEditor.isOpen) textEditor.close();
      else editor.finishEditing();
    },
    contextMenu: (x, y, target) => popup.open(contextMenuEntries(editor, target, editor.screenToScene(x, y)), x, y),
    toast,
    pickImage: (at) => pickImage(at),
    help: helpDialog,
    exportDialog: () => exportDialog(editor, toast),
    saveFile: copyBoard,
    openFile: () => filePicker.click(),
    importFile: (file) => void importFile(file),
  });

  /* -------------------------------------------------------------- update */
  let lastMeta = "";
  const update = () => {
    toolbar.update();
    inspector.update();
    zoomLabel.textContent = `${Math.round(editor.zoom * 100)}%`;
    undoButton.disabled = !store.canUndo;
    redoButton.disabled = !store.canRedo;
    const meta = store.meta();
    const metaKey = `${meta.name}|${meta.background}`;
    if (metaKey !== lastMeta) {
      lastMeta = metaKey;
      if (document.activeElement !== nameInput) nameInput.value = meta.name;
      document.title = meta.name ? `${meta.name} · Whiteboard` : "Whiteboard";
    }
    app.dataset.theme = editor.theme;
    document.documentElement.dataset.theme = editor.theme;
    const text = hintText();
    if (hint.textContent !== text) hint.textContent = text;
    hint.hidden = text.length === 0;
    empty.classList.toggle("is-hidden", !editor.isEmpty() || editor.gestureKind !== "none" || editor.editingId !== null);
    if (!banner.hidden && !editor.isEmpty()) banner.hidden = true;
    renderPresence();
  };
  editor.onChange(update);
  store.subscribe((change) => {
    if (change.ids.size > 0 || change.meta) backup.boardChanged();
  });

  // Follow Stellarr's light/dark theme unless the person picked one.
  session.theme.subscribe((theme) => editor.setTheme(theme.mode === "dark" ? "dark" : "light", false));
  update();
  showRestore(ctx.board);
  if (!editor.isEmpty()) editor.zoomToFit(false, 1);
  else editor.zoomToFit();
  return editor;
};
