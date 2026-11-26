import { t } from "../i18n.js";
import { exportPng, exportSvg, renderToCanvas } from "../render/export.js";
import { ALT, clear, copyText, h, MOD } from "./dom.js";
import { icon } from "./icons.js";

const dialog = (title, className = "") => {
  const body = h("div", { class: "dialog__body" });
  const footer = h("div", { class: "dialog__footer" });
  const close = h("button", {
    type: "button",
    class: "icon-button dialog__close",
    "aria-label": t("Zamknij"),
    html: icon("close"),
  });
  const root = h(
    "dialog",
    { class: `dialog panel ${className}`, "aria-label": title },
    h("header", { class: "dialog__header" }, h("h2", { class: "dialog__title" }, title), close),
    body,
    footer,
  );
  close.addEventListener("click", () => root.close());
  root.addEventListener("click", (event) => {
    if (event.target === root) root.close();
  });
  root.addEventListener("close", () => root.remove());
  document.body.append(root);
  return { root, body, footer };
};

export const confirmDialog = (title, message, actions) =>
  new Promise((resolve) => {
    const { root, body, footer } = dialog(title, "dialog--confirm");
    body.append(h("p", { class: "dialog__text" }, message));
    let result = null;
    footer.append(h("button", { type: "button", class: "button", onclick: () => root.close() }, t("Anuluj")));
    for (const action of actions) {
      footer.append(
        h(
          "button",
          {
            type: "button",
            class: `button${action.primary ? " button--primary" : ""}${action.danger ? " button--danger" : ""}`,
            onclick: () => {
              result = action.value;
              root.close();
            },
          },
          action.label,
        ),
      );
    }
    root.addEventListener("close", () => resolve(result));
    root.showModal();
    footer.lastElementChild?.focus();
  });

export const helpDialog = () => {
  const { root, body } = dialog(t("Skróty klawiszowe"), "dialog--help");
  const section = (title, rows) =>
    h(
      "section",
      { class: "shortcuts" },
      h("h3", { class: "shortcuts__title" }, title),
      h(
        "dl",
        { class: "shortcuts__list" },
        ...rows.flatMap(([label, keys]) => [
          h("dt", {}, label),
          h(
            "dd",
            {},
            ...keys
              .split(" / ")
              .flatMap((combo, index) => [
                index > 0 ? h("span", { class: "shortcuts__or" }, t("lub")) : "",
                h("kbd", {}, combo),
              ]),
          ),
        ]),
      ),
    );
  body.append(
    h(
      "div",
      { class: "shortcuts-grid" },
      section(t("Narzędzia"), [
        [t("Zaznaczanie"), "V / 1"],
        [t("Rączka"), `H / ${t("Spacja")}`],
        [t("Prostokąt"), "R / 2"],
        [t("Romb"), "D / 3"],
        [t("Elipsa"), "O / 4"],
        [t("Strzałka"), "A / 5"],
        [t("Linia"), "L / 6"],
        [t("Pióro"), "P / 7"],
        [t("Tekst"), "T / 8"],
        [t("Obraz"), "9"],
        [t("Gumka"), "E / 0"],
        [t("Wskaźnik laserowy"), "K"],
        [t("Trzymaj narzędzie"), "Q"],
      ]),
      section(t("Edycja"), [
        [t("Cofnij / ponów"), `${MOD}+Z / ${MOD}+Shift+Z`],
        [t("Kopiuj, wytnij, wklej"), `${MOD}+C / ${MOD}+X / ${MOD}+V`],
        [t("Duplikuj"), `${MOD}+D / ${ALT}+${t("przeciągnij")}`],
        [t("Grupuj / rozgrupuj"), `${MOD}+G / ${MOD}+Shift+G`],
        [t("Warstwa wyżej / niżej"), `${MOD}+] / ${MOD}+[`],
        [t("Na wierzch / na spód"), `${MOD}+Shift+] / ${MOD}+Shift+[`],
        [t("Zablokuj"), `${MOD}+Shift+L`],
        [t("Edytuj tekst"), `Enter / ${t("dwuklik")}`],
        [t("Przesuń o 1 / 10 px"), `${t("Strzałki")} / Shift+${t("strzałki")}`],
        [t("Proporcje, kąt co 15°"), "Shift"],
        [t("Skaluj od środka"), ALT],
      ]),
      section(t("Widok i plik"), [
        [t("Przybliż / oddal"), `${MOD}+= / ${MOD}+-`],
        [t("Powiększenie 100%"), `${MOD}+0`],
        [t("Pokaż wszystko"), "Shift+1"],
        [t("Pokaż zaznaczenie"), "Shift+2"],
        [t("Siatka"), `G / ${MOD}+'`],
        [t("Ciemny motyw"), `Shift+${ALT}+D`],
        [t("Kopiuj całą tablicę"), `${MOD}+S`],
        [t("Otwórz plik"), `${MOD}+O`],
        [t("Eksport obrazu"), `${MOD}+Shift+E`],
      ]),
    ),
  );
  root.showModal();
};

