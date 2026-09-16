/**
 * Official low clearances from NJDOT's 2024 Truck Map & Brochure:
 * "TABLE OF STRUCTURES WITH MINIMUM CLEARANCES 13′6″ OR LESS OVER STATE AND
 * INTERSTATE HIGHWAYS" — https://nj.gotpermits.com (Superload Permits materials).
 *
 * Heights are published as decimal feet. Coordinates come from NJDOT's Bridges
 * FeatureServer matched on structure number / BRKEY — not invented.
 */
import type { Feature, Point } from "geojson";
import { COVERAGE } from "../../src/lib/path";
import type { ClearanceRecord } from "../../src/lib/types";

export const NJ_TRUCK_MAP_URL =
  "https://nj.gotpermits.com/njpass/Content/state/NJ/PublicMaterials/2024%20NJ%20Truck%20Map%20and%20Brochure.pdf";

export const NJ_BRIDGES_URL =
  "https://services2.arcgis.com/XVOqAjTOJ5P6ngMu/arcgis/rest/services/Bridges/FeatureServer/0";

export type NjTruckMapRow = {
  structureNumber: string;
  county: string;
  trunkline: string;
  milePoint: string;
  name: string;
  location: string;
  /** Decimal feet as printed in the brochure. */
  clearanceFeet: number;
  owner: string;
};

/** Curated from the 2024 brochure table (14 rows). */
export const NJ_TRUCK_MAP_2024: NjTruckMapRow[] = [
  {
    structureNumber: "206159",
    county: "BERGEN",
    trunkline: "NJ 4",
    milePoint: "4.31",
    name: "FOREST AVENUE (COUNTY ROUTE 59) OVER NJ 4",
    location: "1.0 MI EAST NJ 17",
    clearanceFeet: 13.5,
    owner: "State",
  },
  {
    structureNumber: "206168",
    county: "BERGEN",
    trunkline: "NJ 4",
    milePoint: "6.75",
    name: "GARRISON AVENUE OVER NJ 4",
    location: "3.4 MI EAST OF NJ 17",
    clearanceFeet: 13.5,
    owner: "State",
  },
  {
    structureNumber: "206182",
    county: "BERGEN",
    trunkline: "NJ 4",
    milePoint: "9.62",
    name: "JONES ROAD OVER NJ 4",
    location: "6.2 MI EAST OF NJ 17",
    clearanceFeet: 13.5,
    owner: "State",
  },
  {
    structureNumber: "267170",
    county: "BERGEN",
    trunkline: "US 202",
    milePoint: "81.15",
    name: "NJ TRANSIT MAIN LINE / US ROUTE 202",
    location: "AT NORTH END 202",
    clearanceFeet: 9.92,
    owner: "NJ Transit",
  },
  {
    structureNumber: "406156",
    county: "CAMDEN",
    trunkline: "US 30",
    milePoint: "2.49",
    name: "BAIRD BOULEVARD (CR 608) OVER US 30",
    location: "0.63 MI S OF 30-537 JCT",
    clearanceFeet: 13.5,
    owner: "State",
  },
  {
    structureNumber: "415151",
    county: "CAMDEN",
    trunkline: "NJ 73",
    milePoint: "15.93",
    name: "ATLANTIC CITY LINE OVER NJ 73",
    location: "0.2M S OF RTS 73-534 JCT",
    clearanceFeet: 13.5,
    owner: "NJ Transit",
  },
  {
    structureNumber: "419150",
    county: "CAMDEN",
    trunkline: "US 130",
    milePoint: "25.61",
    name: "VINELAND SECONDARY OVER US 130",
    location: "0.1 MI S OF JCT 130-47",
    clearanceFeet: 13.5,
    owner: "ConRail",
  },
  {
    structureNumber: "917159",
    county: "HUDSON",
    trunkline: "NJ 495",
    milePoint: "1.6",
    name: "NEW YORK AVENUE OVER NJ 495",
    location: "0.9 MI W OF LINCOLN TUN",
    clearanceFeet: 13.5,
    owner: "State",
  },
  {
    structureNumber: "1222153",
    county: "MIDDLESEX",
    trunkline: "NJ 35 NB",
    milePoint: "48.08",
    name: "PINE AVENUE (CR 688) OVER NJ 35 NB",
    location: "1.5 MI SO OF RT 9 JCT",
    clearanceFeet: 13.5,
    owner: "State",
  },
  {
    structureNumber: "1406150",
    county: "MORRIS",
    trunkline: "NJ 124",
    milePoint: "4.39",
    name: "MORRISTOWN LINE OVER NJ ROUTE 124",
    location: "AT RTS 24 - 623 JCT",
    clearanceFeet: 13,
    owner: "NJ Transit",
  },
  {
    structureNumber: "1411150",
    county: "MORRIS",
    trunkline: "NJ 53",
    milePoint: "4.13",
    name: "ABANDONED BOONTON LINE / NJ ROUTE 53",
    location: "0.5ML S OF RT 80",
    clearanceFeet: 13.5,
    owner: "NJ Transit",
  },
  {
    structureNumber: "1411151",
    county: "MORRIS",
    trunkline: "NJ 53",
    milePoint: "4.19",
    name: "BOONTON LINE OVER NJ ROUTE 53",
    location: "0.37 M S OF ROUTE 80",
    clearanceFeet: 13.25,
    owner: "NJ Transit",
  },
  {
    structureNumber: "1463162",
    county: "MORRIS",
    trunkline: "NJ 53",
    milePoint: "4.22",
    name: "BOONTON LINE OVER NJ ROUTE 53",
    location: "0.4 ML W OF RT 80 - 53",
    clearanceFeet: 13.25,
    owner: "NJ Transit",
  },
  {
    structureNumber: "2013151",
    county: "UNION",
    trunkline: "NJ 439",
    milePoint: "1.94",
    name: "ELIZABETH BRANCH OVER NJ 439",
    location: "0.1M S OF RTS 28-439 JCT",
    clearanceFeet: 12.33,
    owner: "ConRail",
  },
];

