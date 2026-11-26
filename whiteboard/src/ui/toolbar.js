import { t } from "../i18n.js";
import { h } from "./dom.js";
import { icon } from "./icons.js";

const GROUPS = [
  [
    { tool: "select", icon: "select", label: "Zaznaczanie", key: "V" },
    { tool: "hand", icon: "hand", label: "Rączka", key: "H" },
  ],
  [
    { tool: "rectangle", icon: "rectangle", label: "Prostokąt", key: "R" },
    { tool: "diamond", icon: "diamond", label: "Romb", key: "D" },
    { tool: "ellipse", icon: "ellipse", label: "Elipsa", key: "O" },
    { tool: "arrow", icon: "arrow", label: "Strzałka", key: "A" },
    { tool: "line", icon: "line", label: "Linia", key: "L" },
  ],
  [
    { tool: "freedraw", icon: "freedraw", label: "Pióro", key: "P" },
    { tool: "text", icon: "text", label: "Tekst", key: "T" },
    { tool: "image", icon: "image", label: "Obraz", key: "9" },
  ],
  [
    { tool: "eraser", icon: "eraser", label: "Gumka", key: "E" },
    { tool: "laser", icon: "laser", label: "Wskaźnik laserowy", key: "K" },
  ],
];

export class Toolbar {
  element;
  #buttons = new Map();
  #lock;
  #editor;

  constructor(editor, onImage, onStyleToggle) {
    this.#editor = editor;
    this.element = h("nav", { class: "toolbar panel", "aria-label": t("Narzędzia") });
    GROUPS.forEach((group, index) => {
      if (index > 0) this.element.append(h("span", { class: "toolbar__sep", "aria-hidden": "true" }));
      for (const def of group) {
        const label = t(def.label);
        const button = h("button", {
          type: "button",
          class: "tool",
          "aria-label": `${label} (${def.key})`,
          "data-tip": `${label} · ${def.key}`,
          "aria-pressed": "false",
          onclick: (event) => {
            if (def.tool === "image") onImage();
            else editor.setTool(def.tool);
            // Pointer clicks hand focus back to the board so Space and letters work there.
            if (event.detail > 0) editor.focusCanvas();
          },
          html: `${icon(def.icon)}<span class="tool__key" aria-hidden="true">${def.key}</span>`,
        });
        this.#buttons.set(def.tool, button);
        this.element.append(button);
      }
    });
    this.element.append(h("span", { class: "toolbar__sep", "aria-hidden": "true" }));
    this.#lock = h("button", {
      type: "button",
      class: "tool tool--lock",
      "aria-label": t("Zostaw narzędzie aktywne po rysowaniu (Q)"),
      "data-tip": t("Trzymaj narzędzie · Q"),
      "aria-pressed": "false",
      onclick: () => editor.toggleToolLock(),
      html: icon("unlock"),
    });
    this.element.append(this.#lock);
    this.element.append(
      h("button", {
        type: "button",
        class: "tool tool--style",
        "aria-label": t("Styl"),
        "data-tip": t("Styl"),
        onclick: onStyleToggle,
        html: icon("palette"),
      }),
    );
  }

  update() {
    for (const [tool, button] of this.#buttons) {
      const active = this.#editor.tool === tool;
      button.setAttribute("aria-pressed", String(active));
      button.classList.toggle("is-active", active);
    }
    const locked = this.#editor.toolLocked;
    this.#lock.setAttribute("aria-pressed", String(locked));
    this.#lock.classList.toggle("is-active", locked);
    this.#lock.innerHTML = icon(locked ? "lock" : "unlock");
  }
}
