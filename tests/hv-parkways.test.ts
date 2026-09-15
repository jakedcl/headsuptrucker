import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const parkways = JSON.parse(readFileSync("public/data/parkways-nyc-li.geojson", "utf8"));
const facilities = JSON.parse(readFileSync("public/data/facilities-nyc-li.geojson", "utf8"));
const lines = JSON.parse(readFileSync("public/data/awareness-lines.geojson", "utf8"));

describe("Hudson Valley parkways in shared awareness", () => {
  it("adds Westchester / Rockland corridors beside NYC/CT/NJ", () => {
    const ids = new Set(parkways.features.map((f: { properties: { id: string } }) => f.properties.id));
    for (const id of [
      "parkway-saw-mill-river-parkway",
      "parkway-sprain-brook-state-parkway",
      "parkway-taconic-state-parkway",
      "parkway-cross-county-parkway",
      "parkway-hutchinson-river-parkway-westchester",
      "parkway-bronx-river-parkway-westchester",
      "parkway-farragut-parkway",
      "parkway-bear-mountain-state-parkway",
    ]) {
      assert.ok(ids.has(id), `missing ${id}`);
    }
    assert.ok(parkways.features.length >= 40);
  });

  it("keeps commercial bans and lands in unified lines", () => {
    const saw = parkways.features.find(
      (f: { properties: { id: string } }) => f.properties.id === "parkway-saw-mill-river-parkway",
    );
    assert.equal(saw.properties.commercialBan, true);
    assert.ok(String(saw.properties.restriction).length > 10);
    const fac = facilities.features.find(
      (f: { properties: { id: string } }) => f.properties.id === "parkway-saw-mill-river-parkway",
    );
    assert.ok(fac);
    assert.equal(fac.properties.geometryRole, "line");
    assert.ok(lines.features.some((f: { properties: { id: string } }) => f.properties.id === "parkway-saw-mill-river-parkway"));
  });

  it("merges NY Palisades into the shared Palisades corridor", () => {
    const pal = parkways.features.find(
      (f: { properties: { id: string } }) => f.properties.id === "parkway-nj-palisades-interstate-parkway",
    );
    assert.ok(pal);
    assert.equal(pal.geometry.type, "MultiLineString");
    assert.ok(pal.geometry.coordinates.length > 50, "should include NJ + NY segments");
  });

  it("gives Long Mountain a 14′ default because it has no posted height restriction", () => {
    const longMtn = parkways.features.find(
      (f: { properties: { id: string } }) => f.properties.id === "parkway-long-mountain-parkway",
    );
    assert.ok(longMtn);
    assert.equal(longMtn.properties.passengerOnlyHeightInches, 168);
    assert.equal(longMtn.properties.heightSource, "default-unrestricted");
    const fac = facilities.features.find(
      (f: { properties: { id: string } }) => f.properties.id === "parkway-long-mountain-parkway",
    );
    assert.equal(fac.properties.heightInches, 168);
  });
});
