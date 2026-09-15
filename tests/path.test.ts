import { test } from "node:test";
import assert from "node:assert/strict";
import type { Feature, Point } from "geojson";
import type { ClearanceRecord } from "../src/lib/types";
import { CORRIDOR_METERS, distanceToPolylineMeters, featuresAlongRoute, haversineMeters, inCoverage, keepDistinctRoutes, routeLinesDiffer } from "../src/lib/path";

function feature(id: string, lng: number, lat: number): Feature<Point, ClearanceRecord> {
  return { type: "Feature", geometry: { type: "Point", coordinates: [lng, lat] }, properties: { id, structureId: id, postedClearanceInches: 96, road: "TEST RD", crossing: "OVERPASS", appliesTo: "under", county: "QUEENS", state: "NY", location: "", owner: "", direction: null, clearanceType: "posted", sources: [], notes: [] } };
}

test("coverage envelope and corridor matching follow a straight path", () => {
  assert.equal(inCoverage(-73.99, 40.75), true);
  assert.equal(inCoverage(-73.76, 41.03), true); // White Plains
  assert.equal(inCoverage(-72.93, 41.31), true); // New Haven
  assert.equal(inCoverage(-74.17, 40.35), true); // GSP near Exit 105
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


test("distinct route filter drops near-duplicate geometries", () => {
  const primary = Array.from({ length: 20 }, (_, i) => [-73.99 + i * 0.01, 40.75]);
  const twin = primary.map(([lng, lat]) => [lng + 0.0002, lat]);
  const detour = primary.map(([lng, lat], i) => [lng, lat + (i > 5 && i < 15 ? 0.02 : 0)]);
  const kept = keepDistinctRoutes([
    { coordinates: primary, distanceMeters: 18000, durationSeconds: 1200 },
    { coordinates: twin, distanceMeters: 18100, durationSeconds: 1210 },
    { coordinates: detour, distanceMeters: 21000, durationSeconds: 1400 },
  ]);
  assert.equal(kept.length, 2);
  assert.equal(routeLinesDiffer(primary, twin, 18000, 18100), false);
  assert.equal(routeLinesDiffer(primary, detour, 18000, 21000), true);
});
