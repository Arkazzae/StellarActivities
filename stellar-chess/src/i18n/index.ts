/**
 * Lightweight i18n module: English or Polish. Starts in Stellarr's interface language; a language
 * picked in the settings is saved with the player's progress and wins from then on.
 */

import { useSyncExternalStore } from "react";
import en from "./en.json";
import pl from "./pl.json";

type Translations = Record<string, string>;
export type Locale = "en" | "pl";

const locales: Record<Locale, Translations> = { en, pl };
const listeners = new Set<() => void>();

const SAVED_KEY = "locale";

let currentLocale: Locale = "en";
/** Whether the player picked a language themselves, so Stellarr's own language no longer applies. */
let chosen = false;

function apply(nextLocale: Locale): void {
  if (currentLocale === nextLocale) return;
  currentLocale = nextLocale;
  if (typeof document !== "undefined") document.documentElement.lang = nextLocale;
  listeners.forEach((listener) => listener());
}

/** BCP 47 tag (Stellarr's or the browser's) to a supported language. */
export function localeFrom(tag: string | null | undefined): Locale {
  return tag?.toLowerCase().startsWith("pl") ? "pl" : "en";
}

/** Start in the saved choice if there is one, otherwise in the host's language. */
export function initLocale(hostLocale: string, saved: unknown): void {
  chosen = saved === "pl" || saved === "en";
  apply(chosen ? saved as Locale : localeFrom(hostLocale));
  if (typeof document !== "undefined") document.documentElement.lang = currentLocale;
}

/** Stellarr's interface language changed: follow it unless the player picked one. */
export function followHostLocale(hostLocale: string): void {
  if (!chosen) apply(localeFrom(hostLocale));
}

let rememberLocale: (locale: Locale) => void = () => undefined;

/** The player's own choice, saved with their progress. */
export function setLocale(locale: string): void {
  const nextLocale: Locale = locale === "pl" ? "pl" : "en";
  chosen = true;
  rememberLocale(nextLocale);
  apply(nextLocale);
}

/** Where a picked language is saved; set once at start-up. */
export function setLocaleStore(store: (locale: Locale) => void): void {
  rememberLocale = store;
}

export { SAVED_KEY as LOCALE_KEY };

export function getLocale(): Locale {
  return currentLocale;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Subscribe a component to live locale changes. */
export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, getLocale, getLocale);
}

/** Translation helper that also makes the calling component reactive. */
export function useTranslation() {
  const locale = useLocale();
  return { locale, t, setLocale } as const;
}

/**
 * Translate a key with optional interpolation.
 * Usage: t("result.wins", { name: "Geralt" }) → "Geralt wins!"
 */
export function t(key: string, params?: Record<string, string | number>): string {
  const translations = locales[currentLocale] || en;
  let text = translations[key] ?? en[key as keyof typeof en] ?? key;

  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replaceAll(`{${k}}`, String(v));
    }
  }

  return text;
}

/**
 * A key with a count: `key.one`, `key.few`, `key.many` or `key.other`, by the language's plural
 * rules (Polish has all four; English uses one and other). `{n}` is the count.
 */
export function tn(key: string, count: number, params?: Record<string, string | number>): string {
  const translations = locales[currentLocale] || en;
  const form = `${key}.${new Intl.PluralRules(formatLocale()).select(count)}`;
  return t(form in translations ? form : `${key}.other`, { n: count, ...params });
}

/** BCP 47 tag for number formatting in the current language. */
export function formatLocale(): string {
  return currentLocale === "pl" ? "pl-PL" : "en-US";
}
