import { test } from "node:test";
import assert from "node:assert/strict";
import { getClearanceSeverity, parseVehicleHeight, parseHeightParam, formatHeight, isInventoryLabel, recordLabels } from "../src/lib/clearance";

test("9 foot warning boundaries include equality and exactly 12 inches", () => {
  for (const [posting, severity] of [[107, "danger"], [108, "danger"], [109, "caution"], [120, "caution"], [121, "clear"]] as const) assert.equal(getClearanceSeverity(posting, 108), severity);
});
test("height parsing rejects blanks, fractional values, overflow, and invalid URL input", () => {
  assert.equal(parseVehicleHeight("9", "0"), 108);
  assert.equal(parseVehicleHeight("8", "11"), 107);
  for (const [ft, inc] of [["", "0"], ["9", ""], ["9", "12"], ["9.5", "0"], ["-1", "0"], ["20", "1"], ["0", "0"]]) assert.equal(parseVehicleHeight(ft, inc), null);
  for (const v of [undefined, null, "NaN", "1e2", "108x", "108.5", "-1", "241", "0", " "]) assert.equal(parseHeightParam(v), null);
  assert.equal(parseHeightParam("108"), 108);
  assert.equal(formatHeight(107), "8′ 11″");
  assert.throws(() => getClearanceSeverity(NaN, 108));
});
test("list titles prefer street names over inventory codes", () => {
  for (const code of ["907A907AX5M22117", "907A 907AX5M22128", "908M908M03011105", "908T 908T 0301 1100"]) assert.equal(isInventoryLabel(code), true);
  for (const name of ["NY25B - HILLSIDE AVE", "900P - Jamaica Ave", "ROBBINS LANE", "NY24", "I-495", "BIKE PATH", "I278 - Gowanus Expressway"]) assert.equal(isInventoryLabel(name), false);
  assert.deepEqual(recordLabels({ road: "907A907AX5M22117", crossing: "NY25B - HILLSIDE AVE", location: "300’ west of Commonwealth Blvd", appliesTo: "under" }), {
    title: "Under NY25B - HILLSIDE AVE", subtitle: "300’ west of Commonwealth Blvd",
  });
  assert.deepEqual(recordLabels({ road: "ROBBINS LANE", crossing: "I495 - Long Island Expressway", location: "1.2m E I-495 + RT135", appliesTo: "under" }), {
    title: "ROBBINS LANE", subtitle: "Under I495 - Long Island Expressway",
  });
  assert.deepEqual(recordLabels({ road: "908M908M03011105", crossing: "00908M00315B", location: "JCT RTS SSP+WSP", appliesTo: "under" }), {
    title: "JCT RTS SSP+WSP", subtitle: "Under 00908M00315B",
  });
});
