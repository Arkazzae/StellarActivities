import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { dictionaries, resolveLanguage, translator } from "../i18n.js";

test("Stellarr locales map to Polish or English", () => {
  assert.equal(resolveLanguage("pl"), "pl");
  assert.equal(resolveLanguage("pl-PL"), "pl");
  assert.equal(resolveLanguage("en-GB"), "en");
  assert.equal(resolveLanguage("de"), "en");
  assert.equal(resolveLanguage(undefined), "en");
});

test("both languages define the same strings", () => {
  assert.deepEqual(Object.keys(dictionaries.pl).sort(), Object.keys(dictionaries.en).sort());
  for (const key of Object.keys(dictionaries.en))
    assert.equal(typeof dictionaries.pl[key], typeof dictionaries.en[key], key);
});

test("strings format arguments and unknown keys pass through", () => {
  const pl = translator("pl");
  assert.equal(pl("watching", 4), "Ogląda: 4");
  assert.equal(pl("rateLabel", 1.25), "1,25×");
  assert.equal(translator("en")("ofMax", 2, 3), "2 of 3");
  assert.equal(pl("An error from Stellarr"), "An error from Stellarr");
});

test("every key used by the page and the room has a translation", async () => {
  const sources = await Promise.all(["../index.html", "../app.js", "../room.js", "../player.js"]
    .map(file => readFile(new URL(file, import.meta.url), "utf8")));
  const used = new Set();
  for (const source of sources) {
    for (const [, key] of source.matchAll(/data-i18n(?:-label|-placeholder)?="([A-Za-z]+)"/g)) used.add(key);
    for (const [, key] of source.matchAll(/\bt\("([A-Za-z]+)"/g)) used.add(key);
    for (const [, key] of source.matchAll(/new Error\("(err[A-Za-z]+)"\)/g)) used.add(key);
    for (const [, key] of source.matchAll(/events\.error\("(err[A-Za-z]+)"\)/g)) used.add(key);
    for (const [, key] of source.matchAll(/return "(err[A-Za-z]+)"/g)) used.add(key);
  }
  const missing = [...used].filter(key => !Object.hasOwn(dictionaries.en, key));
  assert.deepEqual(missing, []);
});
