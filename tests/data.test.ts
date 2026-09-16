import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decimalFeetToInches, normalizeNysdot, COUNTIES, type RawFeature } from "../scripts/sources/nysdot-posted-height";
import {
  COVERED_TOWNS,
  FAIRFIELD_TOWNS,
  feetInchesToInches,
  normalizeCtdot,
  polygonCentroid,
  townName,
  type CtdotRawFeature,
} from "../scripts/sources/ctdot-posted-height";
import { normalizeCtdotParkways } from "../scripts/sources/ctdot-parkways";
import { postedLoadTonsFromProps, normalizeCtdotPostedLoad } from "../scripts/sources/ctdot-posted-load";
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
  assert.ok(COVERED_TOWNS.has("NEW HAVEN"));
  assert.deepEqual(
    polygonCentroid({ type: "Polygon", coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]] }),
    [1, 1],
  );
});

test("CTDOT normalizer keeps Fairfield and New Haven posted records and drops others", () => {
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

  const newHaven = structuredClone(base);
  newHaven.properties.Town_NBI4 = "52070 - NEW HAVEN";
  newHaven.geometry = {
    type: "Polygon",
    coordinates: [[[-72.93, 41.30], [-72.92, 41.30], [-72.92, 41.31], [-72.93, 41.31], [-72.93, 41.30]]],
  };
  const nh = normalizeCtdot([newHaven], "2026-09-14").features;
  assert.equal(nh.length, 2);
  assert.equal(nh[0].properties.county, "NEW HAVEN");

  const empty = structuredClone(base);
  empty.properties.PostedVertUnderClrncFt = null;
  empty.properties.PostedVertUnderClrncIN = null;
  empty.properties.PostedVertClrncFt_6000029 = 0;
  empty.properties.PostedVertClrncIN_6000030 = 0;
  assert.equal(normalizeCtdot([empty], "2026-09-14").features.length, 0);
});
test("CTDOT parkways dissolve to Merritt / Wilbur Cross / Milford with commercial ban + 8′ height", () => {
  const raw = JSON.parse(readFileSync("data/raw/ctdot-parkways.geojson", "utf8")).features;
  const parkways = normalizeCtdotParkways(raw);
  assert.equal(parkways.length, 3);
  const names = parkways.map(f => f.properties.name).sort();
  assert.deepEqual(names, ["Merritt Parkway", "Milford Parkway", "Wilbur Cross Parkway"]);
  for (const f of parkways) {
    assert.equal(f.properties.kind, "parkway");
    assert.equal(f.properties.commercialBan, true);
    assert.equal(f.properties.passengerOnlyHeightInches, 96);
    assert.equal(f.properties.widthInches, 90);
    assert.equal(f.properties.weightTons, 3.75);
    assert.ok(f.properties.id.startsWith("parkway-ct-"));
    assert.equal(f.geometry.type, "MultiLineString");
    assert.ok(f.geometry.coordinates.length >= 1);
  }
});

test("CTDOT posted-load prefers All posting and keeps coverage points only", () => {
  assert.equal(
    postedLoadTonsFromProps({
      PostedLoadAll_6000042: "32",
      PostedLdSingleUnit_6000034: "19",
    }),
    32,
  );
  assert.equal(
    postedLoadTonsFromProps({
      PostedLoadAll_6000042: null,
      PostedLdSingleUnit_6000034: "19",
      PostedLoadSemiTrlr_6000036: "23",
    }),
    19,
  );
  assert.equal(postedLoadTonsFromProps({}), null);

  const raw = JSON.parse(readFileSync("data/raw/ctdot-posted-load.geojson", "utf8")).features;
  const loads = normalizeCtdotPostedLoad(raw, { minLng: -74.3, maxLng: -71.8, minLat: 40.45, maxLat: 41.55 });
  assert.ok(loads.length >= 10, `expected CT posted-load points in coverage, got ${loads.length}`);
  for (const f of loads) {
    assert.equal(f.properties.kind, "posted-load");
    assert.ok(f.properties.id.startsWith("load-ct-"));
    assert.ok(f.properties.postedLoadTons > 0);
    assert.equal(f.geometry.type, "Point");
  }

  const parkways = JSON.parse(readFileSync("data/built/parkways-nyc-li.geojson", "utf8"));
  const posted = JSON.parse(readFileSync("data/built/posted-load-nyc-li.geojson", "utf8"));
  assert.ok(parkways.features.some((f: { properties: { id: string } }) => f.properties.id.startsWith("parkway-ct-")));
  assert.ok(posted.features.some((f: { properties: { id: string } }) => f.properties.id.startsWith("load-ct-")));
  assert.ok(
    posted.features.some((f: { properties: { county?: string } }) => f.properties.county === "WESTCHESTER"),
    "Hudson Valley posted-load pins",
  );
});

