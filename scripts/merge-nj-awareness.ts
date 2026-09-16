/**
 * Merge NYC-facing NJ parkway-style bans + PANYNJ crossings into the shared
 * parkways / facilities / major-crossings GeoJSON (same pattern as CT).
 *
 * Geometry: NJDOT Roadway Network FeatureServer.
 * Rules: Palisades commission, N.J.A.C. 19:9-1.9 / NJTA (GSP), NJDOT Pulaski order,
 * PANYNJ Feb 2026 truckers guide (heights/widths).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Feature, FeatureCollection, MultiLineString, Point, Position } from "geojson";

import { COVERAGE } from "../src/lib/path";

const ROOT = process.cwd();
const BUILT = path.join(ROOT, "data", "built");
const RAW = path.join(ROOT, "data", "raw");

const NJDOT_NETWORK =
  "https://services.arcgis.com/HggmsDF7UJsNN1FK/arcgis/rest/services/New_Jersey_DOT_Roadway_Network/FeatureServer/0";

/** Approximate Pulaski Skyway corridor on US 1 (NJDOT mileposts ~51–54.5). */
const PULASKI_BBOX = { minLng: -74.185, maxLng: -74.075, minLat: 40.718, maxLat: 40.755 };

type BBox = { minLng: number; maxLng: number; minLat: number; maxLat: number };

type ParkwayProps = {
  id: string;
  name: string;
  kind: "parkway";
  restriction: string;
  commercialBan: boolean;
  gcpTruckException: boolean;
  passengerOnlyHeightInches: number | null;
  labelLng: number;
  labelLat: number;
};

async function fetchGeoJson(where: string): Promise<FeatureCollection> {
  const query = new URL(`${NJDOT_NETWORK}/query`);
  query.searchParams.set("where", where);
  query.searchParams.set("outFields", "OBJECTID,SLD_NAME,SRI,ROAD_NUM,MP_START,MP_END");
  query.searchParams.set("returnGeometry", "true");
  query.searchParams.set("outSR", "4326");
  query.searchParams.set("f", "geojson");
  const response = await fetch(query, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`NJDOT fetch failed (${response.status}): ${query}`);
  return (await response.json()) as FeatureCollection;
}

function iterLines(geometry: Feature["geometry"] | null | undefined): Position[][] {
  if (!geometry) return [];
  if (geometry.type === "LineString") return [geometry.coordinates as Position[]];
  if (geometry.type === "MultiLineString") return geometry.coordinates as Position[][];
  return [];
}

function clipLine(line: Position[], bbox: BBox): Position[][] {
  const out: Position[][] = [];
  let cur: Position[] = [];
  for (const pos of line) {
    const [lng, lat] = pos;
    const ok = lng >= bbox.minLng && lng <= bbox.maxLng && lat >= bbox.minLat && lat <= bbox.maxLat;
    if (ok) cur.push([lng, lat]);
    else if (cur.length) {
      if (cur.length >= 2) out.push(cur);
      cur = [];
    }
  }
  if (cur.length >= 2) out.push(cur);
  return out;
}

function dissolve(fc: FeatureCollection, bbox: BBox): Position[][] {
  const lines: Position[][] = [];
  for (const feature of fc.features) {
    for (const line of iterLines(feature.geometry)) {
      lines.push(...clipLine(line, bbox));
    }
  }
  return lines;
}

function labelPoint(lines: Position[][]): [number, number] | null {
  const flat = lines.flat();
  if (!flat.length) return null;
  const mid = flat[Math.floor(flat.length / 2)];
  return [mid[0], mid[1]];
}

function isNjId(id: unknown) {
  return typeof id === "string" && (id.startsWith("parkway-nj-") || id.startsWith("panynj-"));
}

