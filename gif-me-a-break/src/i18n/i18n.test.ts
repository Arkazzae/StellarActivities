import { describe, expect, it } from "vitest";
import { englishTopics, localTopic, TOPICS } from "../game/topics.ts";
import { count, isErrorCode, langOf, translate } from "./index.ts";

describe("languages", () => {
  it("picks Polish for pl locales and English for the rest", () => {
    expect(langOf("pl")).toBe("pl");
    expect(langOf("pl-PL")).toBe("pl");
    expect(langOf("en-US")).toBe("en");
    expect(langOf("de")).toBe("en");
    expect(langOf(undefined)).toBe("en");
  });

  it("fills parameters", () => {
    expect(translate("pl", "round", { n: 2, total: 8 })).toBe("Runda 2 z 8");
    expect(translate("en", "round", { n: 2, total: 8 })).toBe("Round 2 of 8");
  });

  it("counts in both languages", () => {
    expect([1, 2, 5, 12, 22, 25].map((n) => count("pl", n, "votes"))).toEqual(["1 głos", "2 głosy", "5 głosów", "12 głosów", "22 głosy", "25 głosów"]);
    expect([1, 2].map((n) => count("en", n, "votes"))).toEqual(["1 vote", "2 votes"]);
  });

  it("knows every refusal code the rules send", async () => {
    const rules = await import("node:fs").then((fs) => fs.readFileSync(new URL("../game/rules.ts", import.meta.url), "utf8"));
    const codes = [...rules.matchAll(/refuse\("([A-Za-z]+)"\)/g)].map((m) => m[1]);
    expect(codes.length).toBeGreaterThan(15);
    for (const code of codes) expect(isErrorCode(code), code).toBe(true);
  });

  it("has every topic in English, with the name slot where Polish has it", () => {
    const en = englishTopics();
    for (const t of TOPICS) {
      expect(en[t.id], t.id).toBeTruthy();
      expect(en[t.id].includes("{gracz}"), t.id).toBe(t.text.includes("{gracz}"));
    }
  });

  it("shows each player the topic in their language with the same name", () => {
    const shared = { id: "c18", text: "Bartek po znalezieniu 20 zł w starej kurtce", name: "Bartek" };
    expect(localTopic(shared, "en").text).toBe("Bartek after finding a twenty in an old jacket");
    expect(localTopic(shared, "pl").text).toBe(shared.text);
  });
});
