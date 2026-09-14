import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decimalFeetToInches, normalizeNysdot, COUNTIES, type RawFeature } from "../scripts/sources/nysdot-posted-height";
import {
  FAIRFIELD_TOWNS,
  feetInchesToInches,
  normalizeCtdot,
  polygonCentroid,
  townName,
  type CtdotRawFeature,
} from "../scripts/sources/ctdot-posted-height";
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

test("CTDOT feet/inches convert to whole inches and reject empty postings", () => {
  assert.equal(feetInchesToInches(13, 6), 162);
  assert.equal(feetInchesToInches(10, 0), 120);
  assert.equal(feetInchesToInches(0, 6), 6);
  assert.equal(feetInchesToInches(null, null), null);
  assert.equal(feetInchesToInches(0, 0), null);
  assert.equal(feetInchesToInches(-1, 0), null);
  // Non-numeric inches are ignored; feet alone still count
  assert.equal(feetInchesToInches(13, "6"), 156);
  assert.equal(townName("73070 - STAMFORD"), "STAMFORD");
  assert.equal(townName("STAMFORD"), "STAMFORD");
  assert.ok(FAIRFIELD_TOWNS.has("STAMFORD"));
  assert.deepEqual(
    polygonCentroid({ type: "Polygon", coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]] }),
    [1, 1],
  );
});

test("CTDOT normalizer keeps Fairfield posted under/on records and drops others", () => {
  const base: CtdotRawFeature = {
    geometry: {
      type: "Polygon",
      coordinates: [[[-73.54, 41.05], [-73.53, 41.05], [-73.53, 41.06], [-73.54, 41.06], [-73.54, 41.05]]],
    },
    properties: {
      BridgeStructureNumber: "00123",
      Town_NBI4: "73070 - STAMFORD",
      FacilityCarried_NBI7: "I-95",
      FeatureCrossed_NBI6A: "LOCAL ROAD",
      OwnerValue_Description: "State Highway Agency",
      PostedVertUnderClrncFt: 13,
      PostedVertUnderClrncIN: 6,
      PostedVertClrncFt_6000029: 14,
      PostedVertClrncIN_6000030: 0,
    },
  };

  const result = normalizeCtdot([base], "2026-09-14T00:00:00Z").features;
  assert.equal(result.length, 2);
  const under = result.find(f => f.properties.appliesTo === "under")!;
  const on = result.find(f => f.properties.appliesTo === "on")!;
  assert.equal(under.properties.id, "ctdot-00123-under");
  assert.equal(on.properties.id, "ctdot-00123-on");
  assert.equal(under.properties.postedClearanceInches, 162);
  assert.equal(on.properties.postedClearanceInches, 168);
  assert.equal(under.properties.state, "CT");
  assert.equal(under.properties.county, "STAMFORD");
  assert.equal(under.properties.clearanceType, "posted");
  assert.equal(under.properties.sources[0].agency, "CTDOT");
  assert.ok(under.geometry.coordinates.every(Number.isFinite));

  const hartford = structuredClone(base);
  hartford.properties.Town_NBI4 = "64000 - HARTFORD";
  assert.equal(normalizeCtdot([hartford], "2026-09-14").features.length, 0);

  const empty = structuredClone(base);
  empty.properties.PostedVertUnderClrncFt = null;
  empty.properties.PostedVertUnderClrncIN = null;
  empty.properties.PostedVertClrncFt_6000029 = 0;
  empty.properties.PostedVertClrncIN_6000030 = 0;
  assert.equal(normalizeCtdot([empty], "2026-09-14").features.length, 0);
});
test("snapshot regression: unique identities, valid geography, no legacy or sentinel postings", () => {
  const collection: ClearanceCollection = JSON.parse(readFileSync("public/data/clearances-nyc-li.geojson", "utf8"));
  assert.equal(collection.features.length, 612, "Review source changes before updating this snapshot baseline");
  assert.equal(new Set(collection.features.map(f => f.properties.id)).size, collection.features.length);

  const ny = collection.features.filter(f => f.properties.state === "NY");
  const ct = collection.features.filter(f => f.properties.state === "CT");
  assert.equal(ny.length, 555);
  assert.ok(ct.length >= 50, `expected SW CT posted records, got ${ct.length}`);

  for (const f of ny) {
    assert.ok(COUNTIES.has(f.properties.county));
    assert.ok(Number.isInteger(f.properties.postedClearanceInches) && f.properties.postedClearanceInches > 0 && f.properties.postedClearanceInches < 360);
    assert.ok(f.geometry.coordinates.every(Number.isFinite));
    assert.equal(f.properties.clearanceType, "posted");
    assert.ok(f.properties.sources[0].sourceUrl.startsWith("https://gis.dot.ny.gov/"));
  }

  for (const f of ct) {
    assert.ok(FAIRFIELD_TOWNS.has(f.properties.county), f.properties.county);
    assert.ok(Number.isInteger(f.properties.postedClearanceInches) && f.properties.postedClearanceInches > 0 && f.properties.postedClearanceInches < 360);
    assert.ok(f.geometry.coordinates.every(Number.isFinite));
    assert.equal(f.properties.clearanceType, "posted");
    assert.ok(f.properties.id.startsWith("ctdot-"));
    assert.ok(f.properties.sources[0].sourceUrl.includes("CTDOT_Bridges"));
  }
});
