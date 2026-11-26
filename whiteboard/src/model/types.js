export const ELEMENT_FIELDS = [
  "type",
  "x",
  "y",
  "width",
  "height",
  "angle",
  "z",
  "seed",
  "strokeColor",
  "fillColor",
  "fillStyle",
  "strokeWidth",
  "strokeStyle",
  "roughness",
  "opacity",
  "rounded",
  "groupIds",
  "locked",
  "text",
  "fontFamily",
  "fontSize",
  "textAlign",
  "points",
  "pressures",
  "startArrow",
  "endArrow",
  "startBind",
  "endBind",
  "fileId",
  "updated",
];
export const DEFAULT_STYLE = {
  strokeColor: "#1f1d1a",
  fillColor: "transparent",
  fillStyle: "hachure",
  strokeWidth: 2,
  strokeStyle: "solid",
  roughness: 1,
  opacity: 100,
  rounded: true,
  fontFamily: "hand",
  fontSize: 24,
  textAlign: "left",
  startArrow: "none",
  endArrow: "arrow",
};
export const isLinear = (el) => el.type === "line" || el.type === "arrow";
export const isShape = (el) => el.type === "rectangle" || el.type === "diamond" || el.type === "ellipse";
/** Elements that can hold a centred label. */
export const canHoldLabel = (el) => isShape(el);
/** Elements an arrow can attach to. */
export const isBindable = (el) => isShape(el) || el.type === "text" || el.type === "image";
const ID_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
/** 10 random base-36 characters: short keys keep the shared room state small. */
export const newId = () => {
  const bytes = new Uint8Array(10);
  globalThis.crypto.getRandomValues(bytes);
  let id = "";
  for (const byte of bytes) id += ID_ALPHABET[byte % 36];
  return id;
};
export const newSeed = () => Math.floor(Math.random() * 2 ** 31);
export const createElement = (type, init, style = DEFAULT_STYLE) => ({
  id: newId(),
  type,
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  angle: 0,
  seed: newSeed(),
  strokeColor: style.strokeColor,
  fillColor:
    type === "line" || type === "arrow" || type === "freedraw" || type === "text" ? "transparent" : style.fillColor,
  fillStyle: style.fillStyle,
  strokeWidth: style.strokeWidth,
  strokeStyle: type === "freedraw" ? "solid" : style.strokeStyle,
  roughness: style.roughness,
  opacity: style.opacity,
  rounded: type === "line" || type === "arrow" ? false : style.rounded,
  groupIds: [],
  locked: false,
  text: "",
  fontFamily: style.fontFamily,
  fontSize: style.fontSize,
  textAlign: type === "text" ? style.textAlign : "center",
  points: [],
  pressures: [],
  startArrow: type === "arrow" ? style.startArrow : "none",
  endArrow: type === "arrow" ? style.endArrow : "none",
  startBind: null,
  endBind: null,
  fileId: "",
  updated: Date.now(),
  ...init,
});
