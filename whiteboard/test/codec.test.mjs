import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canonical,
  decodeElement,
  decodeInts,
  decodePoints,
  encodeElement,
  encodeInts,
  encodePoints,
  sanitizeElement,
  simplifyStroke,
} from "../src/model/codec.js";
import { createElement } from "../src/model/types.js";

const random = (seed) => () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};

test("varints round-trip, including large and negative values", () => {
  const values = [0, 1, -1, 15, -16, 16, 31, 32, -33, 1023, -1024, 70_000, -2_000_000, 19_999_999];
  assert.deepEqual(decodeInts(encodeInts(values)), values);
  assert.equal(decodeInts("!!"), null);
});

test("points are quantised to half a pixel and stay stable", () => {
  const points = [
    [0, 0],
    [10.26, -3.74],
    [10.5, 1000.25],
    [-450.1, 2.9],
  ];
  const once = decodePoints(encodePoints(points));
  assert.deepEqual(once, [
    [0, 0],
    [10.5, -3.5],
    [10.5, 1000.5],
    [-450, 3],
  ]);
  assert.equal(encodePoints(once), encodePoints(points));
});

test("every element type survives encode → decode → encode unchanged", () => {
  const rnd = random(7);
  const types = ["rectangle", "diamond", "ellipse", "line", "arrow", "freedraw", "text", "image"];
  for (let round = 0; round < 200; round += 1) {
    const type = types[round % types.length];
    const points = [];
    for (let index = 0; index < 1 + Math.floor(rnd() * 30); index += 1) points.push([rnd() * 400 - 200, rnd() * 400 - 200]);
    const el = createElement(type, {
      z: "a" + Math.floor(rnd() * 9 + 1),
      x: rnd() * 2000 - 1000,
      y: rnd() * 2000 - 1000,
      width: rnd() * 500,
      height: rnd() * 500,
      angle: rnd() * 7,
      strokeColor: rnd() > 0.5 ? "#2f6fdb" : "#1f1d1a",
      fillColor: rnd() > 0.5 ? "#cdebcf" : "transparent",
      strokeWidth: [1, 2, 4][round % 3],
      roughness: [0, 1, 2][round % 3],
      opacity: Math.round(rnd() * 100),
      text: rnd() > 0.5 ? "Zażółć gęślą jaźń" : "",
      points: type === "line" || type === "arrow" || type === "freedraw" ? points : [],
      pressures: type === "freedraw" ? points.map(() => rnd()) : [],
      groupIds: rnd() > 0.7 ? ["g1", "g2"] : [],
      startBind: type === "arrow" && rnd() > 0.5 ? { id: "abc123" } : null,
      fileId: type === "image" ? "file42" : "",
    });
    const first = JSON.stringify(encodeElement(el));
    const decoded = decodeElement(el.id, JSON.parse(first));
    assert.ok(decoded !== null);
    assert.equal(JSON.stringify(encodeElement(decoded)), JSON.stringify(encodeElement(canonical(el))));
    assert.equal(JSON.stringify(encodeElement(canonical(canonical(el)))), JSON.stringify(encodeElement(canonical(el))));
  }
});

test("defaults are omitted so a plain rectangle stays small", () => {
  const el = createElement("rectangle", { z: "a0", x: 10, y: 20, width: 100, height: 50, seed: 5 });
  const json = JSON.stringify(encodeElement(el));
  assert.ok(json.length < 80, json);
});

test("hostile remote records are rejected or clamped", () => {
  assert.equal(decodeElement("ok", { t: "q" }), null);
  assert.equal(decodeElement("bad id!", { t: "r" }), null);
  const el = decodeElement("ok", { t: "r", x: Infinity, sw: 1e9, c: "url(javascript:1)", p: "!!", z: "!!", g: [1, "x"] });
  assert.equal(el.x, 0);
  assert.equal(el.strokeWidth, 32);
  assert.equal(el.strokeColor, "#1f1d1a");
  assert.deepEqual(el.points, []);
  assert.equal(el.z, "a0");
  assert.deepEqual(el.groupIds, ["x"]);
});

test("pasted full objects are sanitised the same way", () => {
  assert.equal(sanitizeElement("x", { type: "script" }), null);
  const el = sanitizeElement("x", { type: "arrow", points: [[0, 0], ["a", 1], [5, 5]], strokeColor: "red", endArrow: "triangle" });
  assert.deepEqual(el.points, [
    [0, 0],
    [5, 5],
  ]);
  assert.equal(el.strokeColor, "#1f1d1a");
  assert.equal(el.endArrow, "triangle");
});

test("stroke simplification keeps the ends and drops collinear points", () => {
  const points = [];
  for (let index = 0; index <= 100; index += 1) points.push([index, 0]);
  const pressures = points.map(() => 0.5);
  const simple = simplifyStroke(points, pressures, 0.4);
  assert.deepEqual(simple.points, [
    [0, 0],
    [100, 0],
  ]);
  assert.equal(simple.pressures.length, 2);
});
