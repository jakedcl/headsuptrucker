import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  emptyLineCollection,
  emptyPointCollection,
  isLineFeature,
  isPointFeature,
  type AwarenessFeature,
} from "../src/lib/awareness-schema";
import { AWARENESS_SOURCES, sourceById } from "../scripts/sources/registry";

describe("awareness schema", () => {
  it("starts with empty collections", () => {
    assert.equal(emptyPointCollection().features.length, 0);
    assert.equal(emptyLineCollection().features.length, 0);
  });

  it("classifies geometry role helpers", () => {
    const point: AwarenessFeature = {
      type: "Feature",
      geometry: { type: "Point", coordinates: [-73.9, 40.7] },
      properties: {
        id: "demo-point",
        name: "Demo overpass",
        kind: "clearance",
        geometryRole: "point",
        state: "NY",
        limits: { heightInches: 126 },
        access: {},
        notes: [],
        sources: [],
      },
    };
    const line: AwarenessFeature = {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [
          [-73.9, 40.7],
          [-73.8, 40.8],
        ],
      },
      properties: {
        id: "demo-line",
        name: "Demo parkway",
        kind: "parkway",
        geometryRole: "line",
        state: "NY",
        limits: {},
        access: { commercialBan: true },
        notes: [],
        sources: [],
      },
    };
    assert.equal(isPointFeature(point), true);
    assert.equal(isLineFeature(point), false);
    assert.equal(isLineFeature(line), true);
    assert.equal(isPointFeature(line), false);
  });
});

describe("source registry", () => {
  it("has unique ids and known active clearance sources", () => {
    const ids = AWARENESS_SOURCES.map(s => s.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(sourceById("nysdot-posted-height"));
    assert.ok(sourceById("ctdot-posted-height"));
    assert.equal(sourceById("nj-truck-map")?.status, "active");
    assert.equal(sourceById("osm-nj-maxheight")?.status, "active");
    assert.equal(sourceById("nj-posted-clearances")?.status, "planned");
  });
});
