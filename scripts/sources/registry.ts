/**
 * Source registry for the awareness pipeline.
 *
 * Each entry is one agency feed. Adapters live beside this file; fetch writes
 * snapshots under data/raw/{id}/; normalize emits the canonical schema in
 * src/lib/awareness-schema.ts.
 *
 * Cadence: weekly is fine for posted clearances / corridors. Closures and
 * loading zones may stay more frequent later.
 */

export type SourceGeometry = "point" | "line" | "polygon" | "mixed";

export type SourceStatus = "active" | "planned" | "manual";

export type AwarenessSource = {
  id: string;
  agency: string;
  label: string;
  states: Array<"NY" | "CT" | "NJ">;
  geometry: SourceGeometry;
  /** What we primarily extract from this feed. */
  extracts: Array<
    "clearance" | "corridor" | "facility" | "crossing" | "posted_load" | "truck_route" | "closure" | "loading_zone"
  >;
  status: SourceStatus;
  /** Official query / landing URL when public. */
  url?: string;
  /** Adapter module under scripts/sources/ (no extension). */
  adapter?: string;
  notes: string;
};

export const AWARENESS_SOURCES: AwarenessSource[] = [
  {
    id: "nysdot-posted-height",
    agency: "NYSDOT",
    label: "Posted height bridges (NYC + LI counties)",
    states: ["NY"],
    geometry: "point",
    extracts: ["clearance"],
    status: "active",
    url: "https://gis.dot.ny.gov/hostingny/rest/services/CommVehicleDataFeed/MapServer/1",
    adapter: "nysdot-posted-height",
    notes: "BIN + posted under/on vertical clearances. Geometry often null; use LON/LAT fields.",
  },
  {
    id: "nyc-low-bridges",
    agency: "NYC DOT",
    label: "NYC low bridges KML",
    states: ["NY"],
    geometry: "point",
    extracts: ["clearance"],
    status: "active",
    adapter: "nyc-low-bridges",
    notes: "Supplemental NYC points; prefer NYSDOT when both exist for same BIN.",
  },
  {
    id: "ctdot-posted-height",
    agency: "CTDOT",
    label: "CTDOT bridges — Fairfield posted vertical",
    states: ["CT"],
    geometry: "point",
    extracts: ["clearance"],
    status: "active",
    url: "https://services1.arcgis.com/FCaUeJ5SOVtImake/arcgis/rest/services/CTDOT_Bridges/FeatureServer/0",
    adapter: "ctdot-posted-height",
    notes: "Polygon → centroid. Only records with posted vertical fields.",
  },
  {
    id: "ctdot-parkways",
    agency: "CTDOT / OSTA",
    label: "Connecticut parkways (commercial ban)",
    states: ["CT"],
    geometry: "line",
    extracts: ["corridor", "facility"],
    status: "active",
    adapter: "ctdot-parkways",
    notes: "Merritt / Wilbur Cross style passenger-only corridors.",
  },
  {
    id: "ctdot-posted-load",
    agency: "CTDOT",
    label: "CTDOT posted load bridges",
    states: ["CT"],
    geometry: "point",
    extracts: ["posted_load"],
    status: "active",
    adapter: "ctdot-posted-load",
    notes: "Weight pins unlocked when driver enters weight.",
  },
  {
    id: "njdot-roadway-corridors",
    agency: "NJDOT",
    label: "NJ roadway network — NYC-facing corridors",
    states: ["NJ"],
    geometry: "line",
    extracts: ["corridor", "facility"],
    status: "active",
    notes: "Phase 1: Palisades, GSP north of 105, Pulaski. Not a full commercial-ban statewide feed.",
  },
  {
    id: "panynj-crossings",
    agency: "PANYNJ",
    label: "Port Authority crossings (GWB, Lincoln, Holland, …)",
    states: ["NY", "NJ"],
    geometry: "mixed",
    extracts: ["facility", "crossing"],
    status: "manual",
    notes: "Curated from truckers guide; heights/widths change rarely — refresh when guide updates.",
  },
  {
    id: "nyc-truck-routes",
    agency: "NYC DOT",
    label: "NYC through / local truck routes",
    states: ["NY"],
    geometry: "line",
    extracts: ["truck_route"],
    status: "active",
    adapter: "nyc-truck-routes",
    notes: "Allowed paths, not bans.",
  },
  {
    id: "nyc-street-closures",
    agency: "NYC DOT",
    label: "NYC street closures",
    states: ["NY"],
    geometry: "line",
    extracts: ["closure"],
    status: "active",
    adapter: "nyc-street-closures",
    notes: "Higher refresh cadence than weekly may be useful later.",
  },
  {
    id: "nyc-loading-zones",
    agency: "NYC DOT",
    label: "NYC loading zones",
    states: ["NY"],
    geometry: "point",
    extracts: ["loading_zone"],
    status: "active",
    adapter: "nyc-loading-zones",
    notes: "Point/polygon zones depending on feed.",
  },
  {
    id: "nysdot-parkways",
    agency: "NYSDOT",
    label: "NY parkways (commercial ban corridors)",
    states: ["NY"],
    geometry: "line",
    extracts: ["corridor", "facility"],
    status: "active",
    url: "https://gis.dot.ny.gov/hostingny/rest/services/CommVehicleDataFeed/MapServer/2",
    adapter: "merge-hv-parkways",
    notes:
      "NYC/LI already in public GeoJSON. Hudson Valley adds Saw Mill, Sprain, Taconic, Cross County, Hutch Westchester, Bronx River Westchester, Lake Welch, Seven Lakes, Long Mountain; Palisades NY merges into the shared Palisades corridor. Rules from CommVehicleDataFeed; geometry from Roadway Inventory.",
  },
  {
    id: "nj-posted-clearances",
    agency: "NJDOT / NBI",
    label: "NJ posted vertical clearances (future)",
    states: ["NJ"],
    geometry: "point",
    extracts: ["clearance"],
    status: "planned",
    notes: "No clean statewide posted-clearance GIS yet. Do not invent from NBI design heights.",
  },
];

export function sourcesByStatus(status: SourceStatus) {
  return AWARENESS_SOURCES.filter(s => s.status === status);
}

export function sourceById(id: string) {
  return AWARENESS_SOURCES.find(s => s.id === id);
}