function parkwayFeature(
  id: string,
  name: string,
  lines: Position[][],
  restriction: string,
  opts: { trucksBanned?: boolean; operator: string },
): { parkway: Feature<MultiLineString, ParkwayProps>; facility: Feature } | null {
  const label = labelPoint(lines);
  if (!label || !lines.length) return null;
  const parkway: Feature<MultiLineString, ParkwayProps> = {
    type: "Feature",
    geometry: { type: "MultiLineString", coordinates: lines },
    properties: {
      id,
      name,
      kind: "parkway",
      restriction,
      commercialBan: true,
      gcpTruckException: false,
      passengerOnlyHeightInches: null,
      labelLng: label[0],
      labelLat: label[1],
    },
  };
  const facility: Feature = {
    type: "Feature",
    geometry: parkway.geometry,
    properties: {
      id,
      name,
      kind: "parkway",
      operator: opts.operator,
      heightInches: null,
      passengerOnlyHeightInches: null,
      widthInches: null,
      weightTons: null,
      postedLoadTons: null,
      trucksBanned: Boolean(opts.trucksBanned),
      commercialBan: true,
      gcpTruckException: false,
      noTrucksLower: false,
      noHazmat: false,
      restrictionNote: restriction,
      geometryRole: "line",
      labelLng: label[0],
      labelLat: label[1],
    },
  };
  return { parkway, facility };
}

type Crossing = {
  id: string;
  facilityId: string;
  name: string;
  kind: "bridge" | "tunnel";
  coordinates: [number, number];
  heightIn: number;
  widthIn: number;
  trucksBanned: boolean;
  commercialBan: boolean;
  noHazmat: boolean;
  restrictionNote: string;
};

const PANYNJ_CROSSINGS: Crossing[] = [
  {
    id: "gwb-upper",
    facilityId: "gwb-upper",
    name: "George Washington Bridge (upper level)",
    kind: "bridge",
    coordinates: [-73.9532, 40.8518],
    heightIn: 162,
    widthIn: 120,
    trucksBanned: false,
    commercialBan: false,
    noHazmat: false,
    restrictionNote: "Truck crossing. Height 13′6″. Size/weight rules still apply (PANYNJ Feb 2026).",
  },
  {
    id: "gwb-lower",
    facilityId: "gwb-lower",
    name: "George Washington Bridge (lower level)",
    kind: "bridge",
    coordinates: [-73.9515, 40.8518],
    heightIn: 162,
    widthIn: 120,
    trucksBanned: true,
    commercialBan: true,
    noHazmat: true,
    restrictionNote: "No trucks or vehicles towing trailers on the lower level. Height 13′6″. Propane prohibited (PANYNJ Feb 2026).",
  },
  {
    id: "lincoln",
    facilityId: "panynj-lincoln",
    name: "Lincoln Tunnel",
    kind: "tunnel",
    coordinates: [-74.01, 40.7625],
    heightIn: 156,
    widthIn: 102,
    trucksBanned: false,
    commercialBan: false,
    noHazmat: true,
    restrictionNote:
      "Height 13′0″; body width generally 8′6″. No trucks in center tube. Combination length limits apply. Propane prohibited (PANYNJ Feb 2026).",
  },
  {
    id: "holland",
    facilityId: "panynj-holland",
    name: "Holland Tunnel",
    kind: "tunnel",
    coordinates: [-74.021, 40.727],
    heightIn: 150,
    widthIn: 96,
    trucksBanned: false,
    commercialBan: false,
    noHazmat: true,
    restrictionNote:
      "Height 12′6″; body width 8′0″ for non-buses. No vehicles with four or more axles; no towing/combination vehicles. Propane prohibited (PANYNJ Feb 2026).",
  },
  {
    id: "bayonne",
    facilityId: "panynj-bayonne",
    name: "Bayonne Bridge",
    kind: "bridge",
    // Midspan (Wikipedia / Wikidata) — prior pin was ~4.5 km too far east over the Kill Van Kull.
    coordinates: [-74.1422, 40.6419],
    heightIn: 162,
    widthIn: 102,
    trucksBanned: false,
    commercialBan: false,
    noHazmat: false,
    restrictionNote: "Height 13′6″. Size/weight restrictions apply (PANYNJ Feb 2026).",
  },
  {
    id: "goethals",
    facilityId: "panynj-goethals",
    name: "Goethals Bridge",
    kind: "bridge",
    coordinates: [-74.197, 40.6355],
    heightIn: 162,
    widthIn: 102,
    trucksBanned: false,
    commercialBan: false,
    noHazmat: false,
    restrictionNote: "Height 13′6″. Size/weight restrictions apply (PANYNJ Feb 2026).",
  },
  {
    id: "outerbridge",
    facilityId: "panynj-outerbridge",
    name: "Outerbridge Crossing",
    kind: "bridge",
    coordinates: [-74.247, 40.525],
    heightIn: 162,
    widthIn: 102,
    trucksBanned: false,
    commercialBan: false,
    noHazmat: false,
    restrictionNote: "Height 13′6″. Size/weight restrictions apply (PANYNJ Feb 2026).",
  },
];

