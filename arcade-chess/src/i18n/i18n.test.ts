import { afterEach, describe, expect, it } from "vitest";
import en from "./en.json";
import pl from "./pl.json";
import { followHostLocale, getLocale, initLocale, setLocale, t } from "./index";

afterEach(() => setLocale("en"));

describe("translations", () => {
  it("keeps the English and Polish dictionaries in sync", () => {
    expect(Object.keys(pl).sort()).toEqual(Object.keys(en).sort());
    expect(Object.values(pl).every((value) => value.trim().length > 0)).toBe(true);
  });

  it("switches locale and interpolates values", () => {
    setLocale("pl");

    expect(getLocale()).toBe("pl");
    expect(t("engine.summary", { skill: 5, depth: 8 })).toBe("Poziom 5 · głęb. 8");
  });

  it("falls back to English for unsupported locales", () => {
    setLocale("de");

    expect(getLocale()).toBe("en");
    expect(t("settings.title")).toBe("Settings");
  });
});

describe("language choice", () => {
  it("starts in Stellarr's language and follows it until the player picks one", () => {
    initLocale("pl-PL", null);
    expect(getLocale()).toBe("pl");
    followHostLocale("en-GB");
    expect(getLocale()).toBe("en");
    setLocale("pl");
    followHostLocale("en-US");
    expect(getLocale()).toBe("pl");
  });

  it("prefers a saved choice over Stellarr's language", () => {
    initLocale("en-US", "pl");
    expect(getLocale()).toBe("pl");
  });
});
