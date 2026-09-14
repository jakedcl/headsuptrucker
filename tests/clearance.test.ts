import { test } from "node:test";
import assert from "node:assert/strict";
import { getClearanceSeverity, parseVehicleHeight, parseHeightParam, formatHeight } from "../src/lib/clearance";

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
