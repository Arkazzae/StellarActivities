import assert from "node:assert/strict";
import { test } from "node:test";
import { routeArrow } from "../src/editor/bindings.js";
import { cloneForInsert, parseBoardFile, serializeBoard } from "../src/editor/clipboard.js";
import { resizeElement, resizeMany, rotateMany } from "../src/editor/transform.js";
import { selectionFrame } from "../src/editor/handles.js";
import { bindingPoint, elementBounds, hitElement, rebaseLinear, toLocal, toWorld } from "../src/model/geometry.js";
import { createElement } from "../src/model/types.js";
import { hatchSegments, inkOutline, Rng } from "../src/render/rough.js";
import { buildDrawable } from "../src/render/shapes.js";
import { darkColor, deepen } from "../src/render/color.js";

const close = (actual, expected, epsilon = 1e-6, message = "") =>
  assert.ok(Math.abs(actual - expected) <= epsilon, `${message} expected ${expected}, got ${actual}`);

const rect = (patch = {}) =>
  createElement("rectangle", { z: "a0", x: 0, y: 0, width: 100, height: 50, seed: 42, ...patch });

test("local/world transforms round-trip for rotated elements", () => {
  const el = rect({ x: 10, y: 20, angle: 0.7 });
  for (const [lx, ly] of [
    [0, 0],
    [100, 50],
    [37, 12],
  ]) {
    const world = toWorld(el, lx, ly);
    const back = toLocal(el, world.x, world.y);
    close(back.x, lx);
    close(back.y, ly);
  }
});

test("unfilled shapes are hit on the outline only; filled ones inside too", () => {
  const empty = rect();
  assert.equal(hitElement(empty, 50, 25, 4), false);
  assert.equal(hitElement(empty, 1, 25, 4), true);
  assert.equal(hitElement(empty, 50, 25, 4, true), true);
  const filled = rect({ fillColor: "#ffd3c4" });
  assert.equal(hitElement(filled, 50, 25, 4), true);
  assert.equal(hitElement(filled, 150, 25, 4), false);
});

test("rotated bounds contain every rotated corner", () => {
  const el = rect({ angle: Math.PI / 4 });
  const box = elementBounds(el);
  for (const [lx, ly] of [
    [0, 0],
    [100, 0],
    [100, 50],
    [0, 50],
  ]) {
    const p = toWorld(el, lx, ly);
    assert.ok(p.x >= box.minX - 1e-6 && p.x <= box.maxX + 1e-6);
    assert.ok(p.y >= box.minY - 1e-6 && p.y <= box.maxY + 1e-6);
  }
});

test("binding point lands on the outline, pushed back by the gap", () => {
  const target = rect({ x: 100, y: 100, width: 100, height: 100 });
  const point = bindingPoint(target, { x: 0, y: 150 }, 5);
  close(point.x, 95);
  close(point.y, 150);
});

test("resizing a rotated element keeps the opposite corner fixed", () => {
  const el = rect({ x: 50, y: 50, width: 120, height: 80, angle: 0.5 });
  const fixedBefore = toWorld(el, 0, 0);
  const dragged = toWorld(el, 160, 110);
  const patch = resizeElement(el, "se", dragged, { keepAspect: false, fromCenter: false });
  const next = { ...el, ...patch };
  const fixedAfter = toWorld(next, 0, 0);
  close(fixedAfter.x, fixedBefore.x, 1e-6, "x");
  close(fixedAfter.y, fixedBefore.y, 1e-6, "y");
  close(next.width, 160);
  close(next.height, 110);
});

test("resizing past the anchor flips linear points", () => {
  const line = createElement("line", {
    z: "a0",
    x: 0,
    y: 0,
    width: 100,
    height: 0,
    points: [
      [0, 0],
      [100, 0],
    ],
  });
  const freehand = {
    ...line,
    type: "freedraw",
    height: 40,
    points: [
      [0, 0],
      [100, 40],
    ],
  };
  const patch = resizeElement(freehand, "e", { x: -50, y: 20 }, { keepAspect: false, fromCenter: false });
  assert.deepEqual(patch.points, [
    [50, 0],
    [0, 40],
  ]);
  close(patch.x ?? NaN, -50);
});

test("multi-resize maps the common box and keeps relative layout", () => {
  const a = rect({ id: "a", x: 0, y: 0, width: 50, height: 50 });
  const b = rect({ id: "b", x: 100, y: 0, width: 50, height: 50 });
  const frame = selectionFrame([a, b]);
  assert.ok(frame !== null);
  const patches = resizeMany([a, b], frame, "e", { x: 300, y: 25 }, { keepAspect: false, fromCenter: false });
  close(patches.get("b")?.x ?? NaN, 200);
  close(patches.get("b")?.width ?? NaN, 100);
  close(patches.get("a")?.x ?? NaN, 0);
});

test("group rotation moves centres around the pivot", () => {
  const el = rect({ x: 100, y: -25, width: 100, height: 50 });
  const patch = rotateMany([el], { x: 0, y: 0 }, Math.PI / 2).get(el.id);
  assert.ok(patch !== undefined);
  close((patch.x ?? 0) + 50, 0, 1e-6);
  close((patch.y ?? 0) + 25, 150, 1e-6);
});

test("rebasing a rotated linear element keeps every point in place", () => {
  const line = createElement("line", {
    z: "a0",
    x: 10,
    y: 10,
    width: 100,
    height: 50,
    angle: 0.9,
    points: [
      [0, 0],
      [100, 50],
    ],
  });
  const moved = [
    [0, 0],
    [100, 50],
    [-40, 80],
  ];
  const worldBefore = moved.map(([px, py]) => toWorld(line, px, py));
  const next = { ...line, ...rebaseLinear(line, moved) };
  next.points.forEach(([px, py], index) => {
    const world = toWorld(next, px, py);
    close(world.x, worldBefore[index].x, 1e-6);
    close(world.y, worldBefore[index].y, 1e-6);
  });
});

