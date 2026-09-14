import assert from "node:assert/strict";
import test from "node:test";
import { knownRestrictionTexts, parseRestrictionText } from "../src/lib/restriction-parse";
import { loadConflict, widthConflict } from "../src/lib/vehicle-profile";
import { readFileSync } from "node:fs";

test("parses all 11 known restrictio strings", () => {
  const unique = JSON.parse(readFileSync("docs/data-inventory/restrictio-unique.json", "utf8")) as { text: string }[];
  assert.equal(unique.length, 11);
  assert.equal(knownRestrictionTexts().length, 11);
  for (const row of unique) {
    const parsed = parseRestrictionText(row.text);
    assert.ok(parsed, `missing parse for: ${row.text}`);
    assert.ok(parsed.facility);
  }
});

test("holland tunnel exposes width and hazmat", () => {
  const p = parseRestrictionText(
    'H- 12\'6" W- 8\'0", Only two and three-axle single-unit trucks allowed, No Flamm/Explosives',
  );
  assert.equal(p?.widthInches, 96);
  assert.equal(p?.noHazmat, true);
});

test("load and width conflict helpers", () => {
  assert.equal(loadConflict(10, 12), "danger");
  assert.equal(loadConflict(10, 8), "ok");
  assert.equal(loadConflict(10, null), "unknown");
  assert.equal(widthConflict(102, 108), "danger");
  assert.equal(widthConflict(102, 96), "ok");
});
