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
  state: "NY";
  location: string;
  owner: string;
  direction: string | null;
  clearanceType: "posted";
  sources: SourceReference[];
  notes: string[];
};

export type ClearanceCollection = FeatureCollection<Point, ClearanceRecord>;
