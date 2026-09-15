import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { shouldSurfaceMapError } from "../src/lib/map-errors";

describe("shouldSurfaceMapError", () => {
  it("surfaces style/map-level failures with no sourceId", () => {
    assert.equal(
      shouldSurfaceMapError({ error: { message: "Failed to fetch" } }),
      true,
    );
  });

  it("surfaces clearances source failures", () => {
    assert.equal(
      shouldSurfaceMapError({
        sourceId: "clearances",
        error: { message: "Failed to load geojson" },
      }),
      true,
    );
  });

  it("ignores per-tile one-offs", () => {
    assert.equal(
      shouldSurfaceMapError({
        sourceId: "openmaptiles",
        tile: { tileID: "12/1234/5678" },
        error: { message: "Failed to fetch" },
      }),
      false,
    );
  });

  it("ignores abort/cancel errors", () => {
    assert.equal(
      shouldSurfaceMapError({ error: { name: "AbortError", message: "The operation was aborted." } }),
      false,
    );
    assert.equal(
      shouldSurfaceMapError({ error: { message: "Request cancelled" } }),
      false,
    );
  });

  it("ignores non-critical overlay source errors", () => {
    assert.equal(
      shouldSurfaceMapError({
        sourceId: "truck-routes",
        error: { message: "Failed to fetch" },
      }),
      false,
    );
  });
});