export type BridgeCoord = { brkey: string; lng: number; lat: number; facility?: string; featint?: string };

/** Decimal feet from the brochure → whole inches. */
export function decimalFeetToInches(feet: number): number | null {
  if (!Number.isFinite(feet) || feet <= 0 || feet > 20) return null;
  const inches = Math.round(feet * 12);
  return inches > 0 ? inches : null;
}

/** Normalize published structure numbers to BRKEY-style zero-padded ids. */
export function brkeyCandidates(structureNumber: string): string[] {
  const digits = structureNumber.replace(/\D/g, "");
  if (!digits) return [];
  const out = new Set<string>([digits, structureNumber.trim()]);
  if (digits.length < 7) out.add(digits.padStart(7, "0"));
  if (digits.length < 8) out.add(digits.padStart(8, "0"));
  return [...out];
}

export function normalizeNjTruckMap(
  rows: NjTruckMapRow[],
  coordsByStructure: Map<string, BridgeCoord>,
  retrievedAt: string,
): { features: Feature<Point, ClearanceRecord>[]; rejected: { id: string; reason: string }[] } {
  const features: Feature<Point, ClearanceRecord>[] = [];
  const rejected: { id: string; reason: string }[] = [];

  for (const row of rows) {
    const inches = decimalFeetToInches(row.clearanceFeet);
    if (inches == null) {
      rejected.push({ id: row.structureNumber, reason: `Bad clearanceFeet ${row.clearanceFeet}` });
      continue;
    }

    let coord: BridgeCoord | undefined;
    for (const key of brkeyCandidates(row.structureNumber)) {
      coord = coordsByStructure.get(key) || coordsByStructure.get(key.replace(/^0+/, "")) || undefined;
      if (coord) break;
    }
    if (!coord) {
      rejected.push({ id: row.structureNumber, reason: "No Bridges FeatureServer match for structure number" });
      continue;
    }
    const { lng, lat } = coord;
    if (
      lng < COVERAGE.minLng ||
      lng > COVERAGE.maxLng ||
      lat < COVERAGE.minLat ||
      lat > COVERAGE.maxLat
    ) {
      rejected.push({ id: row.structureNumber, reason: "Coordinate outside app coverage envelope" });
      continue;
    }

    const road = row.trunkline;
    const crossing = row.name;
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [lng, lat] },
      properties: {
        id: `njdot-truckmap-${row.structureNumber}-under`,
        structureId: row.structureNumber,
        postedClearanceInches: inches,
        road,
        crossing,
        appliesTo: "under",
        county: row.county,
        state: "NJ",
        location: `${row.name} — ${row.location} (MP ${row.milePoint})`,
        owner: row.owner,
        direction: null,
        clearanceType: "posted",
        notes: [
          "Published in NJDOT’s 2024 Truck Map & Brochure table of structures with clearances 13′6″ or less over state and interstate highways.",
          "Coordinates matched to NJDOT Bridges FeatureServer by structure number. Trust roadside signs.",
        ],
        sources: [
          {
            agency: "NJDOT",
            dataset: "2024 NJ Truck Map & Brochure — low clearance table",
            recordId: row.structureNumber,
            sourceUrl: NJ_TRUCK_MAP_URL,
            retrievedAt,
          },
        ],
        extras: {
          milePoint: row.milePoint,
          trunkline: row.trunkline,
          brkey: coord.brkey,
          clearanceFeetPublished: row.clearanceFeet,
        },
      },
    });
  }

  return { features, rejected };
}
