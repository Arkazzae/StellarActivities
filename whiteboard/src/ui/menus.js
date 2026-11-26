import { t } from "../i18n.js";
import { paintColor } from "../render/color.js";
import { ALT, clear, h, MOD } from "./dom.js";
import { icon } from "./icons.js";

/** A positioned popup menu with roving focus and outside-click dismissal. */
export class Popup {
  element;
  #onClose = null;

  constructor() {
    this.element = h("div", { class: "popup panel", role: "menu", hidden: true });
    this.element.addEventListener("keydown", (event) => {
      const items = [...this.element.querySelectorAll("button.popup__item:not(:disabled)")];
      const index = items.indexOf(document.activeElement);
      if (event.key === "ArrowDown") {
        items[(index + 1) % items.length]?.focus();
        event.preventDefault();
        event.stopPropagation();
      } else if (event.key === "ArrowUp") {
        items[(index - 1 + items.length) % items.length]?.focus();
        event.preventDefault();
        event.stopPropagation();
      } else if (event.key === "Escape") {
        this.close();
        event.preventDefault();
        event.stopPropagation();
      }
    });
    window.addEventListener(
      "pointerdown",
      (event) => {
        if (!this.element.hidden && !this.element.contains(event.target)) this.close();
      },
      true,
    );
    window.addEventListener("blur", () => this.close());
  }

  get isOpen() {
    return !this.element.hidden;
  }

  open(entries, x, y, onClose) {
    clear(this.element);
    this.#onClose = onClose ?? null;
    for (const entry of entries) {
      if (entry === "separator") {
        this.element.append(h("div", { class: "popup__sep", role: "separator" }));
        continue;
      }
      if ("custom" in entry) {
        this.element.append(entry.custom);
        continue;
      }
      const item = entry;
      this.element.append(
        h(
          "button",
          {
            type: "button",
            class: `popup__item${item.danger ? " popup__item--danger" : ""}`,
            role: item.checked === undefined ? "menuitem" : "menuitemcheckbox",
            "aria-checked": item.checked === undefined ? null : String(item.checked),
            disabled: item.disabled === true,
            onclick: () => {
              this.close();
              item.action();
            },
          },
          h("span", { class: "popup__icon", html: item.icon === undefined ? "" : icon(item.icon) }),
          h("span", { class: "popup__label" }, item.label),
          item.checked === true ? h("span", { class: "popup__check", html: icon("check", 16) }) : null,
          item.shortcut === undefined ? null : h("kbd", { class: "popup__kbd" }, item.shortcut),
        ),
      );
    }
    this.element.hidden = false;
    const rect = this.element.getBoundingClientRect();
    const maxX = window.innerWidth - rect.width - 8;
    const maxY = window.innerHeight - rect.height - 8;
    this.element.style.left = `${Math.max(8, Math.min(x, maxX))}px`;
    this.element.style.top = `${Math.max(8, Math.min(y, maxY))}px`;
    this.element.querySelector("button.popup__item:not(:disabled)")?.focus({ preventScroll: true });
  }

  close() {
    if (this.element.hidden) return;
    this.element.hidden = true;
    const callback = this.#onClose;
    this.#onClose = null;
    callback?.();
  }
}

export const BACKGROUNDS = [
  { color: "#f7f4ec", name: "Papier" },
  { color: "#ffffff", name: "Biel" },
  { color: "#eef3ef", name: "Szałwia" },
  { color: "#edf1f7", name: "Mgła" },
  { color: "#fbf0de", name: "Kość słoniowa" },
];

