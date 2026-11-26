import { canHoldLabel, isLinear, isShape } from "../model/types.js";
import { paintColor } from "../render/color.js";
import { t } from "../i18n.js";
import { clear, h, MOD } from "./dom.js";
import { glyph, icon } from "./icons.js";
export const STROKE_COLORS = ["#1f1d1a", "#d6402f", "#e8871e", "#2f9e5b", "#2f6fdb", "#8a4fd1"];
export const FILL_COLORS = ["transparent", "#ffd3c4", "#ffe3ad", "#cdebcf", "#cfe0ff", "#e5d5fb", "#fff0a0"];
export const COLOR_NAMES = {
  transparent: "Brak",
  "#1f1d1a": "Atrament",
  "#d6402f": "Cynober",
  "#e8871e": "Pomarańcz",
  "#2f9e5b": "Zieleń",
  "#2f6fdb": "Kobalt",
  "#8a4fd1": "Fiolet",
  "#ffd3c4": "Brzoskwinia",
  "#ffe3ad": "Morela",
  "#cdebcf": "Mięta",
  "#cfe0ff": "Niebo",
  "#e5d5fb": "Lawenda",
  "#fff0a0": "Karteczka",
};
const FONT_SIZES = [
  { value: 16, label: t("S") },
  { value: 24, label: t("M") },
  { value: 32, label: t("L") },
  { value: 48, label: t("XL") },
];
const TOOL_TYPES = {
  rectangle: "rectangle",
  diamond: "diamond",
  ellipse: "ellipse",
  arrow: "arrow",
  line: "line",
  freedraw: "freedraw",
  text: "text",
};
/** Floating style panel; rebuilt only when its inputs actually change. */
export class Inspector {
  element;
  #body;
  #editor;
  #signature = "";
  /** True while a slider or colour picker is being dragged: never rebuild under it. */
  #live = false;
  constructor(editor) {
    this.#editor = editor;
    this.#body = h("div", { class: "inspector__body" });
    this.element = h("aside", { class: "inspector panel", "aria-label": t("Styl elementów") }, this.#body);
    this.element.addEventListener("input", (event) => {
      if (event.target instanceof HTMLInputElement) this.#live = true;
    });
    const settle = () => {
      if (!this.#live) return;
      this.#live = false;
      this.update();
    };
    this.element.addEventListener("change", settle);
    this.element.addEventListener("focusout", settle);
  }
  /** Small screens keep the panel as a sheet opened from the toolbar. */
  toggle() {
    this.element.classList.toggle("is-mobile-open");
  }
  #context() {
    const editor = this.#editor;
    const elements = editor.selectedElements();
    if (elements.length > 0) {
      const first = elements[0];
      return {
        types: new Set(elements.map((el) => el.type)),
        elements,
        values: {
          strokeColor: first.strokeColor,
          fillColor: first.fillColor,
          fillStyle: first.fillStyle,
          strokeWidth: first.strokeWidth,
          strokeStyle: first.strokeStyle,
          roughness: first.roughness,
          opacity: first.opacity,
          rounded: first.rounded,
          fontFamily: first.fontFamily,
          fontSize: first.fontSize,
          textAlign: first.textAlign,
          startArrow: first.startArrow,
          endArrow: first.endArrow,
        },
      };
    }
    const type = TOOL_TYPES[editor.tool];
    if (type === undefined || editor.editingId !== null) return null;
    return { types: new Set([type]), elements: [], values: editor.style };
  }
  update() {
    if (this.#live) return;
    const context = this.#context();
    const signature =
      context === null
        ? "none"
        : JSON.stringify([
            [...context.types],
            context.values,
            context.elements.map((el) => [el.id, el.locked, el.groupIds.length, el.text.length > 0, el.points.length]),
            this.#editor.hasLocked,
            this.#editor.theme,
          ]);
    if (signature === this.#signature) return;
    this.#signature = signature;
    this.element.hidden = context === null;
    clear(this.#body);
    if (context === null) return;
    this.#build(context);
  }
  #build(context) {
    const { types, values, elements } = context;
    const editor = this.#editor;
    const any = (predicate) => [...types].some(predicate);
    const hasLabelText = elements.some((el) => canHoldLabel(el) && el.text.length > 0);
    const onlyImages = [...types].every((type) => type === "image");
    const shapes = any((type) => isShape({ type }));
    const linear = any((type) => isLinear({ type }));
    const strokeTargets = any((type) => type !== "image");
    const strokeWidthTargets = any((type) => type !== "image" && type !== "text");
    const textTargets = types.has("text") || hasLabelText;
    const set = (patch, continuous = false) => editor.setStyle(patch, { continuous });
    if (strokeTargets) {
      const label = [...types].every((type) => type === "text") ? t("Kolor tekstu") : t("Kreska");
      this.#body.append(
        this.#colorRow(label, STROKE_COLORS, values.strokeColor, (color, continuous) =>
          set({ strokeColor: color }, continuous),
        ),
      );
    }
    if (shapes) {
      this.#body.append(
        this.#colorRow(t("Wypełnienie"), FILL_COLORS, values.fillColor, (color, continuous) =>
          set({ fillColor: color }, continuous),
        ),
      );
      if (values.fillColor !== "transparent") {
        this.#body.append(
          this.#segmented(t("Styl wypełnienia"),
            values.fillStyle,
            [
              { value: "hachure", label: t("Kreskowanie"), html: glyph.fill("hachure") },
              { value: "cross", label: t("Krata"), html: glyph.fill("cross") },
              { value: "solid", label: t("Pełne"), html: glyph.fill("solid") },
            ],
            (fillStyle) => set({ fillStyle }),
          ),
        );
      }
    }
    if (strokeWidthTargets) {
      this.#body.append(
        this.#segmented(t("Grubość"),
          values.strokeWidth,
          [
            { value: 1, label: t("Cienka"), html: glyph.width(1.2) },
            { value: 2, label: t("Średnia"), html: glyph.width(2.4) },
            { value: 4, label: t("Gruba"), html: glyph.width(4) },
          ],
          (strokeWidth) => set({ strokeWidth }),
        ),
      );
    }
    if (shapes || linear) {
      this.#body.append(
        this.#segmented(t("Linia"),
          values.strokeStyle,
          [
            { value: "solid", label: t("Ciągła"), html: glyph.strokeStyle("solid") },
            { value: "dashed", label: t("Kreskowana"), html: glyph.strokeStyle("dashed") },
            { value: "dotted", label: t("Kropkowana"), html: glyph.strokeStyle("dotted") },
          ],
          (strokeStyle) => set({ strokeStyle }),
        ),
      );
      this.#body.append(
        this.#segmented(t("Szkicowość"),
          values.roughness,
          [
            { value: 0, label: t("Precyzyjnie"), html: glyph.roughness(0) },
            { value: 1, label: t("Odręcznie"), html: glyph.roughness(1) },
            { value: 2, label: t("Na luzie"), html: glyph.roughness(2) },
          ],
          (roughness) => set({ roughness }),
        ),
      );
    }
    if (types.has("rectangle") || types.has("diamond")) {
      this.#body.append(
        this.#segmented(t("Narożniki"),
          values.rounded,
          [
            { value: false, label: t("Ostre"), html: glyph.corner(false) },
            { value: true, label: t("Zaokrąglone"), html: glyph.corner(true) },
          ],
          (rounded) => set({ rounded }),
        ),
      );
    } else if (linear) {
      this.#body.append(
        this.#segmented(t("Przebieg"),
          values.rounded,
          [
            { value: false, label: t("Łamana"), html: glyph.lineShape(false) },
            { value: true, label: t("Łuk"), html: glyph.lineShape(true) },
          ],
          (rounded) => set({ rounded }),
        ),
      );
    }
    if (types.has("arrow")) {
      const heads = ["none", "arrow", "triangle", "dot", "bar"];
      const names = { none: t("Brak"), arrow: t("Grot"), triangle: t("Trójkąt"), dot: t("Kropka"), bar: t("Kreska") };
      this.#body.append(
        this.#segmented(t("Początek"),
          values.startArrow,
          heads.map((kind) => ({ value: kind, label: names[kind], html: glyph.arrowhead(kind, true) })),
          (startArrow) => set({ startArrow }),
          true,
        ),
        this.#segmented(t("Koniec"),
          values.endArrow,
          heads.map((kind) => ({ value: kind, label: names[kind], html: glyph.arrowhead(kind, false) })),
          (endArrow) => set({ endArrow }),
          true,
        ),
      );
    }
    if (textTargets) {
      this.#body.append(
        this.#segmented(t("Pismo"),
          values.fontFamily,
          [
            { value: "hand", label: t("Odręczne"), html: '<span class="font-sample font-sample--hand">Aa</span>' },
            { value: "sans", label: t("Bezszeryfowe"), html: '<span class="font-sample font-sample--sans">Aa</span>' },
            { value: "mono", label: t("Kod"), html: '<span class="font-sample font-sample--mono">{}</span>' },
          ],
          (fontFamily) => set({ fontFamily }),
        ),
        this.#segmented(t("Rozmiar"),
          values.fontSize,
          FONT_SIZES.map((size) => ({
            value: size.value,
            label: t("Rozmiar {size}", { size: size.label }),
            html: `<span class="size-sample">${size.label}</span>`,
          })),
          (fontSize) => set({ fontSize }),
        ),
        this.#segmented(t("Wyrównanie"),
          values.textAlign,
          [
            { value: "left", label: t("Do lewej"), html: glyph.align("left") },
            { value: "center", label: t("Do środka"), html: glyph.align("center") },
            { value: "right", label: t("Do prawej"), html: glyph.align("right") },
          ],
          (textAlign) => set({ textAlign }),
        ),
      );
    }
    this.#body.append(this.#opacity(values.opacity));
    if (elements.length === 0) return;
    if (onlyImages && elements.length === 1) {
      // Images only get opacity + arrangement.
    }
    this.#body.append(this.#actions(elements));
  }
  #row(label, control) {
    return h("div", { class: "field" }, h("div", { class: "field__label" }, label), control);
  }
  #colorRow(label, colors, current, apply) {
    const row = h("div", { class: "swatches", role: "radiogroup", "aria-label": label });
    const known = colors.includes(current);
    for (const color of colors) {
      const name = COLOR_NAMES[color] === undefined ? color : t(COLOR_NAMES[color]);
      row.append(
        h("button", {
          type: "button",
          class: `swatch${color === "transparent" ? " swatch--none" : ""}${color === current ? " is-active" : ""}`,
          role: "radio",
          "aria-checked": String(color === current),
          "aria-label": name,
          "data-tip": name,
          style: color === "transparent" ? null : `--swatch:${paintColor(color, this.#editor.theme === "dark")}`,
          onclick: () => apply(color, false),
        }),
      );
    }
    const custom = h("input", {
      type: "color",
      class: "swatch-input",
      value: /^#[0-9a-f]{6}$/i.test(current) ? current : "#1f1d1a",
      "aria-label": t("{label}: własny kolor", { label }),
    });
    let started = false;
    custom.addEventListener("input", () => {
      apply(custom.value, started);
      started = true;
    });
    custom.addEventListener("change", () => {
      started = false;
      this.#editor.store.beginStep();
    });
    row.append(
      h(
        "label",
        {
          class: `swatch swatch--custom${!known && current !== "transparent" ? " is-active" : ""}`,
          "data-tip": t("Własny kolor"),
          style: !known ? `--swatch:${paintColor(current, this.#editor.theme === "dark")}` : null,
        },
        custom,
      ),
    );
    return this.#row(label, row);
  }
  #segmented(label, current, options, apply, compact = false) {
    const group = h("div", {
      class: `segmented${compact ? " segmented--compact" : ""}`,
      role: "radiogroup",
      "aria-label": label,
    });
    for (const option of options) {
      const active = option.value === current;
      group.append(
        h("button", {
          type: "button",
          class: `segmented__item${active ? " is-active" : ""}`,
          role: "radio",
          "aria-checked": String(active),
          "aria-label": option.label,
          "data-tip": option.label,
          html: option.html,
          onclick: () => apply(option.value),
        }),
      );
    }
    return this.#row(label, group);
  }
  #opacity(current) {
    const output = h("output", { class: "range__value" }, `${Math.round(current)}%`);
    const input = h("input", {
      type: "range",
      class: "range",
      min: 10,
      max: 100,
      step: 5,
      value: current,
      "aria-label": t("Krycie"),
    });
    let started = false;
    input.addEventListener("pointerdown", () => {
      this.#editor.store.beginStep();
      started = true;
    });
    input.addEventListener("input", () => {
      output.textContent = `${input.value}%`;
      this.#editor.setStyle({ opacity: Number(input.value) }, { continuous: started });
    });
    input.addEventListener("change", () => {
      started = false;
      this.#editor.store.beginStep();
    });
    return this.#row(t("Krycie"), h("div", { class: "range-row" }, input, output));
  }
  #actions(elements) {
    const editor = this.#editor;
    const button = (name, label, action, disabled = false) =>
      h("button", {
        type: "button",
        class: "icon-button",
        "aria-label": label,
        "data-tip": label,
        disabled,
        html: icon(name),
        onclick: action,
      });
    const groups = new Set(elements.map((el) => el.groupIds[el.groupIds.length - 1]).filter(Boolean));
    const units = new Set(elements.map((el) => el.groupIds[el.groupIds.length - 1] ?? el.id));
    const locked = elements.every((el) => el.locked);
    const wrap = h("div", { class: "inspector__actions" });
    wrap.append(
      this.#row(t("Warstwy"),
        h(
          "div",
          { class: "button-row" },
          button("back", t("Na spód"), () => editor.reorder("back")),
          button("backward", `${t("Niżej")} · ${MOD}+[`, () => editor.reorder("backward")),
          button("forward", `${t("Wyżej")} · ${MOD}+]`, () => editor.reorder("forward")),
          button("front", t("Na wierzch"), () => editor.reorder("front")),
        ),
      ),
    );
    if (units.size >= 2) {
      wrap.append(
        this.#row(t("Wyrównaj"),
          h(
            "div",
            { class: "button-row button-row--wrap" },
            button("alignLeft", t("Do lewej"), () => editor.align("left")),
            button("alignHCenter", t("Środek w poziomie"), () => editor.align("hcenter")),
            button("alignRight", t("Do prawej"), () => editor.align("right")),
            button("distributeX", t("Rozłóż w poziomie"), () => editor.distribute("x"), units.size < 3),
            button("alignTop", t("Do góry"), () => editor.align("top")),
            button("alignVCenter", t("Środek w pionie"), () => editor.align("vcenter")),
            button("alignBottom", t("Do dołu"), () => editor.align("bottom")),
            button("distributeY", t("Rozłóż w pionie"), () => editor.distribute("y"), units.size < 3),
          ),
        ),
      );
    }
    wrap.append(
      this.#row(t("Akcje"),
        h(
          "div",
          { class: "button-row" },
          button("duplicate", `${t("Duplikuj")} · ${MOD}+D`, () => editor.duplicateSelection()),
          units.size >= 2
            ? button("group", `${t("Grupuj")} · ${MOD}+G`, () => editor.groupSelection())
            : button("ungroup", `${t("Rozgrupuj")} · ${MOD}+Shift+G`, () => editor.ungroupSelection(), groups.size === 0),
          button(locked ? "unlock" : "lock", locked ? t("Odblokuj") : `${t("Zablokuj")} · ${MOD}+Shift+L`, () =>
            editor.toggleLockSelection(),
          ),
          button("trash", t("Usuń · Delete"), () => editor.deleteSelection()),
        ),
      ),
    );
    return wrap;
  }
}
