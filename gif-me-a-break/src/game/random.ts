/**
 * Seeded randomness. Every draw the host makes (topics, the reveal order, tie-breaks) comes
 * from the match id and the round, so a retried command or a new host decides the same way.
 */

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** A generator of numbers in [0, 1) for the given seed (mulberry32). */
export function rng(seed: string): () => number {
  let a = hash(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** A short id derived from a seed, the same on every host (no `crypto.randomUUID`, which plain-HTTP pages lack). */
export const shortId = (seed: string) => (hash(seed).toString(36) + hash(`${seed}#`).toString(36)).slice(0, 10);

export const pick =<T>(items: readonly T[], random: () => number): T => items[Math.floor(random() * items.length)];
