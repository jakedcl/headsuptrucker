/**
 * Apply researched corridor / facility heights where state GIS omitted them.
 * Sources documented in docs/researched-heights.md — never invent values.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Feature, FeatureCollection, Point } from "geojson";

const PUBLIC = path.join(process.cwd(), "public", "data");

/** Corridor mins from NYSDOT inventory / NJ admin code. */
const PARKWAY_HEIGHTS: Record<
  string,
  { inches: number; source: string; note: string }
> = {
  "parkway-saw-mill-river-parkway": {
    inches: 91,
    source: "nysdot-inventory-min",
    note: "Yonkers Ave over Saw Mill — NYSDOT BIN 5500530 posted 7′7″",
  },
  "parkway-bronx-river-parkway-westchester": {
    inches: 104,
    source: "nysdot-inventory-min",
    note: "Parkway Viaduct over BRP — NYSDOT BIN 3348850 posted 8′8″",
  },
  "parkway-hutchinson-river-parkway-westchester": {
    inches: 114,
    source: "nysdot-inventory-min",
    note: "NY 120A King St over Hutch — NYSDOT BIN 1037390 posted 9′6″",
  },
  "parkway-cross-county-parkway": {
    inches: 132,
    source: "nysdot-inventory-min",
    note: "Saw Mill over Cross County — NYSDOT BIN 5500529 posted 11′0″",
  },
  "parkway-taconic-state-parkway": {
    inches: 120,
    source: "nysdot-inventory-min",
    note: "NY 301 over Taconic — NYSDOT BIN 1045300 posted 10′0″",
  },
  "parkway-nj-palisades-interstate-parkway": {
    inches: 139,
    source: "nysdot-inventory-min",
    note: "CR 110 over PIP (NY) — NYSDOT BIN 1040880 posted 11′7″",
  },
  "parkway-nj-garden-state-parkway": {
    inches: 162,
    source: "nj-admin-code",
    note: "N.J.A.C. 19:9-1.9 legal vehicle-height ceiling 13′6″ north of Exit 105 — roadway regulation, not a verified minimum bridge clearance. Separate commercial-vehicle restrictions also apply north of 105.",
  },
};

const CROSS_BAY_NOTE =
  "MTA publishes six directional height limits (page updated Mar 9, 2026): " +
  "NB from 94th St 15′2″; NB from Beach Channel Dr traveling west 13′10″; " +
  "NB from Beach Channel Dr traveling east 14′1″; SB to 95th St 15′2″; " +
  "SB to Beach Channel Dr traveling west 15′2″; SB to Beach Channel Dr traveling east 14′0″. " +
  "Vehicles exceeding a posted approach limit require special arrangements. " +
  "https://www.mta.info/agency/bridges-and-tunnels/trucks-commercial-vehicle-information";

const CROSS_BAY_APPROACHES = [
  { label: "Northbound from 94th Street", heightInches: 182 },
  { label: "Northbound from Beach Channel Drive traveling west", heightInches: 166 },
  { label: "Northbound from Beach Channel Drive traveling east", heightInches: 169 },
  { label: "Southbound to 95th Street", heightInches: 182 },
  { label: "Southbound to Beach Channel Drive traveling west", heightInches: 182 },
  { label: "Southbound to Beach Channel Drive traveling east", heightInches: 168 },
];

/** Operator-posted facility heights. */
const FACILITY_HEIGHTS: Record<
  string,
  {
    inches: number;
    source: string;
    note: string;
    heightUpperInches?: number;
    heightLowerInches?: number;
    widthInches?: number;
    restrictionNote?: string;
    heightApproaches?: Array<{ label: string; heightInches: number }>;
  }
> = {
  brooklyn: {
    inches: 132,
    source: "operator-posted",
    note: "NYCDOT posted 11′0″ roadway clearance (trucks banned; 3 t posted load)",
  },
  "cross-bay": {
    inches: 166,
    heightLowerInches: 166,
    heightUpperInches: 182,
    widthInches: 114,
    source: "mta-posted",
    note: "MTA B&T published approach heights 13′10″–15′2″ (controlling 13′10″). Width 9′6″ bridges blanket.",
    restrictionNote: CROSS_BAY_NOTE,
    heightApproaches: CROSS_BAY_APPROACHES,
  },
};

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

async function load(name: string) {
  return JSON.parse(await readFile(path.join(PUBLIC, name), "utf8")) as FeatureCollection;
}

async function save(name: string, fc: FeatureCollection) {
  await writeFile(path.join(PUBLIC, name), `${JSON.stringify(fc)}\n`);
}

function upsertCrossBay(facilities: FeatureCollection, crossings: FeatureCollection) {
  const geom: Point = { type: "Point", coordinates: [-73.8197, 40.592] };
  const facilityProps = {
    id: "cross-bay",
    name: "Cross Bay Veterans Memorial Bridge",
    kind: "bridge",
    operator: "MTA",
    heightInches: 166,
    heightUpperInches: 182,
    heightLowerInches: 166,
    widthInches: 114,
    weightTons: null,
    postedLoadTons: null,
    trucksBanned: false,
    commercialBan: false,
    gcpTruckException: false,
    noTrucksLower: false,
    noHazmat: false,
    restrictionNote: CROSS_BAY_NOTE,
    geometryRole: "point",
    heightSource: "mta-posted",
    heightNote:
      "MTA B&T published approach heights 13′10″–15′2″ (controlling 13′10″). Width 9′6″ bridges blanket.",
    heightApproaches: CROSS_BAY_APPROACHES,
  };
  const crossingProps = {
    id: "cross-bay",
    name: "Cross Bay Veterans Memorial Bridge",
    kind: "bridge",
    operator: "MTA",
    heightIn: 166,
    heightUpperIn: 182,
    heightLowerIn: 166,
    widthIn: 114,
    restrictionNote: CROSS_BAY_NOTE,
    heightSource: "mta-posted",
    heightNote:
      "MTA B&T published approach heights 13′10″–15′2″ (controlling 13′10″). Width 9′6″ bridges blanket.",
  };

  const facFeat: Feature = { type: "Feature", geometry: geom, properties: facilityProps };
  const crossFeat: Feature = { type: "Feature", geometry: geom, properties: crossingProps };

  facilities.features = [
    ...facilities.features.filter(f => f.properties?.id !== "cross-bay"),
    facFeat,
  ].sort((a, b) => String(a.properties?.id).localeCompare(String(b.properties?.id)));

  crossings.features = [
    ...crossings.features.filter(f => f.properties?.id !== "cross-bay"),
    crossFeat,
  ].sort((a, b) => String(a.properties?.id).localeCompare(String(b.properties?.id)));
}