test("NJ NYC-facing corridors and PANYNJ crossings sit in the shared awareness GeoJSON", () => {
  const parkways = JSON.parse(readFileSync("data/built/parkways-nyc-li.geojson", "utf8"));
  const facilities = JSON.parse(readFileSync("data/built/facilities-nyc-li.geojson", "utf8"));
  const crossings = JSON.parse(readFileSync("data/built/major-crossings.geojson", "utf8"));

  const njPark = parkways.features.filter((f: { properties: { id: string } }) =>
    f.properties.id.startsWith("parkway-nj-"),
  );
  assert.equal(njPark.length, 3);
  const names = njPark.map((f: { properties: { name: string } }) => f.properties.name).sort();
  assert.deepEqual(names, [
    "Garden State Parkway (north of Exit 105)",
    "Palisades Interstate Parkway",
    "Pulaski Skyway",
  ]);
  for (const f of njPark) {
    assert.equal(f.properties.kind, "parkway");
    assert.equal(f.properties.commercialBan, true);
    assert.equal(f.geometry.type, "MultiLineString");
    assert.ok(f.geometry.coordinates.length >= 1);
  }

  const gsp = njPark.find((f: { properties: { id: string } }) => f.properties.id.includes("garden-state"));
  assert.ok(String(gsp.properties.restriction).includes("GVWR"));
  assert.ok(String(gsp.properties.restriction).includes("registered weight"));

  const holland = facilities.features.find((f: { properties: { id: string } }) => f.properties.id === "holland");
  assert.ok(holland, "missing Holland Tunnel facility");
  assert.equal(holland.properties.heightInches, 150);
  assert.equal(holland.properties.widthInches, 96);
  const gwbLower = facilities.features.find((f: { properties: { id: string } }) => f.properties.id === "gwb-lower");
  assert.ok(gwbLower, "missing GWB lower facility");
  assert.equal(gwbLower.properties.trucksBanned, true);
  const gwbIds = facilities.features
    .map((f: { properties: { id: string } }) => f.properties.id)
    .filter((id: string) => id === "gwb" || id === "gwb-upper" || id === "gwb-lower");
  assert.equal(gwbIds.length, 3, "keep general + upper + lower GWB pins");

  const panynj = facilities.features.filter((f: { properties: { id: string } }) =>
    f.properties.id.startsWith("panynj-"),
  );
  assert.ok(panynj.length >= 3, `expected remaining PANYNJ bridges, got ${panynj.length}`);

  const crossingIds = new Set(crossings.features.map((f: { properties: { id: string } }) => f.properties.id));
  for (const id of ["gwb-upper", "gwb-lower", "holland", "lincoln", "bayonne", "goethals", "outerbridge", "rfk"]) {
    assert.ok(crossingIds.has(id), `missing crossing ${id}`);
  }

  const rfk = facilities.features.find((f: { properties: { id: string } }) => f.properties.id === "rfk");
  assert.ok(rfk, "missing RFK facility");
  assert.equal(rfk.properties.heightInches, 155);
  assert.equal(rfk.properties.heightLowerInches, 155);
  assert.equal(rfk.properties.heightUpperInches, 182);
  assert.equal(rfk.properties.widthInches, 114);
  assert.equal(rfk.properties.heightSource, "mta-posted");
});

test("snapshot regression: unique identities, valid geography, no legacy or sentinel postings", () => {
  const collection: ClearanceCollection = JSON.parse(readFileSync("data/built/clearances-nyc-li.geojson", "utf8"));
  assert.equal(collection.features.length, new Set(collection.features.map(f => f.properties.id)).size);
  assert.ok(collection.features.length >= 700, `expected expanded snapshot, got ${collection.features.length}`);

  const ny = collection.features.filter(f => f.properties.state === "NY");
  const ct = collection.features.filter(f => f.properties.state === "CT");
  const nj = collection.features.filter(f => f.properties.state === "NJ");
  assert.ok(ny.length > 555, `expected Hudson Valley NY expansion, got ${ny.length}`);
  assert.ok(ct.length > 57, `expected New Haven CT expansion, got ${ct.length}`);
  assert.ok(nj.length > 50, `expected NJ truck-map + OSM clearances, got ${nj.length}`);
  assert.ok(ny.some(f => f.properties.county === "WESTCHESTER"));
  assert.ok(ny.some(f => f.properties.county === "ROCKLAND"));
  assert.ok(ct.some(f => COVERED_TOWNS.has(f.properties.county)));
  assert.ok(ct.some(f => f.properties.county === "NEW HAVEN" || f.properties.county === "MILFORD"));
  assert.ok(nj.some(f => f.properties.clearanceType === "posted" && f.properties.id.startsWith("njdot-truckmap-")));
  assert.ok(nj.some(f => f.properties.clearanceType === "community" && f.properties.id.startsWith("osm-")));

  for (const f of ny) {
    assert.ok(COUNTIES.has(f.properties.county));
    assert.ok(Number.isInteger(f.properties.postedClearanceInches) && f.properties.postedClearanceInches > 0 && f.properties.postedClearanceInches < 360);
    assert.ok(f.geometry.coordinates.every(Number.isFinite));
    assert.equal(f.properties.clearanceType, "posted");
    assert.ok(f.properties.sources[0].sourceUrl.startsWith("https://gis.dot.ny.gov/"));
  }
  assert.ok(ny.some(f => f.properties.extras && (f.properties.extras.yearBuilt || f.properties.extras.structureType)));

  for (const f of ct) {
    assert.ok(COVERED_TOWNS.has(f.properties.county), f.properties.county);
    assert.ok(Number.isInteger(f.properties.postedClearanceInches) && f.properties.postedClearanceInches > 0 && f.properties.postedClearanceInches < 360);
    assert.ok(f.geometry.coordinates.every(Number.isFinite));
    assert.equal(f.properties.clearanceType, "posted");
    assert.ok(f.properties.id.startsWith("ctdot-"));
    assert.ok(f.properties.sources[0].sourceUrl.includes("CTDOT_Bridges"));
  }

  for (const f of nj) {
    assert.ok(Number.isInteger(f.properties.postedClearanceInches) && f.properties.postedClearanceInches > 0 && f.properties.postedClearanceInches < 360);
    assert.ok(f.geometry.coordinates.every(Number.isFinite));
    assert.ok(f.properties.clearanceType === "posted" || f.properties.clearanceType === "community");
  }
});
