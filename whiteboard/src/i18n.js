import { EN } from "./i18n-en.js";

/**
 * Polish source strings are the keys; English comes from i18n-en.js.
 * Stellarr passes the person's UI locale through `session.locale`.
 */
let english = true;

export const setLocale = (locale) => {
  english = !String(locale ?? "").toLowerCase().startsWith("pl");
  if (typeof document !== "undefined") document.documentElement.lang = english ? "en" : "pl";
};

export const isEnglish = () => english;

/** t("Usuń {n} elementów", { n: 3 }) */
export const t = (key, params) => {
  const text = english ? (EN[key] ?? key) : key;
  if (params === undefined) return text;
  return text.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
};

/** Polish has three plural forms; English two. Pass the Polish forms as keys. */
export const plural = (count, one, few, many) => {
  if (english) return t(count === 1 ? one : many, { n: count });
  const lastTwo = count % 100;
  const last = count % 10;
  if (count === 1) return t(one, { n: count });
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return t(few, { n: count });
  return t(many, { n: count });
};
