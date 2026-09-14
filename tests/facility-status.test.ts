import assert from "node:assert/strict";
import test from "node:test";
import { evaluateFacility, type FacilityLimits } from "../src/lib/facility-status";

const holland: FacilityLimits = {
  id: "holland",
  name: "Holland Tunnel",
  kind: "tunnel",
  heightInches: 150,
  widthInches: 96,
  noHazmat: true,
};

test("height-only: clears when under posted height (hazmat is FYI)", () => {
  const ev = evaluateFacility(holland, {
    heightInches: 120,
    widthInches: null,
    weightTons: null,
    commercial: false,
  });
  assert.equal(ev.status, "ok");
  assert.ok(ev.reasons.some(r => r.dimension === "height" && r.status === "ok"));
  assert.ok(!ev.reasons.some(r => r.dimension === "width"));
});

test("optional width fails when provided and over limit", () => {
  const ev = evaluateFacility(holland, {
    heightInches: 120,
    widthInches: 102,
    weightTons: null,
    commercial: false,
  });
  assert.equal(ev.status, "danger");
  assert.ok(ev.reasons.some(r => r.dimension === "width" && r.status === "danger"));
});

test("parkway commercial ban only bites when commercial is on", () => {
  const parkway: FacilityLimits = {
    id: "belt",
    name: "Belt Parkway",
    kind: "parkway",
    commercialBan: true,
    restrictionNote: "No Commercial Vehicles",
  };
  const personal = evaluateFacility(parkway, {
    heightInches: 120,
    widthInches: null,
    weightTons: null,
    commercial: false,
  });
  assert.equal(personal.status, "ok");
  const truck = evaluateFacility(parkway, {
    heightInches: 120,
    widthInches: null,
    weightTons: null,
    commercial: true,
  });
  assert.equal(truck.status, "danger");
});

test("height caution band is 1–12 inches", () => {
  const ev = evaluateFacility(holland, {
    heightInches: 144,
    widthInches: null,
    weightTons: null,
    commercial: false,
  });
  assert.equal(ev.status, "caution");
});

test("blank width/weight never fail a facility", () => {
  const facility: FacilityLimits = {
    id: "x",
    name: "X",
    kind: "bridge",
    heightInches: 168,
    widthInches: 96,
    postedLoadTons: 10,
  };
  const ev = evaluateFacility(facility, {
    heightInches: 120,
    widthInches: null,
    weightTons: null,
    commercial: false,
  });
  assert.equal(ev.status, "ok");
  assert.ok(!ev.reasons.some(r => r.dimension === "width" || r.dimension === "weight"));
});
