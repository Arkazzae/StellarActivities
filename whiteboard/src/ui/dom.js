/** Minimal element factory: h("button", { class: "x", onclick }, "label"). */
export const h = (tag, attrs = {}, ...children) => {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key.startsWith("on") && typeof value === "function") {
      el.addEventListener(key.slice(2), value);
    } else if (key === "html") {
      el.innerHTML = String(value);
    } else if (value === true) {
      el.setAttribute(key, "");
    } else {
      el.setAttribute(key, String(value));
    }
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.append(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return el;
};
export const clear = (el) => {
  while (el.firstChild !== null) el.firstChild.remove();
};
/** Platform-aware modifier label for shortcuts. */
export const MOD = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";
export const ALT = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌥" : "Alt";

/**
 * Copies text through a synthetic `copy` event. Stellarr's activity frame has
 * no async clipboard permission, but the copy event needs none.
 */
export const copyText = (text) => {
  let done = false;
  const handler = (event) => {
    if (event.clipboardData === null) return;
    event.clipboardData.setData("text/plain", text);
    event.preventDefault();
    event.stopImmediatePropagation();
    done = true;
  };
  window.addEventListener("copy", handler, true);
  try {
    document.execCommand("copy");
  } catch {
    done = false;
  } finally {
    window.removeEventListener("copy", handler, true);
  }
  return done;
};
