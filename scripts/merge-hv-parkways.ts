/**
 * Merge Hudson Valley parkway bans into the shared parkways / facilities layer.
 *
 * Rules text: NYSDOT CommVehicleDataFeed Parkways (layer 2) — attributes only
 * Geometry:   NYSDOT Roadway Inventory FeatureServer (Parkway_Flag / name match)
 *
 * Same shared schema as NYC / LI / CT / NJ corridors.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Feature, FeatureCollection, MultiLineString, Position } from "geojson";
import { COVERAGE } from "../src/lib/path";

const PUBLIC_DIR = path.join(process.cwd(), "public", "data");
const RAW_DIR = path.join(process.cwd(), "data", "raw");

const RULES_URL =
  "https://gis.dot.ny.gov/hostingny/rest/services/CommVehicleDataFeed/MapServer/2/query";
const ROADWAY_URL =
  "https://gis.dot.ny.gov/hostingny/rest/services/Roadways/Roadway/FeatureServer/3/query";

type Box = { minLng: number; maxLng: number; minLat: number; maxLat: number };
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

type Target = {
  id: string;
  name: string;
  operator: string;
  /** Exact PARKWAYNAME in CommVehicleDataFeed */
  rulesName: string;
  /** SQL where-clause fragment against Roadway Inventory */
  roadwayWhere: string;
  mergeIntoId?: string;
};

const TARGETS: Target[] = [
  {
    id: "parkway-saw-mill-river-parkway",
    name: "Saw Mill River Parkway",
    operator: "NYSDOT",
    rulesName: "Saw Mill River Parkway",
    roadwayWhere: "Parkway_Flag='T' AND Roadway_Name='Saw Mill River Pkwy'",
  },
  {
    id: "parkway-sprain-brook-state-parkway",
    name: "Sprain Brook State Parkway",
    operator: "NYSDOT",
    rulesName: "Sprain Brook State Parkway",
    roadwayWhere: "Parkway_Flag='T' AND Roadway_Name='Sprain Brook Pkwy'",
  },
  {
    id: "parkway-taconic-state-parkway",
    name: "Taconic State Parkway",
    operator: "NYSDOT",
    rulesName: "Taconic State Parkway",
    roadwayWhere: "Parkway_Flag='T' AND Roadway_Name='Taconic State Pkwy'",
  },
  {
    id: "parkway-cross-county-parkway",
    name: "Cross County Parkway",
    operator: "NYSDOT",
    rulesName: "Cross County Parkway",
    roadwayWhere: "Parkway_Flag='T' AND Roadway_Name='Cross County Parkway'",
  },
  {
    id: "parkway-hutchinson-river-parkway-westchester",
    name: "Hutchinson River Parkway (Westchester)",
    operator: "NYSDOT",
    rulesName: "Hutchinson River Parkway (Westchester)",
    roadwayWhere: "Parkway_Flag='T' AND Roadway_Name='Hutchinson Riv Pkwy' AND County_Name='Westchester'",
  },
  {
    id: "parkway-bronx-river-parkway-westchester",
    name: "Bronx River Parkway (Westchester)",
    operator: "Westchester County",
    rulesName: "Bronx River Parkway (Westchester)",
    roadwayWhere:
      "County_Name='Westchester' AND (Roadway_Name='BRONX RIVER PARKWAY' OR Roadway_Name='BRONX RIVER PKWY')",
  },
  {
    id: "parkway-lake-welch-parkway",
    name: "Lake Welch Parkway",
    operator: "NYSDOT",
    rulesName: "Lake Welch Parkway",
    roadwayWhere: "Parkway_Flag='T' AND Roadway_Name='Lake Welch Pkwy'",
  },
  {
    id: "parkway-seven-lakes-parkway",
    name: "Seven Lakes Parkway",
    operator: "NYSDOT",
    rulesName: "Seven Lakes Parkway",
    roadwayWhere: "Parkway_Flag='T' AND Roadway_Name='Seven Lakes Pkwy'",
  },
  {
    id: "parkway-long-mountain-parkway",
    name: "Long Mountain Parkway",
    operator: "NYSDOT",
    rulesName: "Long Mountain Parkway",
    roadwayWhere: "Parkway_Flag='T' AND Roadway_Name LIKE 'LONG MOUNTAIN%'",
  },
  {
    id: "parkway-palisades-interstate-parkway-ny",
    name: "Palisades Interstate Parkway",
    operator: "NYSDOT",
    rulesName: "Palisades Interstate Parkway",
    roadwayWhere: "Parkway_Flag='T' AND Roadway_Name='Palisades Int Pkwy'",
    mergeIntoId: "parkway-nj-palisades-interstate-parkway",
  },
  {
    id: "parkway-farragut-parkway",
    name: "Farragut Parkway",
    operator: "NYSDOT",
    rulesName: "Farragut Parkway",
    roadwayWhere: "Roadway_Name='Farragut Pkwy'",
  },
  {
    id: "parkway-bear-mountain-state-parkway",
    name: "Bear Mountain State Parkway",
    operator: "NYSDOT",
    rulesName: "Bear Mountain State Parkway",
    roadwayWhere: "Roadway_Name='Bear Mountain Pkwy'",
  },
];