async function main() {
  console.log("Fetching NJDOT Palisades / GSP / US 1…");
  const [palRaw, gspRaw, us1Raw] = await Promise.all([
    fetchGeoJson(
      "SLD_NAME IN ('PALISADES INTERSTATE PARKWAY','PALISADES INTERSTATE PARKWAY SECONDARY','PALISADES INT. PARKWAY SPUR')",
    ),
    fetchGeoJson("SLD_NAME = 'GARDEN STATE PARKWAY'"),
    fetchGeoJson("SLD_NAME = 'US 1'"),
  ]);
  await mkdir(RAW, { recursive: true });
  await writeFile(path.join(RAW, "njdot-palisades.geojson"), `${JSON.stringify(palRaw)}\n`);
  await writeFile(path.join(RAW, "njdot-gsp.geojson"), `${JSON.stringify(gspRaw)}\n`);
  await writeFile(path.join(RAW, "njdot-us1.geojson"), `${JSON.stringify(us1Raw)}\n`);

  const coverage: BBox = {
    minLng: COVERAGE.minLng,
    maxLng: COVERAGE.maxLng,
    minLat: COVERAGE.minLat,
    maxLat: COVERAGE.maxLat,
  };

  const built = [
    parkwayFeature(
      "parkway-nj-palisades-interstate-parkway",
      "Palisades Interstate Parkway",
      dissolve(palRaw, coverage),
      "Passenger cars and motorcycles only under ordinary rules. Trucks, trailers, RVs, and vehicles with commercial/combination plates or business markings are prohibited (Palisades Interstate Park Commission).",
      { operator: "Palisades Interstate Park Commission" },
    ),
    parkwayFeature(
      "parkway-nj-garden-state-parkway",
      "Garden State Parkway (north of Exit 105)",
      dissolve(gspRaw, coverage),
      "North of Exit 105: commercial vehicles with GVWR over 10,000 lb prohibited (N.J.A.C. 19:9-1.9), with listed exceptions. NJTA public summary cites registered weight ≥ 10,000 lb — measurement and threshold differ; verify for your vehicle.",
      { operator: "NJ Turnpike Authority" },
    ),
    parkwayFeature(
      "parkway-nj-pulaski-skyway",
      "Pulaski Skyway",
      dissolve(us1Raw, PULASKI_BBOX),
      "No trucks or buses in either direction on the Pulaski Skyway (US 1&9), including covered ramps/connections, except limited emergency/maintenance uses (NJDOT restricted-access order).",
      { trucksBanned: true, operator: "NJDOT" },
    ),
  ].filter(Boolean) as { parkway: Feature<MultiLineString, ParkwayProps>; facility: Feature }[];

  console.log(`  ${built.length} NJ corridors`);

  const parkwaysPath = path.join(BUILT, "parkways-nyc-li.geojson");
  const facilitiesPath = path.join(BUILT, "facilities-nyc-li.geojson");
  const crossingsPath = path.join(BUILT, "major-crossings.geojson");
  const metaPath = path.join(BUILT, "awareness-metadata.json");

  const parkways = JSON.parse(await readFile(parkwaysPath, "utf8")) as FeatureCollection;
  const facilities = JSON.parse(await readFile(facilitiesPath, "utf8")) as FeatureCollection;
  const crossings = JSON.parse(await readFile(crossingsPath, "utf8")) as FeatureCollection;
  const meta = JSON.parse(await readFile(metaPath, "utf8")) as Record<string, unknown>;

  parkways.features = [
    ...parkways.features.filter(f => !isNjId(f.properties?.id)),
    ...built.map(b => b.parkway),
  ];
  facilities.features = [
    ...facilities.features.filter(f => !isNjId(f.properties?.id)),
    ...built.map(b => b.facility),
    ...PANYNJ_CROSSINGS.map(
      (c): Feature<Point> => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: c.coordinates },
        properties: {
          id: c.facilityId,
          name: c.name,
          kind: c.kind,
          operator: "PANYNJ",
          heightInches: c.heightIn,
          passengerOnlyHeightInches: null,
          widthInches: c.widthIn,
          weightTons: null,
          postedLoadTons: null,
          trucksBanned: c.trucksBanned,
          commercialBan: c.commercialBan,
          gcpTruckException: false,
          noTrucksLower: false,
          noHazmat: c.noHazmat,
          restrictionNote: c.restrictionNote,
          geometryRole: "point",
          labelLng: c.coordinates[0],
          labelLat: c.coordinates[1],
        },
      }),
    ),
  ];

  const dropIds = new Set(["gwb", "george-washington-bridge", ...PANYNJ_CROSSINGS.map(c => c.id)]);
  const kept = crossings.features.filter(f => !dropIds.has(String(f.properties?.id || "")));
  for (const c of PANYNJ_CROSSINGS) {
    kept.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: c.coordinates },
      properties: {
        id: c.id,
        name: c.name,
        kind: c.kind,
        operator: "PANYNJ",
        heightIn: c.heightIn,
        widthIn: c.widthIn,
        trucksBanned: c.trucksBanned,
        noHazmat: c.noHazmat,
        restrictionNote: c.restrictionNote,
      },
    });
  }
  crossings.features = kept;

  await writeFile(parkwaysPath, `${JSON.stringify(parkways)}\n`);
  await writeFile(facilitiesPath, `${JSON.stringify(facilities)}\n`);
  await writeFile(crossingsPath, `${JSON.stringify(crossings)}\n`);

  const sources = (meta.sources || {}) as Record<string, Record<string, unknown>>;
  sources.parkways = {
    ...(sources.parkways || {}),
    file: "parkways-nyc-li.geojson",
    facilityCount: parkways.features.length,
    nj: "NJDOT Roadway Network + Palisades / NJTA / NJDOT restriction text",
    njCount: built.length,
  };
  sources.majorCrossings = {
    ...(sources.majorCrossings || {}),
    file: "major-crossings.geojson",
    count: crossings.features.length,
    note: "Curated MTA / PANYNJ / NYCDOT limits — PANYNJ heights from Feb 2026 truckers guide",
  };
  meta.sources = sources;
  meta.builtAt = new Date().toISOString();
  const notes = Array.isArray(meta.notes) ? meta.notes.filter((n): n is string => typeof n === "string") : [];
  if (!notes.some(n => n.includes("NJ parkways"))) {
    notes.push(
      "NJ NYC-facing parkways (Palisades, GSP north of 105, Pulaski) and PANYNJ crossings are merged into the same GeoJSON as NYC/LI/CT.",
    );
  }
  meta.notes = notes;
  await writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`);

  console.log(`Wrote ${parkwaysPath} (${parkways.features.length} parkways)`);
  console.log(`Wrote ${facilitiesPath} (${facilities.features.length} facilities)`);
  console.log(`Wrote ${crossingsPath} (${crossings.features.length} crossings)`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
