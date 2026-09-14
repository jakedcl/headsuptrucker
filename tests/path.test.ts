import { test } from "node:test";
import assert from "node:assert/strict";
import type { Feature, Point } from "geojson";
import type { ClearanceRecord } from "../src/lib/types";
import { CORRIDOR_METERS, distanceToPolylineMeters, featuresAlongRoute, haversineMeters, inCoverage } from "../src/lib/path";

function feature(id: string, lng: number, lat: number): Feature<Point, ClearanceRecord> {
  return { type: "Feature", geometry: { type: "Point", coordinates: [lng, lat] }, properties: { id, structureId: id, postedClearanceInches: 96, road: "TEST RD", crossing: "OVERPASS", appliesTo: "under", county: "QUEENS", state: "NY", location: "", owner: "", direction: null, clearanceType: "posted", sources: [], notes: [] } };
}

test("coverage envelope and corridor matching follow a straight path", () => {
  assert.equal(inCoverage(-73.99, 40.75), true);
  assert.equal(inCoverage(-75, 40.75), false);
  const line: [number, number][] = [[-73.99, 40.75], [-73.90, 40.75]];
  const onPath = feature("on", -73.97, 40.75);
  const nearby = feature("near", -73.93, 40.7504);
  const far = feature("far", -73.945, 40.80);
  assert.ok(distanceToPolylineMeters(onPath.geometry.coordinates as [number, number], line) < 5);
  assert.ok(distanceToPolylineMeters(far.geometry.coordinates as [number, number], line) > CORRIDOR_METERS);
  const along = featuresAlongRoute([far, nearby, onPath], line);
  assert.deepEqual(along.map(f => f.properties.id), ["on", "near"]);
  assert.ok(haversineMeters([-73.99, 40.75], [-73.90, 40.75]) > 7000);
});
