import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decimalFeetToInches, normalizeNysdot, COUNTIES, type RawFeature } from "../scripts/sources/nysdot-posted-height";
import { normalizeNyc, parseFeetInches } from "../scripts/sources/nyc-low-bridges";
import type { ClearanceCollection } from "../src/lib/types";

const raw = JSON.parse(readFileSync("data/raw/nysdot-statewide.geojson", "utf8")).features as RawFeature[];
test("actual NYSDOT decimal-foot fixtures recover whole inches without a posting offset", () => {
  const peninsula = raw.find(f => f.properties.BIN === "1520229")!;
  assert.equal(peninsula.properties.POSTED_VRT_CLRNC_UNDER, 8.83);
  assert.equal(decimalFeetToInches(peninsula.properties.POSTED_VRT_CLRNC_UNDER), 106);
  const seamans = raw.find(f => f.properties.BIN === "1059680")!;
  assert.equal(decimalFeetToInches(seamans.properties.POSTED_VRT_CLRNC_UNDER), 97);
  assert.equal(decimalFeetToInches(8.92), 107);
  for (const v of [null, "8.92", 0, 99.99, 99.98, -1, Infinity, 8.11]) assert.equal(decimalFeetToInches(v), null);
});
test("on/under postings retain separate road identities and ignore permitted/label values", () => {
  const input = raw.find(f => f.properties.BIN === "5524290")!;
  const result = normalizeNysdot([input], "2026-09-14T00:00:00Z").features;
  assert.equal(result.length, 2);
  assert.equal(result.find(f => f.properties.appliesTo === "under")!.properties.postedClearanceInches, 162);
  assert.equal(result.find(f => f.properties.appliesTo === "on")!.properties.postedClearanceInches, 159);
  assert.notEqual(result[0].properties.road, result[1].properties.road);
  const missing = structuredClone(input); missing.properties.POSTED_VRT_CLRNC_ON = 0; missing.properties.POSTED_VRT_CLRNC_UNDER = null;
  assert.equal(normalizeNysdot([missing], "2026-09-14").features.length, 0);
});
test("NYC KML preserves directional columns, source date, and unverified semantics", () => {
  const nyc = normalizeNyc(readFileSync("data/raw/nyc-low-bridges.kml", "utf8"));
  assert.equal(nyc.length, 149);
  const record = nyc.find(f => f.crossing === "130TH STREET")!;
  assert.equal(record.clearanceInches, 128);
  assert.deepEqual(record.directional, { Eastbound: 130, Westbound: 128 });
  assert.equal(record.clearanceType, "unverified");
  assert.equal(record.sourceDate, "2009-07-14");
  assert.equal(parseFeetInches("0", "0"), null);
  assert.equal(parseFeetInches("9", "12"), null);
});
test("snapshot regression: unique identities, valid geography, no legacy or sentinel postings", () => {
  const collection: ClearanceCollection = JSON.parse(readFileSync("public/data/clearances-nyc-li.geojson", "utf8"));
  assert.equal(collection.features.length, 555, "Review source changes before updating this snapshot baseline");
  assert.equal(new Set(collection.features.map(f => f.properties.id)).size, collection.features.length);
  for (const f of collection.features) {
    assert.ok(COUNTIES.has(f.properties.county));
    assert.ok(Number.isInteger(f.properties.postedClearanceInches) && f.properties.postedClearanceInches > 0 && f.properties.postedClearanceInches < 360);
    assert.ok(f.geometry.coordinates.every(Number.isFinite));
    assert.equal(f.properties.clearanceType, "posted");
    assert.ok(f.properties.sources[0].sourceUrl.startsWith("https://gis.dot.ny.gov/"));
  }
});
