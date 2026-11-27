import { describe, expect, it } from "vitest";
import { bannedWords, breaksBan } from "./ban.ts";

describe("Zakaz słów", () => {
  const topic = { id: "x", text: "Bartek po znalezieniu 20 zł w starej kurtce", name: "Bartek" };

  it("bans the meaningful words of the topic", () => {
    expect(bannedWords(topic)).toEqual(["bartek", "znalezieniu", "starej", "kurtce"]);
  });

  it("catches other forms of a banned word, ignoring Polish letters", () => {
    const banned = bannedWords(topic);
    expect(breaksBan("kurtka", banned)).toBe("kurtce");
    expect(breaksBan("znalezisko", banned)).toBe("znalezieniu");
    expect(breaksBan("KURTKĘ zimową", banned)).toBe("kurtce");
  });

  it("lets other searches through", () => {
    const banned = bannedWords(topic);
    expect(breaksBan("bogacz", banned)).toBeNull();
    expect(breaksBan("taniec radości", banned)).toBeNull();
    expect(breaksBan("", banned)).toBeNull();
  });
});

describe("Banned words in English", () => {
  it("bans the English topic's words and their other forms", () => {
    const topic = { id: "c18", text: "Bartek after finding a twenty in an old jacket", name: "Bartek" };
    const banned = bannedWords(topic);
    expect(banned).toEqual(["bartek", "finding", "twenty", "jacket"]);
    expect(breaksBan("jackets", banned)).toBe("jacket");
    expect(breaksBan("rich", banned)).toBeNull();
  });
});
