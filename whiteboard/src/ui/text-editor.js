import { t } from "../i18n.js";
import { paintColor } from "../render/color.js";
import { FONT_STACK, labelLayout, LINE_HEIGHT } from "../render/text.js";
/**
 * In-place text editing: a transparent textarea laid exactly over the element
 * (rotated with it). The canvas hides the element's own text meanwhile.
 */
export class TextEditor {
  element;
  #editor;
  #id = null;
  #closing = false;
  constructor(editor) {
    this.#editor = editor;
    this.element = document.createElement("textarea");
    this.element.className = "text-editor";
    this.element.hidden = true;
    this.element.spellcheck = true;
    this.element.setAttribute("aria-label", t("Edycja tekstu"));
    this.element.setAttribute("autocapitalize", "sentences");
    this.element.addEventListener("input", () => {
      this.#editor.updateEditingText(this.element.value);
      this.#position();
    });
    this.element.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Escape" || (event.key === "Enter" && (event.ctrlKey || event.metaKey))) {
        event.preventDefault();
        this.close();
      }
    });
    this.element.addEventListener("blur", () => this.close());
  }
  open(el) {
    const reopening = this.#id === el.id && !this.element.hidden;
    this.#id = el.id;
    if (!reopening) {
      this.element.value = el.text;
      this.element.hidden = false;
    }
    this.#position();
    if (!reopening) {
      // Focus after the pointer event finishes: the canvas' own mousedown
      // default action would otherwise steal focus and close the editor.
      const id = el.id;
      setTimeout(() => {
        if (this.#id !== id) return;
        this.element.focus({ preventScroll: true });
        const length = this.element.value.length;
        this.element.setSelectionRange(length, length);
        if (el.text.length > 0 && el.type !== "text") this.element.select();
      }, 0);
    }
  }
  close() {
    if (this.#closing || this.#id === null) return;
    this.#closing = true;
    this.#id = null;
    this.element.hidden = true;
    this.#editor.finishEditing();
    this.#closing = false;
  }
  get isOpen() {
    return this.#id !== null;
  }
  #position() {
    if (this.#id === null) return;
    const el = this.#editor.store.get(this.#id);
    if (el === undefined) {
      this.close();
      return;
    }
    const zoom = this.#editor.zoom;
    const style = this.element.style;
    const fontSize = el.fontSize * zoom;
    const lineHeight = el.fontSize * LINE_HEIGHT;
    style.font = `${fontSize}px ${FONT_STACK[el.fontFamily]}`;
    style.lineHeight = String(LINE_HEIGHT);
    style.textAlign = el.textAlign;
    style.color = paintColor(el.strokeColor, this.#editor.theme === "dark");
    style.opacity = String(Math.max(0.35, el.opacity / 100));
    style.transform = `rotate(${el.angle}rad)`;
    if (el.type === "text") {
      const width = Math.max(el.width, el.fontSize) + el.fontSize;
      const left =
        el.textAlign === "left"
          ? el.x
          : el.textAlign === "center"
            ? el.x + el.width / 2 - width / 2
            : el.x + el.width - width;
      const topLeft = this.#editor.sceneToScreen(left, el.y);
      style.left = `${topLeft.x}px`;
      style.top = `${topLeft.y}px`;
      style.width = `${width * zoom}px`;
      style.height = `${Math.max(el.height, lineHeight) * zoom}px`;
      style.whiteSpace = "pre";
      // Rotate around the element centre, not the (wider) textarea centre.
      style.transformOrigin = `${(el.x + el.width / 2 - left) * zoom}px ${(el.height / 2) * zoom}px`;
    } else {
      const box = labelLayout(el);
      const height = Math.max(1, box.lines.length) * lineHeight;
      const top = box.y;
      const topLeft = this.#editor.sceneToScreen(el.x + box.x, el.y + top);
      style.left = `${topLeft.x}px`;
      style.top = `${topLeft.y}px`;
      style.width = `${box.width * zoom}px`;
      style.height = `${height * zoom}px`;
      style.whiteSpace = "pre-wrap";
      style.transformOrigin = `${(el.width / 2 - box.x) * zoom}px ${(el.height / 2 - top) * zoom}px`;
    }
  }
}
