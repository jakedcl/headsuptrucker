import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  clearancesFromPoints,
  facilitiesFromAwareness,
  majorCrossingsFromPoints,
  parkwaysFromLines,
  postedLoadFromPoints,
} from "../src/lib/awareness-project";
import type {
  AwarenessLineCollection,
  AwarenessPointCollection,
} from "../src/lib/awareness-schema";

const points = JSON.parse(
  readFileSync("public/data/awareness-points.geojson", "utf8"),
) as AwarenessPointCollection;
const lines = JSON.parse(
  readFileSync("public/data/awareness-lines.geojson", "utf8"),
) as AwarenessLineCollection;

describe("unified awareness projection", () => {
  it("projects clearances with height + provenance", () => {
    const clearances = clearancesFromPoints(points);
    assert.ok(clearances.features.length >= 600);
    const sample = clearances.features[0].properties;
    assert.ok(sample.postedClearanceInches > 0);
    assert.ok(sample.structureId);
    assert.ok(["NY", "CT"].includes(sample.state));
    assert.ok(sample.sources.length >= 1);
  });

  it("projects parkway lines with commercial ban", () => {
    const parkways = parkwaysFromLines(lines);
    assert.ok(parkways.features.length >= 38);
    assert.ok(parkways.features.every(f => f.properties?.commercialBan === true || f.properties?.kind === "parkway"));
  });

  it("projects posted load + major crossings + facilities", () => {
    const loads = postedLoadFromPoints(points);
    const crossings = majorCrossingsFromPoints(points);
    const facilities = facilitiesFromAwareness(points, lines);
    assert.ok(loads.features.length >= 89);
    assert.equal(crossings.features.length, 18);
    assert.ok(facilities.features.length >= 40);
    const withExtras = facilities.features.find(f => f.properties?.extras);
    assert.ok(withExtras, "facilities keep extras for the info card");
  });

  it("keeps agency leftovers on clearance extras via structureId", () => {
    const clearance = points.features.find(f => f.properties.kind === "clearance");
    assert.ok(clearance);
    assert.equal(clearance.properties.extras?.layer, "clearance");
    assert.ok(clearance.properties.extras?.structureId);
    const withYear = points.features.find(
      f => f.properties.kind === "clearance" && typeof f.properties.extras?.yearBuilt === "number",
    );
    assert.ok(withYear, "clearance extras keep yearBuilt from NYSDOT");
  });
});
