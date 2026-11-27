/**
 * Zakaz słów: the words of the topic may not be searched. Polish bends words, so a search
 * breaks the ban when one of its words (four letters or more) shares its first four letters
 * with a banned word. Short and common words are not banned.
 */
import type { Topic } from "./types.ts";

const STOP = new Set([
  "kiedy", "gdy", "przy", "jest", "się", "sie", "akurat", "tylko", "przed", "po", "na", "do", "od", "za", "ze", "w", "z",
  "i", "a", "o", "u", "nie", "ktoś", "ktos", "który", "ktory", "która", "ktora", "które", "ktore", "jak", "już", "juz",
  "cały", "caly", "czas", "twój", "twoj", "twoją", "twoja", "twoje", "swoją", "swoja", "swojej", "trzy", "pięć", "piec",
  // English
  "when", "your", "with", "from", "that", "this", "after", "before", "someone", "just", "into", "what", "about", "over",
  "every", "their", "there", "have", "than", "then", "still", "while", "they", "them", "right", "where", "it's", "that's",
  "you're", "five", "three", "seven",
]);

const fold = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l");

const words = (text: string) => fold(text).split(/[^a-z0-9]+/).filter(Boolean);

/** Four letters: enough to tell words apart, short enough to survive "kurtka" → "kurtce". */
const stem = (word: string) => word.slice(0, 4);

/** The topic's words that may not be searched, as written in the topic. */
export function bannedWords(topic: Topic | null): string[] {
  if (!topic) return [];
  const out: string[] = [];
  for (const raw of topic.text.split(/[^\p{L}\p{N}]+/u)) {
    if (!raw) continue;
    const folded = fold(raw);
    if (folded.length < 4 || STOP.has(raw.toLowerCase()) || STOP.has(folded) || /^\d+$/.test(folded)) continue;
    if (!out.some((w) => stem(fold(w)) === stem(folded))) out.push(raw.toLowerCase());
  }
  return out;
}

/** The banned word the query uses, or null. */
export function breaksBan(query: string, banned: string[]): string | null {
  const stems = banned.map((w) => stem(fold(w)));
  for (const word of words(query)) {
    if (word.length < 4) continue;
    const i = stems.indexOf(stem(word));
    if (i >= 0) return banned[i];
  }
  return null;
}