const MANAGED_IDS = new Set(TARGETS.filter(t => !t.mergeIntoId).map(t => t.id));
const BOX: Box = {
  minLng: COVERAGE.minLng,
  maxLng: COVERAGE.maxLng,
  minLat: COVERAGE.minLat,
  maxLat: COVERAGE.maxLat,
};

async function fetchRules(): Promise<Map<string, string>> {
  const url = new URL(RULES_URL);
  url.searchParams.set("where", "1=1");
  url.searchParams.set("outFields", "PARKWAYNAME,CV_RESTRICTIONS");
  url.searchParams.set("returnGeometry", "false");
  url.searchParams.set("resultRecordCount", "2000");
  url.searchParams.set("f", "json");
  const json = (await (await fetch(url)).json()) as {
    features?: Array<{ attributes: { PARKWAYNAME: string; CV_RESTRICTIONS: string } }>;
  };
  const map = new Map<string, string>();
  for (const f of json.features || []) {
    map.set(f.attributes.PARKWAYNAME, f.attributes.CV_RESTRICTIONS);
  }
  return map;
}

async function fetchRoadway(where: string): Promise<FeatureCollection> {
  const features: Feature[] = [];
  let offset = 0;
  for (;;) {
    const url = new URL(ROADWAY_URL);
    url.searchParams.set("where", where);
    url.searchParams.set("outFields", "OBJECTID,Roadway_Name,County_Name,Route_ID");
    url.searchParams.set("returnGeometry", "true");
    url.searchParams.set("outSR", "4326");
    url.searchParams.set("resultOffset", String(offset));
    url.searchParams.set("resultRecordCount", "1000");
    url.searchParams.set("f", "geojson");
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Roadway fetch failed (${res.status}) for ${where}`);
    const page = (await res.json()) as FeatureCollection & { exceededTransferLimit?: boolean };
    if (!Array.isArray(page.features)) throw new Error(`Bad roadway response for ${where}`);
    features.push(...page.features);
    if (!page.exceededTransferLimit || page.features.length === 0) break;
    offset += page.features.length;
  }
  return { type: "FeatureCollection", features };
}

function linesOf(geometry: Feature["geometry"] | null | undefined): Position[][] {
  if (!geometry) return [];
  if (geometry.type === "LineString") return [geometry.coordinates as Position[]];
  if (geometry.type === "MultiLineString") return geometry.coordinates as Position[][];
  return [];
}

function clip(line: Position[], box: Box): Position[][] {
  const out: Position[][] = [];
  let cur: Position[] = [];
  for (const pos of line) {
    const [lng, lat] = pos;
    const ok = lng >= box.minLng && lng <= box.maxLng && lat >= box.minLat && lat <= box.maxLat;
    if (ok) cur.push([lng, lat]);
    else if (cur.length) {
      if (cur.length >= 2) out.push(cur);
      cur = [];
    }
  }
  if (cur.length >= 2) out.push(cur);
  return out;
}

function clippedLines(fc: FeatureCollection): Position[][] {
  const lines: Position[][] = [];
  for (const feature of fc.features) {
    for (const line of linesOf(feature.geometry)) lines.push(...clip(line, BOX));
  }
  return lines;
}

function midLabel(lines: Position[][]): [number, number] | null {
  const flat = lines.flat();
  if (!flat.length) return null;
  const mid = flat[Math.floor(flat.length / 2)];
  return [mid[0], mid[1]];
}

function build(id: string, name: string, lines: Position[][], restriction: string, operator: string) {
  const label = midLabel(lines);
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
      operator,
      heightInches: null,
      passengerOnlyHeightInches: null,
      widthInches: null,
      weightTons: null,
      postedLoadTons: null,
      trucksBanned: false,
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

async function main() {
  console.log("Fetching NYSDOT parkway rules…");
  const rules = await fetchRules();
  console.log(`Rule rows: ${rules.size}`);

  const built: NonNullable<ReturnType<typeof build>>[] = [];
  const palNy: Position[][] = [];
  let palRestriction = "";

  for (const target of TARGETS) {
    console.log(`Fetching geometry: ${target.name}`);
    const roadway = await fetchRoadway(target.roadwayWhere);
    await mkdir(RAW_DIR, { recursive: true });
    await writeFile(
      path.join(RAW_DIR, `nysdot-roadway-${target.id}.geojson`),
      `${JSON.stringify(roadway)}\n`,
    );
    const lines = clippedLines(roadway);
    const restriction =
      rules.get(target.rulesName) || "Passenger cars only. No commercial vehicles (NYSDOT).";
    if (!lines.length) {
      console.warn(`skip (no in-coverage geometry): ${target.name}`);
      continue;
    }
    if (target.mergeIntoId) {
      palNy.push(...lines);
      palRestriction = restriction;
      console.log(`queue merge ${lines.length} parts → ${target.mergeIntoId}`);
      continue;
    }
    const feature = build(target.id, target.name, lines, restriction, target.operator);
    if (!feature) continue;
    built.push(feature);
    console.log(`+ ${target.name} (${lines.length} parts, ${roadway.features.length} raw)`);
  }

  const parkwaysPath = path.join(PUBLIC_DIR, "parkways-nyc-li.geojson");
  const facilitiesPath = path.join(PUBLIC_DIR, "facilities-nyc-li.geojson");
  const metaPath = path.join(PUBLIC_DIR, "awareness-metadata.json");

  const parkways = JSON.parse(await readFile(parkwaysPath, "utf8")) as FeatureCollection;
  const facilities = JSON.parse(await readFile(facilitiesPath, "utf8")) as FeatureCollection;

  parkways.features = parkways.features.filter(f => !MANAGED_IDS.has(String(f.properties?.id || "")));
  facilities.features = facilities.features.filter(f => !MANAGED_IDS.has(String(f.properties?.id || "")));

  if (palNy.length) {
    const existing = parkways.features.find(f => f.properties?.id === "parkway-nj-palisades-interstate-parkway");
    if (existing?.geometry && "coordinates" in existing.geometry) {
      const coords =
        existing.geometry.type === "MultiLineString"
          ? (existing.geometry.coordinates as Position[][])
          : existing.geometry.type === "LineString"
            ? [existing.geometry.coordinates as Position[]]
            : [];
      existing.geometry = { type: "MultiLineString", coordinates: [...coords, ...palNy] };
      existing.properties = {
        ...existing.properties,
        name: "Palisades Interstate Parkway",
        restriction:
          palRestriction ||
          String(existing.properties?.restriction || "Passenger cars only on the Palisades Interstate Parkway."),
      };
      const fac = facilities.features.find(f => f.properties?.id === "parkway-nj-palisades-interstate-parkway");
      if (fac) {
        fac.geometry = existing.geometry;
        fac.properties = {
          ...fac.properties,
          name: "Palisades Interstate Parkway",
          restrictionNote: existing.properties?.restriction,
        };
      }
      console.log(`merged ${palNy.length} NY Palisades parts into shared Palisades corridor`);
    }
  }

  parkways.features.push(...built.map(b => b.parkway));
  facilities.features.push(...built.map(b => b.facility));
  parkways.features.sort((a, b) => String(a.properties?.id).localeCompare(String(b.properties?.id)));
  facilities.features.sort((a, b) => String(a.properties?.id).localeCompare(String(b.properties?.id)));

  await writeFile(parkwaysPath, `${JSON.stringify(parkways)}\n`);
  await writeFile(facilitiesPath, `${JSON.stringify(facilities)}\n`);

  try {
    const meta = JSON.parse(await readFile(metaPath, "utf8")) as {
      sources?: Record<string, unknown>;
      notes?: string[];
    };
    meta.sources = {
      ...(meta.sources || {}),
      parkways: {
        file: "parkways-nyc-li.geojson",
        facilityCount: parkways.features.length,
        hudsonValley: "NYSDOT CommVehicleDataFeed rules + Roadway Inventory geometry",
      },
    };
    const notes = Array.isArray(meta.notes) ? meta.notes : [];
    if (!notes.some(n => n.includes("Hudson Valley parkways"))) {
      notes.push(
        "Hudson Valley parkways (Saw Mill, Sprain Brook, Taconic, Cross County, Hutch Westchester, etc.) use NYSDOT commercial-vehicle rules with NYSDOT roadway geometry, in the same shared parkways layer as NYC/LI/CT/NJ.",
      );
    }
    meta.notes = notes;
    await writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`);
  } catch {
    // optional
  }

  console.log(`Wrote ${parkwaysPath} (${parkways.features.length})`);
  console.log(`Wrote ${facilitiesPath} (${facilities.features.length})`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