export const mainMenuEntries = (editor, actions) => {
  const background = editor.store.meta().background;
  const swatches = h("div", { class: "popup__swatches", role: "group", "aria-label": t("Tło tablicy") });
  for (const item of BACKGROUNDS) {
    const name = t(item.name);
    swatches.append(
      h("button", {
        type: "button",
        class: `swatch${item.color === background ? " is-active" : ""}`,
        style: `--swatch:${paintColor(item.color, editor.theme === "dark")}`,
        "aria-label": t("Tło: {name}", { name }),
        "data-tip": name,
        onclick: () => actions.background(item.color),
      }),
    );
  }
  const followsStellarr = editor.themeChoice === null;
  return [
    { label: t("Otwórz plik…"), icon: "upload", shortcut: `${MOD}+O`, action: actions.open },
    {
      label: t("Kopiuj całą tablicę"),
      icon: "copy",
      shortcut: `${MOD}+S`,
      action: actions.copyBoard,
      disabled: editor.isEmpty(),
    },
    { label: t("Eksportuj obraz…"), icon: "download", shortcut: `${MOD}+Shift+E`, action: actions.exportImage },
    "separator",
    {
      label: editor.theme === "dark" ? t("Jasny motyw") : t("Ciemny motyw"),
      icon: editor.theme === "dark" ? "sun" : "moon",
      shortcut: `Shift+${ALT}+D`,
      action: () => editor.setTheme(editor.theme === "dark" ? "light" : "dark"),
    },
    {
      label: t("Motyw jak w Stellarr"),
      icon: "eye",
      checked: followsStellarr,
      action: actions.followTheme,
      disabled: followsStellarr,
    },
    { label: t("Siatka"), icon: "grid", shortcut: "G", checked: editor.grid, action: () => editor.setGrid(!editor.grid) },
    { custom: h("div", { class: "popup__group" }, h("div", { class: "popup__caption" }, t("Tło tablicy")), swatches) },
    "separator",
    { label: t("Skróty klawiszowe"), icon: "help", shortcut: "?", action: actions.help },
    { label: t("Wyczyść tablicę…"), icon: "trash", danger: true, action: actions.clear, disabled: editor.isEmpty() },
  ];
};

export const contextMenuEntries = (editor, target, at) => {
  if (target === null) {
    return [
      {
        label: t("Wklej"),
        icon: "paste",
        shortcut: `${MOD}+V`,
        action: () => editor.pasteInternal(at),
        disabled: !editor.hasClipboard,
      },
      {
        label: t("Zaznacz wszystko"),
        icon: "selectAll",
        shortcut: `${MOD}+A`,
        action: () => editor.selectAll(),
        disabled: editor.isEmpty(),
      },
      "separator",
      {
        label: t("Pokaż wszystko"),
        icon: "fit",
        shortcut: "Shift+1",
        action: () => editor.zoomToFit(false, 1),
        disabled: editor.isEmpty(),
      },
      { label: t("Siatka"), icon: "grid", shortcut: "G", checked: editor.grid, action: () => editor.setGrid(!editor.grid) },
      { label: t("Odblokuj wszystko"), icon: "unlock", action: () => editor.unlockAll(), disabled: !editor.hasLocked },
    ];
  }
  const selected = editor.selectedElements();
  const locked = selected.length > 0 && selected.every((el) => el.locked);
  const units = new Set(selected.map((el) => el.groupIds[el.groupIds.length - 1] ?? el.id));
  return [
    { label: t("Kopiuj"), icon: "copy", shortcut: `${MOD}+C`, action: () => editor.copySelection() },
    {
      label: t("Wytnij"),
      icon: "cut",
      shortcut: `${MOD}+X`,
      action: () => {
        editor.copySelection();
        editor.deleteSelection();
      },
      disabled: locked,
    },
    {
      label: t("Wklej"),
      icon: "paste",
      shortcut: `${MOD}+V`,
      action: () => editor.pasteInternal(at),
      disabled: !editor.hasClipboard,
    },
    { label: t("Duplikuj"), icon: "duplicate", shortcut: `${MOD}+D`, action: () => editor.duplicateSelection() },
    "separator",
    { label: t("Na wierzch"), icon: "front", shortcut: `${MOD}+Shift+]`, action: () => editor.reorder("front") },
    { label: t("Wyżej"), icon: "forward", shortcut: `${MOD}+]`, action: () => editor.reorder("forward") },
    { label: t("Niżej"), icon: "backward", shortcut: `${MOD}+[`, action: () => editor.reorder("backward") },
    { label: t("Na spód"), icon: "back", shortcut: `${MOD}+Shift+[`, action: () => editor.reorder("back") },
    "separator",
    units.size >= 2
      ? { label: t("Grupuj"), icon: "group", shortcut: `${MOD}+G`, action: () => editor.groupSelection() }
      : {
          label: t("Rozgrupuj"),
          icon: "ungroup",
          shortcut: `${MOD}+Shift+G`,
          action: () => editor.ungroupSelection(),
          disabled: !editor.selectionHasGroup,
        },
    {
      label: locked ? t("Odblokuj") : t("Zablokuj"),
      icon: locked ? "unlock" : "lock",
      shortcut: `${MOD}+Shift+L`,
      action: () => editor.toggleLockSelection(),
    },
    {
      label: t("Usuń"),
      icon: "trash",
      shortcut: "Delete",
      danger: true,
      action: () => editor.deleteSelection(),
      disabled: locked,
    },
  ];
};
