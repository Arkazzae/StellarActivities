import { test } from "node:test";
import assert from "node:assert/strict";
import { MODES } from "./modes.ts";
import { buildPlan, isTextKind } from "./plan.ts";
import { CANVAS_H, CANVAS_W } from "./types.ts";
import type { Length, PageRef, Rect, TaskKind } from "./types.ts";

const IMAGE_KINDS: ReadonlySet<TaskKind> = new Set(["draw", "copy", "scribble", "add", "hole", "frame", "background", "part", "tile", "masterpiece"]);
const lengths: Length[] = ["short", "full"];

function insideCanvas(rect: Rect) {
  return rect.x >= 0 && rect.y >= 0 && rect.w > 0 && rect.h > 0 && rect.x + rect.w <= CANVAS_W + 1 && rect.y + rect.h <= CANVAS_H + 1;
}

for (const mode of MODES) {
  for (const length of lengths) {
    test(`${mode.id} (${length}) plans a consistent match for every table size`, () => {
      for (let n = Math.max(1, mode.min); n <= 14; n++) {
        const plan = buildPlan({ mode: mode.id, tempo: "normal", length }, n, `seed-${mode.id}-${n}`);
        const label = `${mode.id}/${length}/${n}`;
        assert.ok(plan.rounds.length >= 2, `${label}: at least two rounds`);
        const written = new Map<string, number>(); // page -> round it was written in
        plan.rounds.forEach((round, r) => {
          assert.equal(round.tasks.length, n, `${label}: one task per player`);
          assert.ok(round.seconds >= 10, `${label}: round ${r} has time`);
          const pagesThisRound = new Set<string>();
          round.tasks.forEach((task, i) => {
            assert.equal(task.kind, round.kind, `${label}: one task kind per round`);
            const key = `${task.album}:${task.page}`;
            assert.ok(!written.has(key) && !pagesThisRound.has(key), `${label}: page ${key} written twice`);
            pagesThisRound.add(key);
            assert.equal(plan.albums[task.album].authors[task.page], i, `${label}: author recorded`);
            assert.equal(task.output === "text", isTextKind(task.kind), `${label}: output matches kind`);
            const earlier = (ref: PageRef | undefined, want: "text" | "image") => {
              if (!ref) return;
              const at = written.get(`${ref.album}:${ref.page}`);
              assert.ok(at !== undefined && at < r, `${label}: round ${r} reads ${ref.album}:${ref.page} before it exists`);
              const kind = plan.albums[ref.album].kinds[ref.page];
              assert.equal(want === "text" ? isTextKind(kind) : IMAGE_KINDS.has(kind), true, `${label}: ${ref.album}:${ref.page} is a ${want} page`);
            };
            earlier(task.prompt, "text");
            earlier(task.source, "image");
            earlier(task.onion, "image");
            task.base?.forEach((ref) => earlier(ref, "image"));
            for (const rect of [task.clip, task.peek, task.hole]) if (rect) assert.ok(insideCanvas(rect), `${label}: rect inside canvas`);
          });
          for (const key of pagesThisRound) written.set(key, r);
        });
        plan.albums.forEach((album, a) => {
          for (let p = 0; p < album.kinds.length; p++) assert.ok(album.kinds[p], `${label}: album ${a} has no gap at page ${p}`);
          if (album.shown) assert.ok(album.kinds.length >= 2, `${label}: shown album ${a} has content`);
        });
        assert.ok(plan.albums.some((album) => album.shown), `${label}: something to reveal`);
        const bytes = new TextEncoder().encode(JSON.stringify(plan)).length;
        assert.ok(bytes < 120_000, `${label}: plan fits comfortably in shared state (${bytes} B)`);
      }
    });
  }
}

test("chains hand every album to a new player each round when there are enough players", () => {
  for (const id of ["classic", "story", "memory", "sandwich", "missing", "scribble", "score", "relay", "background", "corpse"] as const) {
    const plan = buildPlan({ mode: id, tempo: "normal", length: "full" }, 6, "s");
    for (const album of plan.albums.filter((a) => a.shown)) {
      const authors = album.authors.filter((author) => author !== undefined);
      assert.equal(new Set(authors).size, authors.length, `${id}: an album never returns to the same player`);
    }
  }
});

test("Kineograf keeps one artist per animation", () => {
  const plan = buildPlan({ mode: "flipbook", tempo: "normal", length: "full" }, 4, "s");
  for (const album of plan.albums) assert.equal(new Set(album.authors.slice(1)).size, 1);
});

test("Mieszanka draws a rule for every drawing round", () => {
  const plan = buildPlan({ mode: "mix", tempo: "normal", length: "full" }, 8, "abc");
  for (const round of plan.rounds.filter((r) => r.kind === "draw")) assert.ok(round.rule);
});

test("Własne zasady plan every order, rule and round count", () => {
  const orders = ["write", "draw", "drawings", "texts"] as const;
  const rules = ["none", "mix", "stars", "oneline", "kaleido", "crayons", "blind", "telegram"] as const;
  for (const order of orders) {
    for (const rule of rules) {
      for (const n of [1, 2, 3, 6, 14]) {
        for (const rounds of [0, 2, 5, 30]) {
          const plan = buildPlan({ mode: "custom", tempo: "normal", length: "full", custom: { order, rule, rounds, write: 30, draw: 120 } }, n, "c");
          const label = `${order}/${rule}/${n}/${rounds}`;
          const expected = rounds === 0 ? (n <= 1 ? 4 : Math.max(2, n)) : Math.min(Math.max(2, rounds), n <= 1 ? 8 : Math.max(2, n));
          assert.equal(plan.rounds.length, expected, `${label}: round count`);
          const written = new Set<string>();
          plan.rounds.forEach((round, r) => {
            const text = isTextKind(round.kind);
            assert.equal(round.seconds, text ? 30 : 120, `${label}: custom time`);
            if (order === "texts") assert.ok(text, `${label}: sentences only`);
            if (order === "drawings") assert.ok(!text, `${label}: drawings only`);
            if (r === 0) assert.equal(text, order === "write" || order === "texts", `${label}: first task`);
            for (const task of round.tasks) {
              for (const ref of [task.prompt, task.source]) if (ref) assert.ok(written.has(`${ref.album}:${ref.page}`), `${label}: reads an earlier page`);
            }
            round.tasks.forEach((task) => written.add(`${task.album}:${task.page}`));
          });
        }
      }
    }
  }
});

test("Własne zasady ignore nonsense from shared state", () => {
  const plan = buildPlan({ mode: "custom", tempo: "normal", length: "full", custom: { order: "boom" as never, rule: "hack" as never, rounds: -4, write: 1, draw: 99999 } }, 3, "c");
  assert.equal(plan.rounds.length, 3);
  assert.equal(plan.rounds[0].seconds, 10);
  assert.equal(plan.rounds[1].seconds, 300);
});
