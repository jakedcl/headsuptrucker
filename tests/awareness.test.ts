import { test } from "node:test";
import assert from "node:assert/strict";
import { parseStatePlaneLineWkt, statePlaneToLngLat } from "../src/lib/nyc-state-plane";
import { normalizeRouteType, normalizeTruckRouteFeature } from "../scripts/sources/nyc-truck-routes";
import { isActiveClosure, normalizeStreetClosure } from "../scripts/sources/nyc-street-closures";

test("state plane converter lands Anthony Ave Bronx near expected lon/lat", () => {
  const [lng, lat] = statePlaneToLngLat(1011445.34, 250115.43);
  assert.ok(lng > -74.0 && lng < -73.8);
  assert.ok(lat > 40.8 && lat < 40.9);
});

test("LINESTRING and MULTILINESTRING WKT parse to WGS84 rings", () => {
  const line = parseStatePlaneLineWkt(
    "LINESTRING (980074.59839999676 177678.69110000134, 979912.849999994 177467.10680000484)",
  );
  assert.ok(line);
  assert.equal(line!.length, 2);
  assert.ok(line![0][0] < -73.8 && line![0][1] > 40.6);

  const multi = parseStatePlaneLineWkt(
    "MULTILINESTRING ((978191.6888000071 172821.33540000021, 978100.2324000001 172737.664199993), (978016.01340000331 172642.7694, 977900 172500))",
  );
  assert.ok(multi);
  assert.ok(multi!.length >= 2);

  assert.equal(parseStatePlaneLineWkt("POINT (1 2)"), null);
});

test("truck route types and restriction text normalize", () => {
  assert.equal(normalizeRouteType("Through"), "Through");
  assert.equal(normalizeRouteType("limited local"), "Limited Local");
  assert.equal(normalizeRouteType(""), "Other");

  const feature = normalizeTruckRouteFeature({
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates: [
        [-73.99, 40.75],
        [-73.98, 40.76],
      ],
    },
    properties: {
      segmentid: "0073071",
      street: "JEROME AVENUE",
      boroname: "Bronx",
      routetype: "Local",
      restrictio: "HEIGHT LIMIT 12 FT",
      thrubrg: "",
      thrutunl: "",
      thruexwy: "",
      localbrg: "Y",
      localtunl: "",
    },
  });
  assert.ok(feature);
  assert.equal(feature!.properties.id, "nyc-truck-0073071");
  assert.equal(feature!.properties.restriction, "HEIGHT LIMIT 12 FT");
  assert.equal(feature!.properties.isBridge, true);
});

test("street closures keep only active LINESTRING rows", () => {
  const now = new Date("2026-09-14T12:00:00Z");
  assert.equal(isActiveClosure("2026-09-20T00:00:00.000", now), true);
  assert.equal(isActiveClosure("2026-09-01T00:00:00.000", now), false);

  const active = normalizeStreetClosure(
    {
      oftcode: "abc",
      onstreetname: "1 AVENUE",
      fromstreetname: "43 STREET",
      tostreetname: "44 STREET",
      boroughname: "BROOKLYN",
      purpose: "ROAD CLOSED",
      workstartdate: "2026-09-01T00:00:00.000",
      workenddate: "2026-12-01T00:00:00.000",
      wkt: "LINESTRING (980074.59839999676 177678.69110000134, 979912.849999994 177467.10680000484)",
    },
    0,
    now,
  );
  assert.ok(active);
  assert.equal(active!.properties.street, "1 AVENUE");
  assert.equal(active!.geometry.coordinates.length, 2);

  const expired = normalizeStreetClosure(
    {
      oftcode: "abc",
      onstreetname: "1 AVENUE",
      fromstreetname: "43 STREET",
      tostreetname: "44 STREET",
      boroughname: "BROOKLYN",
      purpose: "ROAD CLOSED",
      workstartdate: "2026-01-01T00:00:00.000",
      workenddate: "2026-01-02T00:00:00.000",
      wkt: "LINESTRING (980074.59839999676 177678.69110000134, 979912.849999994 177467.10680000484)",
    },
    1,
    now,
  );
  assert.equal(expired, null);
});