/**
 * Stellarr's activity frame cannot start downloads, so the export shows the
 * finished PNG (save it with the browser's own image menu) and copies SVG
 * through the clipboard.
 */
export const exportDialog = (editor, toast) => {
  const { root, body, footer } = dialog(t("Eksport obrazu"), "dialog--export");
  const hasSelection = editor.selection.size > 0;
  const state = { background: true, dark: editor.theme === "dark", selectionOnly: hasSelection, scale: 2 };
  const preview = h("div", { class: "export-preview" });
  const note = h("p", { class: "export-note" }, t("Kliknij obraz prawym przyciskiem, aby go zapisać lub skopiować."));
  const elements = () => (state.selectionOnly ? editor.selectedElements() : [...editor.store.ordered()]);
  const options = () => ({
    background: state.background ? editor.store.meta().background : null,
    dark: state.dark,
    scale: state.scale,
    padding: 24,
  });
  let png = null;
  let token = 0;
  const refresh = async () => {
    const mine = (token += 1);
    const list = elements();
    preview.classList.toggle("export-preview--transparent", !state.background);
    if (list.length === 0) {
      clear(preview);
      png = null;
      preview.append(h("p", { class: "export-preview__empty" }, t("Na tablicy nie ma jeszcze nic do wyeksportowania.")));
      return;
    }
    const blob = await exportPng(editor.renderer, list, options());
    if (mine !== token) return;
    png = blob;
    const url = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(blob);
    });
    if (mine !== token) return;
    clear(preview);
    const image = h("img", { class: "export-preview__image", src: url, alt: t("Podgląd eksportu") });
    // Where the frame's CSP blocks data: images, show the same render on a canvas.
    image.addEventListener("error", () => {
      if (mine !== token) return;
      const canvas = renderToCanvas(editor.renderer, list, { ...options(), scale: 1 });
      canvas.className = "export-preview__canvas";
      image.replaceWith(canvas);
      note.textContent = t("Użyj „Kopiuj PNG” albo „Kopiuj SVG”, aby zabrać obraz z tablicy.");
    });
    preview.append(image);
  };
  const toggle = (label, key, disabled = false) => {
    const input = h("input", { type: "checkbox", class: "switch__input", checked: state[key], disabled });
    input.addEventListener("change", () => {
      state[key] = input.checked;
      void refresh();
    });
    return h(
      "label",
      { class: `switch${disabled ? " is-disabled" : ""}` },
      input,
      h("span", { class: "switch__track", "aria-hidden": "true" }),
      label,
    );
  };
  const scale = h("div", { class: "segmented", role: "radiogroup", "aria-label": t("Skala") });
  for (const value of [1, 2, 3]) {
    const button = h(
      "button",
      {
        type: "button",
        class: `segmented__item segmented__item--text${value === state.scale ? " is-active" : ""}`,
        role: "radio",
        "aria-checked": String(value === state.scale),
      },
      `${value}×`,
    );
    button.addEventListener("click", () => {
      state.scale = value;
      for (const item of scale.children) {
        item.classList.toggle("is-active", item === button);
        item.setAttribute("aria-checked", String(item === button));
      }
      void refresh();
    });
    scale.append(button);
  }
  body.append(
    preview,
    note,
    h(
      "div",
      { class: "export-options" },
      toggle(t("Tło"), "background"),
      toggle(t("Ciemny motyw"), "dark"),
      toggle(t("Tylko zaznaczenie"), "selectionOnly", !hasSelection),
      h("div", { class: "export-options__scale" }, h("span", {}, t("Skala PNG")), scale),
    ),
  );
  const copyPng = async () => {
    if (png === null) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
      toast(t("Skopiowano obraz do schowka."));
      root.close();
    } catch {
      toast(t("Stellarr nie pozwala tu kopiować obrazów. Kliknij obraz prawym przyciskiem."));
    }
  };
  const copySvg = async () => {
    const list = elements();
    if (list.length === 0) return;
    const svg = await exportSvg(list, (id) => editor.store.file(id), { ...options(), scale: 1 });
    if (copyText(svg)) {
      toast(t("Skopiowano SVG do schowka."));
      root.close();
    } else {
      toast(t("Nie udało się skopiować SVG."));
    }
  };
  const primary = h("button", { type: "button", class: "button button--primary", onclick: () => void copyPng() }, t("Kopiuj PNG"));
  footer.append(h("button", { type: "button", class: "button", onclick: () => void copySvg() }, t("Kopiuj SVG")), primary);
  root.showModal();
  primary.focus();
  void refresh();
};
