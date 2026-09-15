import type { FeatureCollection, Point } from "geojson";

export type SourceReference = {
  agency: string;
  dataset: string;
  recordId: string;
  sourceUrl: string;
  retrievedAt: string;
  datasetUpdatedAt?: string;
};

export type ClearanceRecord = {
  id: string;
  structureId: string;
  postedClearanceInches: number;
  road: string;
  crossing: string;
  appliesTo: "under" | "on";
  county: string;
  state: "NY" | "CT";
  location: string;
  owner: string;
  direction: string | null;
  clearanceType: "posted";
  sources: SourceReference[];
  notes: string[];
  /** Agency leftovers that must not replace posted height. */
  extras?: Record<string, string | number | boolean | null>;
};

export type ClearanceCollection = FeatureCollection<Point, ClearanceRecord>;
