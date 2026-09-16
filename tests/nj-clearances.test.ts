import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  brkeyCandidates,
  decimalFeetToInches,
  normalizeNjTruckMap,
  NJ_TRUCK_MAP_2024,
  type BridgeCoord,
} from "../scripts/sources/nj-truck-map";
import { parseOsmMaxheight, normalizeOsmNjMaxheight } from "../scripts/sources/osm-nj-maxheight";

describe("NJ truck map clearances", () => {
  it("converts brochure decimal feet to whole inches", () => {
    assert.equal(decimalFeetToInches(13.5), 162);
    assert.equal(decimalFeetToInches(13.25), 159);
    assert.equal(decimalFeetToInches(12.33), 148);
    assert.equal(decimalFeetToInches(9.92), 119);
    assert.equal(decimalFeetToInches(0), null);
  });

  it("matches zero-padded BRKEY candidates", () => {
    assert.ok(brkeyCandidates("206159").includes("0206159"));
    assert.ok(brkeyCandidates("1222153").includes("1222153"));
  });

  it("emits posted NJ features when coords resolve", () => {
    const coords = new Map<string, BridgeCoord>([
      ["0206159", { brkey: "0206159", lng: -74.05, lat: 40.91 }],
      ["206159", { brkey: "0206159", lng: -74.05, lat: 40.91 }],
    ]);
    const { features, rejected } = normalizeNjTruckMap(
      NJ_TRUCK_MAP_2024.filter(r => r.structureNumber === "206159"),
      coords,
      "2026-09-16T00:00:00Z",
    );
    assert.equal(features.length, 1);
    assert.equal(rejected.length, 0);
    assert.equal(features[0].properties.state, "NJ");
    assert.equal(features[0].properties.clearanceType, "posted");
    assert.equal(features[0].properties.postedClearanceInches, 162);
  });
});

describe("OSM NJ maxheight", () => {
  it("parses common maxheight encodings", () => {
    assert.equal(parseOsmMaxheight("12'6\""), 150);
    assert.equal(parseOsmMaxheight("13'"), 156);
    assert.equal(parseOsmMaxheight("4.0 m"), 157);
    assert.equal(parseOsmMaxheight("13.5 ft"), 162);
    assert.equal(parseOsmMaxheight("default"), null);
    assert.equal(parseOsmMaxheight("unsigned"), null);
  });

  it("keeps community tags inside coverage and labels them", () => {
    const { features, rejected } = normalizeOsmNjMaxheight(
      [
        {
          type: "node",
          id: 1,
          lat: 40.75,
          lon: -74.05,
          tags: { maxheight: "12'0\"", name: "Test Overpass" },
        },
        {
          type: "node",
          id: 2,
          lat: 40.75,
          lon: -74.05,
          tags: { maxheight: "default" },
        },
      ],
      "2026-09-16T00:00:00Z",
    );
    assert.equal(features.length, 1);
    assert.equal(features[0].properties.clearanceType, "community");
    assert.equal(features[0].properties.state, "NJ");
    assert.equal(features[0].properties.postedClearanceInches, 144);
    assert.ok(rejected.some(r => r.reason.includes("Unparseable")));
  });
});
