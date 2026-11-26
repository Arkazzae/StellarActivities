import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { EN } from "../src/i18n-en.js";
import { plural, setLocale, t } from "../src/i18n.js";

const src = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

const sources = () => {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (path.endsWith(".js") && !path.endsWith("i18n-en.js")) out.push(readFileSync(path, "utf8"));
    }
  };
  walk(src);
  return out.join("\n");
};

test("every Polish string has an English translation", () => {
  const code = sources();
  const keys = new Set();
  for (const match of code.matchAll(/\bt\(\s*"((?:[^"\\]|\\.)*)"/g)) keys.add(match[1]);
  for (const match of code.matchAll(/\bplural\(\s*[^,]+,\s*"([^"]*)",\s*"([^"]*)",\s*"([^"]*)"/g)) {
    keys.add(match[1]);
    keys.add(match[2]);
    keys.add(match[3]);
  }
  // Labels kept in tables and translated where they are shown.
  for (const match of code.matchAll(/\b(?:label|name): "([^"]+)"/g)) keys.add(match[1]);
  const missing = [...keys].filter((key) => !(key in EN));
  assert.deepEqual(missing, []);
});

test("placeholders survive translation", () => {
  for (const [key, value] of Object.entries(EN)) {
    const wanted = [...key.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
    const found = [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
    assert.deepEqual(found, wanted, key);
  }
});

test("Polish plural forms follow the 1 / 2–4 / 5+ rule", () => {
  setLocale("pl-PL");
  const forms = (n) => plural(n, "{n} element", "{n} elementy", "{n} elementów");
  assert.equal(forms(1), "1 element");
  assert.equal(forms(3), "3 elementy");
  assert.equal(forms(5), "5 elementów");
  assert.equal(forms(12), "12 elementów");
  assert.equal(forms(22), "22 elementy");
  setLocale("en");
  assert.equal(forms(1), "1 element");
  assert.equal(forms(7), "7 elements");
  assert.equal(t("Usuń"), "Delete");
});