async function main() {
  const parkways = await load("parkways-nyc-li.geojson");
  const facilities = await load("facilities-nyc-li.geojson");
  const crossings = await load("major-crossings.geojson");

  upsertCrossBay(facilities, crossings);

  let parkwayHits = 0;
  for (const f of parkways.features) {
    const id = String(f.properties?.id || "");
    const row = PARKWAY_HEIGHTS[id];
    if (!row || !f.properties) continue;
    const existing =
      num(f.properties.passengerOnlyHeightInches) ?? num(f.properties.heightInches);
    const src = f.properties.heightSource;
    if (
      existing != null &&
      src !== "derived-min-clearance" &&
      src !== "nysdot-inventory-min" &&
      src !== "nj-admin-code"
    ) {
      continue;
    }
    f.properties.passengerOnlyHeightInches = row.inches;
    f.properties.heightInches = row.inches;
    f.properties.heightSource = row.source;
    f.properties.heightNote = row.note;
    delete f.properties.heightSampleCount;
    delete f.properties.heightMethod;
    if (id === "parkway-nj-garden-state-parkway") {
      const base = String(f.properties.restriction || "");
      if (!base.includes("13′6″") && !base.includes("13'6\"")) {
        f.properties.restriction =
          `${base} Legal vehicle height ceiling 13′6″ (N.J.A.C. 19:9-1.9).`.trim();
      }
    }
    parkwayHits += 1;
  }

  let facilityHits = 0;
  for (const f of facilities.features) {
    if (!f.properties) continue;
    const id = String(f.properties.id || "");

    const parkwayRow = PARKWAY_HEIGHTS[id];
    if (parkwayRow && String(f.properties.kind) === "parkway") {
      f.properties.passengerOnlyHeightInches = parkwayRow.inches;
      f.properties.heightInches = parkwayRow.inches;
      f.properties.heightSource = parkwayRow.source;
      f.properties.heightNote = parkwayRow.note;
      if (id === "parkway-nj-garden-state-parkway") {
        const base = String(f.properties.restrictionNote || "");
        if (!base.includes("13′6″") && !base.includes("13'6\"")) {
          f.properties.restrictionNote =
            `${base} Legal vehicle height ceiling 13′6″ (N.J.A.C. 19:9-1.9).`.trim();
        }
      }
      facilityHits += 1;
      continue;
    }

    const facilityRow = FACILITY_HEIGHTS[id];
    if (facilityRow) {
      f.properties.heightInches = facilityRow.inches;
      f.properties.heightSource = facilityRow.source;
      f.properties.heightNote = facilityRow.note;
      if (facilityRow.heightLowerInches != null) {
        f.properties.heightLowerInches = facilityRow.heightLowerInches;
      }
      if (facilityRow.heightUpperInches != null) {
        f.properties.heightUpperInches = facilityRow.heightUpperInches;
      }
      if (facilityRow.widthInches != null) {
        f.properties.widthInches = facilityRow.widthInches;
      }
      if (facilityRow.restrictionNote) {
        f.properties.restrictionNote = facilityRow.restrictionNote;
      }
      if (facilityRow.heightApproaches) {
        f.properties.heightApproaches = facilityRow.heightApproaches;
      }
      facilityHits += 1;
    }
  }

  let crossingHits = 0;
  for (const f of crossings.features) {
    if (!f.properties) continue;
    const id = String(f.properties.id || "");
    const facilityRow = FACILITY_HEIGHTS[id];
    if (!facilityRow) continue;
    f.properties.heightInches = facilityRow.inches;
    f.properties.heightIn = facilityRow.inches;
    f.properties.heightSource = facilityRow.source;
    f.properties.heightNote = facilityRow.note;
    if (facilityRow.heightLowerInches != null) {
      f.properties.heightLowerIn = facilityRow.heightLowerInches;
      f.properties.heightLowerInches = facilityRow.heightLowerInches;
    }
    if (facilityRow.heightUpperInches != null) {
      f.properties.heightUpperIn = facilityRow.heightUpperInches;
      f.properties.heightUpperInches = facilityRow.heightUpperInches;
    }
    if (facilityRow.widthInches != null) {
      f.properties.widthIn = facilityRow.widthInches;
      f.properties.widthInches = facilityRow.widthInches;
    }
    if (facilityRow.restrictionNote) {
      f.properties.restrictionNote = facilityRow.restrictionNote;
    }
    crossingHits += 1;
  }

  await save("parkways-nyc-li.geojson", parkways);
  await save("facilities-nyc-li.geojson", facilities);
  await save("major-crossings.geojson", crossings);

  console.log(`Parkways updated: ${parkwayHits}`);
  console.log(`Facilities updated: ${facilityHits}`);
  console.log(`Major crossings updated: ${crossingHits}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
