/**
 * Apply researched corridor / facility heights where state GIS omitted them.
 * Sources documented in docs/researched-heights.md — never invent values.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FeatureCollection } from "geojson";

const PUBLIC = path.join(process.cwd(), "public", "data");

/** Corridor mins from NYSDOT inventory structures over the parkway. */
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
};

/** Operator-posted facility heights. */
const FACILITY_HEIGHTS: Record<
  string,
  { inches: number; source: string; note: string }
> = {
  brooklyn: {
    inches: 132,
    source: "operator-posted",
    note: "NYCDOT posted 11′0″ roadway clearance (trucks banned; 3 t posted load)",
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

async function main() {
  const parkways = await load("parkways-nyc-li.geojson");
  const facilities = await load("facilities-nyc-li.geojson");
  const crossings = await load("major-crossings.geojson");

  let parkwayHits = 0;
  for (const f of parkways.features) {
    const id = String(f.properties?.id || "");
    const row = PARKWAY_HEIGHTS[id];
    if (!row || !f.properties) continue;
    const existing =
      num(f.properties.passengerOnlyHeightInches) ?? num(f.properties.heightInches);
    const src = f.properties.heightSource;
    // Keep official LI (94″) / CT (96″) regulatory heights; replace gaps + prior derived.
    if (
      existing != null &&
      src !== "derived-min-clearance" &&
      src !== "nysdot-inventory-min"
    ) {
      continue;
    }
    f.properties.passengerOnlyHeightInches = row.inches;
    f.properties.heightInches = row.inches;
    f.properties.heightSource = row.source;
    f.properties.heightNote = row.note;
    delete f.properties.heightSampleCount;
    delete f.properties.heightMethod;
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
      facilityHits += 1;
      continue;
    }

    const facilityRow = FACILITY_HEIGHTS[id];
    if (facilityRow) {
      f.properties.heightInches = facilityRow.inches;
      f.properties.heightSource = facilityRow.source;
      f.properties.heightNote = facilityRow.note;
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
    f.properties.heightSource = facilityRow.source;
    f.properties.heightNote = facilityRow.note;
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