test("arrows re-route to the outlines of both targets", () => {
  const left = rect({ id: "left", x: 0, y: 0, width: 100, height: 100 });
  const right = rect({ id: "right", x: 300, y: 0, width: 100, height: 100 });
  const arrow = createElement("arrow", {
    z: "a1",
    x: 50,
    y: 50,
    points: [
      [0, 0],
      [300, 0],
    ],
    startBind: { id: "left" },
    endBind: { id: "right" },
  });
  const lookup = (id) => (id === "left" ? left : id === "right" ? right : undefined);
  const patch = routeArrow(arrow, lookup);
  assert.ok(patch !== null);
  const next = { ...arrow, ...patch };
  const start = toWorld(next, ...next.points[0]);
  const end = toWorld(next, ...next.points[1]);
  const gap = 4 + arrow.strokeWidth;
  close(start.x, 100 + gap, 1e-6);
  close(end.x, 300 - gap, 1e-6);
  // A missing target clears that binding.
  const orphan = routeArrow(arrow, (id) => (id === "left" ? left : undefined));
  assert.equal(orphan?.endBind, null);
});

test("hand-drawn geometry is deterministic per seed", () => {
  const a = buildDrawable(rect({ seed: 7 }));
  const b = buildDrawable(rect({ seed: 7 }));
  const c = buildDrawable(rect({ seed: 8 }));
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  const clean = buildDrawable(rect({ roughness: 0, rounded: false }));
  assert.equal(clean.paths.length, 1, "precise shapes draw one pass");
});

test("every element type produces paths", () => {
  for (const type of ["rectangle", "diamond", "ellipse"]) {
    const drawable = buildDrawable(createElement(type, { z: "a0", width: 120, height: 80, fillColor: "#cfe0ff" }));
    assert.ok(
      drawable.paths.some((path) => path.paint === "hatch"),
      `${type} hatch`,
    );
    assert.ok(
      drawable.paths.some((path) => path.paint === "stroke"),
      `${type} stroke`,
    );
  }
  const arrow = createElement("arrow", {
    z: "a0",
    points: [
      [0, 0],
      [100, 40],
    ],
    endArrow: "triangle",
    startArrow: "dot",
  });
  assert.ok(buildDrawable(arrow).paths.filter((path) => path.kind === "fill").length >= 2);
});

test("hatching stays inside the polygon", () => {
  const square = [
    [0, 0],
    [100, 0],
    [100, 100],
    [0, 100],
  ];
  const segments = hatchSegments(square, 8, (-41 * Math.PI) / 180);
  assert.ok(segments.length > 10);
  for (const [from, to] of segments) {
    for (const [px, py] of [from, to]) {
      assert.ok(px >= -1e-6 && px <= 100 + 1e-6 && py >= -1e-6 && py <= 100 + 1e-6);
    }
  }
});

test("ink outline is a closed ring around the stroke", () => {
  const points = [];
  for (let index = 0; index < 40; index += 1) points.push([index * 5, Math.sin(index / 4) * 20]);
  const outline = inkOutline(points, [], { size: 8, thinning: 0.6, simulatePressure: true });
  assert.ok(outline.length > points.length);
  const dot = inkOutline([[5, 5]], [], { size: 8, thinning: 0.6, simulatePressure: true });
  assert.equal(dot.length, 16);
});

test("rng is uniform enough and reproducible", () => {
  const a = new Rng(123);
  const b = new Rng(123);
  let sum = 0;
  for (let index = 0; index < 2000; index += 1) {
    const value = a.next();
    assert.equal(value, b.next());
    sum += value;
  }
  close(sum / 2000, 0.5, 0.05);
});

test("dark mapping inverts lightness and deepen darkens pastels", () => {
  assert.equal(darkColor("#ffffff").length, 7);
  assert.notEqual(darkColor("#1f1d1a"), "#1f1d1a");
  const pastel = deepen("#ffd3c4");
  assert.ok(Number.parseInt(pastel.slice(1, 3), 16) < 0xff || Number.parseInt(pastel.slice(3, 5), 16) < 0xd3);
});

test("clones get fresh ids and keep internal bindings and groups", () => {
  const a = rect({ id: "a", groupIds: ["g1"] });
  const b = rect({ id: "b", groupIds: ["g1"], z: "a1" });
  const arrow = createElement("arrow", {
    z: "a2",
    points: [
      [0, 0],
      [10, 0],
    ],
    startBind: { id: "a" },
    endBind: { id: "zzz" },
  });
  const clones = cloneForInsert([a, b, arrow], "a5", 10, 0);
  const [ca, cb, carrow] = clones;
  assert.notEqual(ca.id, "a");
  assert.equal(ca.groupIds[0], cb.groupIds[0]);
  assert.notEqual(ca.groupIds[0], "g1");
  assert.equal(carrow.startBind?.id, ca.id);
  assert.equal(carrow.endBind, null);
  assert.ok(clones.every((el) => el.z > "a5"));
  assert.equal(ca.x, 10);
});

test("board files round-trip through serialisation", () => {
  const elements = [rect({ text: "Zażółć" }), rect({ x: 200, z: "a1" })];
  const json = serializeBoard({ name: "Plan", background: "#ffffff" }, elements, () => undefined);
  const parsed = parseBoardFile(json);
  assert.ok(parsed !== null);
  assert.equal(parsed.elements.length, 2);
  assert.equal(parsed.elements[0]?.text, "Zażółć");
  assert.equal(parsed.meta.name, "Plan");
  assert.equal(parseBoardFile('{"type":"other"}'), null);
});
