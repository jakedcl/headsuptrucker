"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ClearanceCollection } from "@/lib/types";
import { describeMargin, formatHeight, getClearanceSeverity, isInventoryLabel, parseHeightParam, recordLabels } from "@/lib/clearance";
import { featuresAlongRoute, formatDriveMiles, formatDriveMinutes, type DrivePath, type DriveRoute, type Place } from "@/lib/path";
import { DriveForm } from "./drive-form";
import { HeightForm } from "./height-form";
import type { Viewport, AwarenessLayers } from "./clearance-map";
import {
  EMPTY_VEHICLE_PROFILE,
  formatTons,
  formatWidth,
  loadConflict,
  parseWeightParam,
  parseWidthParam,
  widthConflict,
  type VehicleProfile,
} from "@/lib/vehicle-profile";
import { annotateFacilities, evaluateFacilityProps } from "@/lib/facilities";
import {
  clearancesFromPoints,
  facilitiesFromAwareness,
  majorCrossingsFromPoints,
  parkwaysFromLines,
  postedLoadFromPoints,
} from "@/lib/awareness-project";
import type { AwarenessLineCollection, AwarenessPointCollection } from "@/lib/awareness-schema";

const Map = dynamic(() => import("./clearance-map").then(m => m.ClearanceMap), {
  ssr: false,
  loading: () => <div className="map-message">Loading interactive map…</div>,
});

const AWARENESS_OFF: AwarenessLayers = {
  truckRoutes: false,
  streetClosures: false,
  loadingZones: false,
  roadFeatures: false,
  parkways: false,
  postedLoad: false,
  crossingLimits: false,
  majorCrossings: false,
  facilities: true,
};

function updateUrl(values: Record<string, string | null>) {
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(values)) {
    if (value === null) url.searchParams.delete(key);
    else url.searchParams.set(key, value);
  }
  window.history.replaceState(null, "", url);
}


async function copyLink(href: string, onMessage: (message: string) => void) {
  try {
    await navigator.clipboard.writeText(href);
    onMessage("Link copied");
  } catch {
    onMessage("Copy the link from your browser’s address bar.");
  }
}

function buildShareUrl(values: Record<string, string | null>) {
  const url = new URL(window.location.origin + window.location.pathname);
  for (const [key, value] of Object.entries(values)) {
    if (value !== null && value !== "") url.searchParams.set(key, value);
  }
  return url.toString();
}

function scoreRoute(features: ReturnType<typeof featuresAlongRoute>, vehicleHeight: number) {
  let danger = 0;
  let caution = 0;
  let lowest: number | null = null;
  for (const feature of features) {
    const inches = feature.properties.postedClearanceInches;
    const severity = getClearanceSeverity(inches, vehicleHeight);
    if (severity === "danger") danger += 1;
    else if (severity === "caution") caution += 1;
    if (lowest === null || inches < lowest) lowest = inches;
  }
  return { danger, caution, lowest, count: features.length };
}

function viewportNumber(value: string | null, fallback: number, min: number, max: number) {
  if (!value?.trim()) return fallback;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : fallback;
}

function asLabel(value: Place | string) {
  return typeof value === "string" ? value : value.label;
}

export function MapExplorer() {
  const params = useSearchParams();
  const router = useRouter();
  const height = parseHeightParam(params.get("height"));
  const selectedId = params.get("bridge");
  const [data, setData] = useState<ClearanceCollection | null>(null);
  const [fetchError, setFetchError] = useState("");
  const [retry, setRetry] = useState(0);
  const [editing, setEditing] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [awareness, setAwareness] = useState<AwarenessLayers>(AWARENESS_OFF);
  const [truckRoutesData, setTruckRoutesData] = useState<import("geojson").FeatureCollection | null>(null);
  const [streetClosuresData, setStreetClosuresData] = useState<import("geojson").FeatureCollection | null>(null);
  const [loadingZonesData, setLoadingZonesData] = useState<import("geojson").FeatureCollection | null>(null);
  const [roadFeaturesData, setRoadFeaturesData] = useState<import("geojson").FeatureCollection | null>(null);
  const [roadLabelsData, setRoadLabelsData] = useState<import("geojson").FeatureCollection | null>(null);
  const [parkwaysData, setParkwaysData] = useState<import("geojson").FeatureCollection | null>(null);
  const [postedLoadRaw, setPostedLoadRaw] = useState<import("geojson").FeatureCollection | null>(null);
  const [crossingLimitsRaw, setCrossingLimitsRaw] = useState<import("geojson").FeatureCollection | null>(null);
  const [majorCrossingsData, setMajorCrossingsData] = useState<import("geojson").FeatureCollection | null>(null);
  const [facilitiesRaw, setFacilitiesRaw] = useState<import("geojson").FeatureCollection | null>(null);
  const [selectedFacilityId, setSelectedFacilityId] = useState<string | null>(params.get("facility"));
  const [widthDraft, setWidthDraft] = useState(() => params.get("width") || "");
  const [weightDraft, setWeightDraft] = useState(() => params.get("weight") || "");
  const [vehicle, setVehicle] = useState<VehicleProfile>(() => ({
    ...EMPTY_VEHICLE_PROFILE,
    widthInches: parseWidthParam(params.get("width")),
    weightTons: parseWeightParam(params.get("weight")),
    commercial: params.get("commercial") === "1",
  }));
  const [awarenessError, setAwarenessError] = useState("");
  const [awarenessLoading, setAwarenessLoading] = useState(false);
  const [bounds, setBounds] = useState<[number, number, number, number] | null>(null);
  const [listLimit, setListLimit] = useState(30);
  const [shareMessage, setShareMessage] = useState("");
  const [drive, setDrive] = useState<DrivePath | null>(null);
  const [driveLoading, setDriveLoading] = useState(false);
  const [driveError, setDriveError] = useState("");
  const [driveRetry, setDriveRetry] = useState(0);
  const [mapEpoch, setMapEpoch] = useState(0);
  const pendingPlaces = useRef<{ from: Place | string; to: Place | string } | null>(null);
  const fromParam = params.get("from") || "";
  const toParam = params.get("to") || "";
  const routeParam = Number(params.get("route") || "0");
  const initialViewport: Viewport = {
    lng: viewportNumber(params.get("lng"), -73.63, -180, 180),
    lat: viewportNumber(params.get("lat"), 40.74, -80, 80),
    z: viewportNumber(params.get("z"), 10, 6, 18),
  };

  useEffect(() => {
    const controller = new AbortController();
    setFetchError("");
    setAwarenessError("");
    Promise.all([
      fetch("/data/awareness-points.geojson", { signal: controller.signal }),
      fetch("/data/awareness-lines.geojson", { signal: controller.signal }),
    ])
      .then(async ([pointsRes, linesRes]) => {
        if (!pointsRes.ok || !linesRes.ok) {
          throw new Error("The awareness dataset couldn’t be loaded.");
        }
        const points = (await pointsRes.json()) as AwarenessPointCollection;
        const lines = (await linesRes.json()) as AwarenessLineCollection;
        if (points.type !== "FeatureCollection" || !Array.isArray(points.features) || points.features.length === 0) {
          throw new Error("The awareness dataset is unavailable.");
        }
        const clearances = clearancesFromPoints(points);
        if (clearances.features.length === 0) {
          throw new Error("No clearance records in the awareness dataset.");
        }
        setData(clearances);
        setParkwaysData(parkwaysFromLines(lines));
        setPostedLoadRaw(postedLoadFromPoints(points));
        setMajorCrossingsData(majorCrossingsFromPoints(points));
        setFacilitiesRaw(facilitiesFromAwareness(points, lines));
      })
      .catch(error => {
        if (error.name !== "AbortError") setFetchError(error.message);
      });
    return () => controller.abort();
  }, [retry]);

  useEffect(() => {
    const needRoutes = awareness.truckRoutes;
    if (!needRoutes || truckRoutesData) return;
    const controller = new AbortController();
    setAwarenessError("");
    setAwarenessLoading(true);
    fetch("/data/truck-routes-nyc.geojson", { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("Truck routes couldn’t load.");
        setTruckRoutesData(await response.json());
      })
      .catch(error => {
        if (error.name !== "AbortError") setAwarenessError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setAwarenessLoading(false);
      });
    return () => controller.abort();
  }, [awareness.truckRoutes, truckRoutesData]);

  useEffect(() => {
    if (!awareness.streetClosures || streetClosuresData) return;
    const controller = new AbortController();
    setAwarenessError("");
    setAwarenessLoading(true);
    fetch("/data/street-closures-nyc.geojson", { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("Street closures couldn’t load.");
        setStreetClosuresData(await response.json());
      })
      .catch(error => {
        if (error.name !== "AbortError") setAwarenessError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setAwarenessLoading(false);
      });
    return () => controller.abort();
  }, [awareness.streetClosures, streetClosuresData]);

  useEffect(() => {
    if (!awareness.loadingZones || loadingZonesData) return;
    const controller = new AbortController();
    setAwarenessError("");
    setAwarenessLoading(true);
    fetch("/data/loading-zones-nyc.geojson", { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("Loading zones couldn’t load.");
        setLoadingZonesData(await response.json());
      })
      .catch(error => {
        if (error.name !== "AbortError") setAwarenessError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setAwarenessLoading(false);
      });
    return () => controller.abort();
  }, [awareness.loadingZones, loadingZonesData]);

  useEffect(() => {
    const jobs: Array<{
      need: boolean;
      have: boolean;
      url: string;
      label: string;
      set: (fc: import("geojson").FeatureCollection) => void;
    }> = [
      { need: awareness.roadFeatures, have: Boolean(roadFeaturesData), url: "/data/road-features-nyc.geojson", label: "Road features", set: setRoadFeaturesData },
      { need: awareness.roadFeatures, have: Boolean(roadLabelsData), url: "/data/road-labels-nyc.geojson", label: "Road labels", set: setRoadLabelsData },
      { need: awareness.crossingLimits || vehicle.widthInches !== null, have: Boolean(crossingLimitsRaw), url: "/data/crossing-limits-nyc.geojson", label: "Crossing limits", set: setCrossingLimitsRaw },
    ];
    const pending = jobs.filter(j => j.need && !j.have);
    if (pending.length === 0) return;
    const controller = new AbortController();
    setAwarenessError("");
    setAwarenessLoading(true);
    Promise.all(
      pending.map(async job => {
        const response = await fetch(job.url, { signal: controller.signal });
        if (!response.ok) throw new Error(`${job.label} couldn’t load.`);
        job.set(await response.json());
      }),
    )
      .catch(error => {
        if (error.name !== "AbortError") setAwarenessError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setAwarenessLoading(false);
      });
    return () => controller.abort();
  }, [
    awareness.roadFeatures,
    awareness.crossingLimits,
    vehicle.widthInches,
    roadFeaturesData,
    roadLabelsData,
    crossingLimitsRaw,
  ]);


  const facilitiesData = useMemo(() => {
    if (!facilitiesRaw || height == null) return null;
    return annotateFacilities(facilitiesRaw, {
      heightInches: height,
      widthInches: vehicle.widthInches,
      weightTons: vehicle.weightTons,
      commercial: vehicle.commercial,
    });
  }, [facilitiesRaw, height, vehicle.widthInches, vehicle.weightTons, vehicle.commercial]);

  const selectedFacility = useMemo(() => {
    if (!selectedFacilityId || !facilitiesRaw) return null;
    return facilitiesRaw.features.find(f => f.properties?.id === selectedFacilityId) || null;
  }, [selectedFacilityId, facilitiesRaw]);

  const selectedFacilityEval = useMemo(() => {
    if (!selectedFacility || height == null) return null;
    return evaluateFacilityProps((selectedFacility.properties || {}) as Record<string, unknown>, {
      heightInches: height,
      widthInches: vehicle.widthInches,
      weightTons: vehicle.weightTons,
      commercial: vehicle.commercial,
    });
  }, [selectedFacility, height, vehicle]);

  const postedLoadData = useMemo(() => {
    if (!postedLoadRaw) return null;
    return {
      type: "FeatureCollection" as const,
      features: postedLoadRaw.features.map(f => ({
        ...f,
        properties: {
          ...f.properties,
          conflict: loadConflict(Number(f.properties?.postedLoadTons) || 0, vehicle.weightTons),
        },
      })),
    };
  }, [postedLoadRaw, vehicle.weightTons]);

  const crossingLimitsData = useMemo(() => {
    if (!crossingLimitsRaw) return null;
    return {
      type: "FeatureCollection" as const,
      features: crossingLimitsRaw.features.map(f => ({
        ...f,
        properties: {
          ...f.properties,
          conflict: widthConflict(
            typeof f.properties?.widthInches === "number" ? f.properties.widthInches : null,
            vehicle.widthInches,
          ),
        },
      })),
    };
  }, [crossingLimitsRaw, vehicle.widthInches]);

  const activeAwareness: AwarenessLayers = {
    ...awareness,
    facilities: true,
    // Same unlock behavior for NY + CT (shared GeoJSON): commercial → parkways, weight → posted load.
    parkways: awareness.parkways || vehicle.commercial,
    postedLoad: awareness.postedLoad || vehicle.weightTons !== null,
  };
  useEffect(() => {
    if (!fromParam.trim() || !toParam.trim()) {
      setDrive(null);
      setDriveError("");
      setDriveLoading(false);
      pendingPlaces.current = null;
      return;
    }
    const controller = new AbortController();
    const pending = pendingPlaces.current;
    const body = pending && asLabel(pending.from) === fromParam && asLabel(pending.to) === toParam
      ? { from: pending.from, to: pending.to }
      : { from: fromParam, to: toParam };
    pendingPlaces.current = null;
    setDriveLoading(true);
    setDriveError("");
    fetch("/api/drive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    }).then(async response => {
      const json = await response.json() as DrivePath & { error?: string; routes?: DriveRoute[] };
      if (!response.ok) throw new Error(json.error || "Couldn’t check that path.");
      const routes = Array.isArray(json.routes) && json.routes.length
        ? json.routes.filter(route => Array.isArray(route.coordinates) && route.coordinates.length >= 2)
        : (Array.isArray(json.coordinates) && json.coordinates.length >= 2
          ? [{ coordinates: json.coordinates, distanceMeters: json.distanceMeters || 0, durationSeconds: 0 }]
          : []);
      if (!routes.length) throw new Error("Couldn’t trace a driving path between those places.");
      setDrive({
        from: json.from,
        to: json.to,
        routes,
        coordinates: routes[0].coordinates,
        distanceMeters: routes[0].distanceMeters,
      });
    }).catch(error => {
      if (error.name !== "AbortError") {
        setDrive(null);
        setDriveError(error.message);
      }
    }).finally(() => {
      if (!controller.signal.aborted) setDriveLoading(false);
    });
    return () => controller.abort();
  }, [fromParam, toParam, driveRetry]);
  useEffect(() => {
    if (!drive?.routes?.length) return;
    const max = drive.routes.length - 1;
    const index = Number.isFinite(routeParam) ? Math.trunc(routeParam) : 0;
    if (index < 0 || index > max) updateUrl({ route: null });
    else if (index === 0 && params.get("route")) updateUrl({ route: null });
  }, [drive, routeParam, params]);


  const onSelect = useCallback((id: string) => {
    setSelectedFacilityId(null);
    updateUrl({ bridge: id, facility: null });
  }, []);
  const onFacilitySelect = useCallback((id: string) => {
    setSelectedFacilityId(id);
    updateUrl({ facility: id, bridge: null });
  }, []);
  const commitWidthDraft = useCallback(() => {
    const trimmed = widthDraft.trim();
    if (!trimmed) {
      setVehicle(v => ({ ...v, widthInches: null }));
      setWidthDraft("");
      updateUrl({ width: null });
      return;
    }
    const parsed = parseWidthParam(trimmed);
    if (parsed === null) {
      setWidthDraft(vehicle.widthInches == null ? "" : String(vehicle.widthInches));
      return;
    }
    setVehicle(v => ({ ...v, widthInches: parsed }));
    setWidthDraft(String(parsed));
    updateUrl({ width: String(parsed) });
  }, [widthDraft, vehicle.widthInches]);
  const commitWeightDraft = useCallback(() => {
    const trimmed = weightDraft.trim();
    if (!trimmed) {
      setVehicle(v => ({ ...v, weightTons: null }));
      setWeightDraft("");
      updateUrl({ weight: null });
      return;
    }
    const parsed = parseWeightParam(trimmed);
    if (parsed === null) {
      setWeightDraft(vehicle.weightTons == null ? "" : String(vehicle.weightTons));
      return;
    }
    setVehicle(v => ({ ...v, weightTons: parsed }));
    setWeightDraft(String(parsed));
    updateUrl({ weight: String(parsed) });
  }, [weightDraft, vehicle.weightTons]);

  const onViewport = useCallback((viewport: Viewport, nextBounds: [number, number, number, number]) => {
    setBounds(nextBounds);
    updateUrl({ lng: viewport.lng.toFixed(5), lat: viewport.lat.toFixed(5), z: viewport.z.toFixed(2) });
  }, []);

  const routeOptions = drive?.routes?.length ? drive.routes : (drive ? [{ coordinates: drive.coordinates, distanceMeters: drive.distanceMeters, durationSeconds: 0 }] : []);
  const selectedRouteIndex = Math.min(Math.max(0, Number.isFinite(routeParam) ? Math.trunc(routeParam) : 0), Math.max(routeOptions.length - 1, 0));
  const activeDrive = useMemo(() => {
    if (!drive || !routeOptions.length) return null;
    const selected = routeOptions[selectedRouteIndex] || routeOptions[0];
    return {
      ...drive,
      coordinates: selected.coordinates,
      distanceMeters: selected.distanceMeters,
      routes: routeOptions,
    } satisfies DrivePath;
  }, [drive, routeOptions, selectedRouteIndex]);
  const alongPath = useMemo(
    () => (activeDrive && data ? featuresAlongRoute(data.features, activeDrive.coordinates) : null),
    [activeDrive, data],
  );
  const routeScores = useMemo(() => {
    if (!data || routeOptions.length < 2) return [];
    return routeOptions.map(route => scoreRoute(featuresAlongRoute(data.features, route.coordinates), height ?? 0));
  }, [data, routeOptions, height]);
  const altRoutes = useMemo(
    () => routeOptions.length > 1
      ? routeOptions.filter((_, index) => index !== selectedRouteIndex).map(route => route.coordinates)
      : [],
    [routeOptions, selectedRouteIndex],
  );
  const mapCollection = useMemo(
    () => (data ? { ...data, features: alongPath || data.features } : null),
    [data, alongPath],
  );

  if (height === null) {
    return <main className="height-required">
      <p className="eyebrow">FIRST, YOUR VEHICLE</p>
      <h1>How tall are you?</h1>
      {params.has("height") && <p role="alert">That link doesn’t contain a valid vehicle height. Enter yours below.</p>}
      <HeightForm onSubmit={h => updateUrl({ height: String(h) })} />
    </main>;
  }

  const scoped = alongPath || data?.features || [];
  const visible = scoped.filter(f => {
    const [lng, lat] = f.geometry.coordinates;
    return (showAll || f.properties.postedClearanceInches <= height + 12)
      && (alongPath || !bounds || (lng >= bounds[0] && lat >= bounds[1] && lng <= bounds[2] && lat <= bounds[3]));
  });
  if (!alongPath) {
    visible.sort((a, b) =>
      a.properties.postedClearanceInches - b.properties.postedClearanceInches
      || a.properties.id.localeCompare(b.properties.id));
  }

  const selected = data?.features.find(f => f.properties.id === selectedId)?.properties;
  const selectedLabels = selected ? recordLabels(selected) : null;
  const selectedSeverity = selected ? getClearanceSeverity(selected.postedClearanceInches, height) : null;
  const showPostingNote = selectedSeverity === "danger" || selectedSeverity === "caution";
  const updated = data?.features[0]?.properties.sources[0].datasetUpdatedAt;

  return <main className="explorer">
    <aside className="explorer-sidebar" aria-label="Vehicle controls and clearance list">
      <div className="vehicle-panel">
        <div className="panel-heading">
          <span className="eyebrow">YOUR VEHICLE HEIGHT</span>
          <button className="text-button" onClick={() => setEditing(!editing)}>{editing ? "Cancel" : "Edit"}</button>
        </div>
        {editing
          ? <div className="vehicle-profile">
              <HeightForm key={height} initialHeight={height} compact onSubmit={h => { updateUrl({ height: String(h) }); setEditing(false); }} />
              <div className="vehicle-dims">
                <label>
                  <span>Width (in) · optional</span>
                  <input
                    inputMode="numeric"
                    type="text"
                    placeholder="e.g. 96"
                    value={widthDraft}
                    onChange={e => setWidthDraft(e.target.value)}
                    onBlur={commitWidthDraft}
                    onKeyDown={e => {
                      if (e.key === "Enter") e.currentTarget.blur();
                    }}
                  />
                </label>
                <label>
                  <span>Weight (tons) · optional</span>
                  <input
                    inputMode="decimal"
                    type="text"
                    placeholder="e.g. 10"
                    value={weightDraft}
                    onChange={e => setWeightDraft(e.target.value)}
                    onBlur={commitWeightDraft}
                    onKeyDown={e => {
                      if (e.key === "Enter") e.currentTarget.blur();
                    }}
                  />
                </label>
              </div>
            </div>
          : <div className="vehicle-profile">
              <button
                type="button"
                className="vehicle-number vehicle-number-reset"
                title="Reset map to the default view"
                aria-label="Reset map to the default view"
                onClick={() => {
                  setEditing(false);
                  setShowAll(false);
                  setAwareness(AWARENESS_OFF);
                  setBounds(null);
                  setListLimit(30);
                  setShareMessage("");
                  setDrive(null);
                  setDriveError("");
                  setDriveLoading(false);
                  pendingPlaces.current = null;
                  setMapEpoch(n => n + 1);
                  router.replace(`/?height=${height}`);
                }}
              >{formatHeight(height)}<span>↕</span></button>
              <div className="vehicle-dims">
                <label>
                  <span>Width (in) · optional</span>
                  <input
                    inputMode="numeric"
                    type="text"
                    placeholder="e.g. 96"
                    value={widthDraft}
                    onChange={e => setWidthDraft(e.target.value)}
                    onBlur={commitWidthDraft}
                    onKeyDown={e => {
                      if (e.key === "Enter") e.currentTarget.blur();
                    }}
                  />
                </label>
                <label>
                  <span>Weight (tons) · optional</span>
                  <input
                    inputMode="decimal"
                    type="text"
                    placeholder="e.g. 10"
                    value={weightDraft}
                    onChange={e => setWeightDraft(e.target.value)}
                    onBlur={commitWeightDraft}
                    onKeyDown={e => {
                      if (e.key === "Enter") e.currentTarget.blur();
                    }}
                  />
                </label>
              </div>
            </div>}
        <label className="all-toggle">
          <input
            type="checkbox"
            checked={vehicle.commercial}
            onChange={e => {
              const commercial = e.target.checked;
              setVehicle(v => ({ ...v, commercial }));
              updateUrl({ commercial: commercial ? "1" : null });
            }}
          />
          Commercial / truck plates
        </label>
        <DriveForm
          key={`${fromParam}|${toParam}`}
          initialFrom={fromParam}
          initialTo={toParam}
          loading={driveLoading}
          error={driveError}
          active={Boolean(drive)}
          onSubmit={(from, to) => {
            setListLimit(30);
            pendingPlaces.current = { from, to };
            const fromText = asLabel(from);
            const toText = asLabel(to);
            if (fromText === fromParam && toText === toParam) setDriveRetry(n => n + 1);
            updateUrl({ from: fromText, to: toText, bridge: null, route: null });
          }}
          onClear={() => {
            setDrive(null);
            setDriveError("");
            pendingPlaces.current = null;
            updateUrl({ from: null, to: null, bridge: null, route: null });
          }}
        />
        <div className="map-legend-panel" role="group" aria-label="Legend">
          <span className="eyebrow">LEGEND</span>
          <ul className="facility-legend">
            <li><span className="swatch ok" aria-hidden />OK</li>
            <li><span className="swatch caution" aria-hidden />Caution</li>
            <li><span className="swatch danger" aria-hidden />Do not go</li>
            <li><span className="swatch unknown" aria-hidden />Unknown</li>
          </ul>
          <span className="eyebrow legend-subhead">MORE LAYERS</span>
          <label className="all-toggle">
            <input
              type="checkbox"
              checked={awareness.truckRoutes}
              onChange={e => setAwareness(a => ({ ...a, truckRoutes: e.target.checked }))}
            />
            Truck routes
          </label>
          <label className="all-toggle">
            <input
              type="checkbox"
              checked={awareness.streetClosures}
              onChange={e => setAwareness(a => ({ ...a, streetClosures: e.target.checked }))}
            />
            Construction closures
          </label>
          <label className="all-toggle">
            <input
              type="checkbox"
              checked={awareness.loadingZones}
              onChange={e => setAwareness(a => ({ ...a, loadingZones: e.target.checked }))}
            />
            Loading zones
          </label>
          <fieldset className="legend-radios">
            <legend className="sr-only">Clearance filter</legend>
            <label className="all-toggle">
              <input type="radio" name="clearance-filter" checked={showAll} onChange={() => setShowAll(true)} />
              Show all
            </label>
            <label className="all-toggle">
              <input type="radio" name="clearance-filter" checked={!showAll} onChange={() => setShowAll(false)} />
              Show concerns
            </label>
          </fieldset>
          {awarenessLoading && <p className="awareness-note" role="status">Loading map layers…</p>}
          {awarenessError && <p className="awareness-error" role="status">{awarenessError}</p>}
        </div>
        {routeOptions.length > 1 && activeDrive && (
          <div className="route-compare" role="group" aria-label="Compare driving paths">
            <div className="panel-heading">
              <span className="eyebrow">PATH OPTIONS</span>
              <button
                className="text-button"
                type="button"
                onClick={() => copyLink(buildShareUrl({
                  height: String(height),
                  from: fromParam,
                  to: toParam,
                  route: selectedRouteIndex === 0 ? null : String(selectedRouteIndex),
                }), setShareMessage)}
              >Share path</button>
            </div>
            <p className="route-compare-note">OSRM found more than one path. Pick one to inspect posted lows nearby — only shown when the lines actually differ.</p>
            <div className="route-options">
              {routeOptions.map((route, index) => {
                const score = routeScores[index];
                const selected = index === selectedRouteIndex;
                return <button
                  key={`route-${index}`}
                  type="button"
                  className={`route-option ${selected ? "selected" : ""}`}
                  aria-pressed={selected}
                  onClick={() => updateUrl({ route: index === 0 ? null : String(index), bridge: null })}
                >
                  <strong>Path {index + 1}</strong>
                  <span>{formatDriveMiles(route.distanceMeters)} · {formatDriveMinutes(route.durationSeconds)}</span>
                  <span>
                    {score ? (
                      score.danger > 0
                        ? `${score.danger} at/below`
                        : score.caution > 0
                          ? `${score.caution} within 12″`
                          : "No red/orange nearby"
                    ) : "—"}
                    {score?.lowest != null ? ` · lowest ${formatHeight(score.lowest)}` : ""}
                  </span>
                </button>;
              })}
            </div>
          </div>
        )}
        {routeOptions.length === 1 && activeDrive && (
          <div className="route-share-row">
            <button
              className="text-button"
              type="button"
              onClick={() => copyLink(buildShareUrl({
                height: String(height),
                from: fromParam,
                to: toParam,
              }), setShareMessage)}
            >Share this path</button>
          </div>
        )}
      </div>
      <div className="list-heading">
        <h1>{activeDrive ? "On this path" : "In this map view"}</h1>
        <span>{visible.length} records</span>
      </div>
      <div className="clearance-list">
        {fetchError ? (
          <div className="list-message" role="alert">
            <p>{fetchError}</p>
            <button className="secondary" onClick={() => setRetry(n => n + 1)}>Try again</button>
          </div>
        ) : !data ? (
          <p className="list-message" role="status">Loading official clearance records…</p>
        ) : driveLoading ? (
          <p className="list-message" role="status">Finding posted clearances near this path…</p>
        ) : !visible.length ? (
          <p className="list-message">
            {activeDrive
              ? "No matching posted clearances near this path. Missing markers do not mean the road is clear."
              : "No matching posted clearances in this view. Pan or zoom to explore. A missing marker does not mean a road is clear."}
          </p>
        ) : (
          <>
            <ul>
              {visible.slice(0, listLimit).map(f => {
                const p = f.properties;
                const severity = getClearanceSeverity(p.postedClearanceInches, height);
                const labels = recordLabels(p);
                return <li key={p.id}>
                  <button className={`clearance-row ${selectedId === p.id ? "selected" : ""}`} onClick={() => onSelect(p.id)}>
                    <span className={`height-badge ${severity}`}>{formatHeight(p.postedClearanceInches)}</span>
                    <span className="row-road"><strong>{labels.title}</strong><span>{labels.subtitle}</span></span>
                    <span className="row-arrow" aria-hidden="true">↗</span>
                    <span className="sr-only">{describeMargin(p.postedClearanceInches, height)}</span>
                  </button>
                </li>;
              })}
            </ul>
            {visible.length > listLimit && (
              <button className="load-more" onClick={() => setListLimit(n => n + 30)}>Show more records</button>
            )}
          </>
        )}
      </div>
      <div className="sidebar-foot">
        <span>
          NYSDOT layer updated{" "}
          {updated
            ? new Date(updated).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
            : "date unavailable"}
        </span>
        <Link href="/methodology">Sources & coverage ↗</Link>
      </div>
    </aside>
    <section className="map-area" aria-label="Clearance map">
      {shareMessage && <div className="share-status" role="status">{shareMessage}</div>}
      {mapCollection && (
        <Map
          key={mapEpoch}
          data={mapCollection}
          height={height}
          showAll={showAll}
          awareness={activeAwareness}
          truckRoutesData={truckRoutesData}
          streetClosuresData={streetClosuresData}
          loadingZonesData={loadingZonesData}
          roadFeaturesData={roadFeaturesData}
          roadLabelsData={roadLabelsData}
          parkwaysData={parkwaysData}
          postedLoadData={postedLoadData}
          crossingLimitsData={crossingLimitsData}
          majorCrossingsData={majorCrossingsData}
          facilitiesData={facilitiesData}
          selectedId={selectedId}
          drive={activeDrive}
          altRoutes={altRoutes}
          initialViewport={initialViewport}
          onSelect={onSelect}
          onFacilitySelect={onFacilitySelect}
          onViewport={onViewport}
          onShare={() => copyLink(window.location.href, setShareMessage)}
        />
      )}
      {!data && <div className="map-message">{fetchError ? "Map data unavailable. Retry from the clearance list." : "Preparing your map…"}</div>}
      <div className="map-footnote">
        {activeDrive
          ? "Posted records near this path. Check signs. Missing markers do not guarantee clearance."
          : "Check posted signs. Missing markers do not guarantee clearance."}
      </div>
      {selectedFacility && selectedFacilityEval && (
        <section className="detail-panel facility-detail" aria-label="Selected facility details">
          <button
            className="detail-close"
            aria-label="Close facility details"
            onClick={() => {
              setSelectedFacilityId(null);
              updateUrl({ facility: null });
            }}
          >×</button>
          <p className="eyebrow">{String(selectedFacility.properties?.kind || "facility").toUpperCase()}</p>
          <p className={`margin-label ${selectedFacilityEval.status}`}>{selectedFacilityEval.summary}</p>
          <h2>{String(selectedFacility.properties?.name || "Facility")}</h2>
          {selectedFacility.properties?.operator ? (
            <p className="crossing">{String(selectedFacility.properties.operator)}</p>
          ) : null}
          <ul className="facility-reasons">
            {selectedFacilityEval.reasons.map(reason => (
              <li key={`${reason.dimension}-${reason.label}`}>
                <span className={`reason-status ${reason.status}`}>{reason.label}</span>
                <span>{reason.detail}</span>
              </li>
            ))}
          </ul>
          {selectedFacility.properties?.restrictionNote ? (
            <p className="posting-note" role="note">{String(selectedFacility.properties.restrictionNote)}</p>
          ) : null}
          <dl>
            <div><dt>Your height</dt><dd>{formatHeight(height)}</dd></div>
            {vehicle.widthInches != null ? <div><dt>Your width</dt><dd>{formatWidth(vehicle.widthInches)}</dd></div> : null}
            {vehicle.weightTons != null ? <div><dt>Your weight</dt><dd>{formatTons(vehicle.weightTons)}</dd></div> : null}
            {typeof selectedFacility.properties?.heightInches === "number" ? (
              <div><dt>Posted height</dt><dd>{formatHeight(selectedFacility.properties.heightInches)}</dd></div>
            ) : null}
            {typeof selectedFacility.properties?.widthInches === "number" ? (
              <div><dt>Posted width</dt><dd>{formatWidth(selectedFacility.properties.widthInches)}</dd></div>
            ) : null}
            {typeof selectedFacility.properties?.postedLoadTons === "number" ? (
              <div><dt>Posted load</dt><dd>{formatTons(selectedFacility.properties.postedLoadTons)}</dd></div>
            ) : typeof selectedFacility.properties?.weightTons === "number" ? (
              <div><dt>Posted load</dt><dd>{formatTons(selectedFacility.properties.weightTons)}</dd></div>
            ) : null}
            {selectedFacility.properties?.state ? (
              <div><dt>State</dt><dd>{String(selectedFacility.properties.state)}</dd></div>
            ) : null}
          </dl>
          {selectedFacility.properties?.extras &&
          typeof selectedFacility.properties.extras === "object" &&
          Object.keys(selectedFacility.properties.extras as object).filter(k => k !== "layer").length > 0 ? (
            <div className="extras-block">
              <p className="eyebrow">Source extras</p>
              <dl>
                {Object.entries(selectedFacility.properties.extras as Record<string, unknown>)
                  .filter(([key, value]) => key !== "layer" && value != null && value !== "")
                  .map(([key, value]) => (
                    <div key={key}>
                      <dt>{key}</dt>
                      <dd>{String(value)}</dd>
                    </div>
                  ))}
              </dl>
            </div>
          ) : null}
          <button
            className="share-clearance"
            type="button"
            onClick={() => copyLink(buildShareUrl({
              height: String(height),
              facility: selectedFacilityId,
              width: vehicle.widthInches == null ? null : String(vehicle.widthInches),
              weight: vehicle.weightTons == null ? null : String(vehicle.weightTons),
              commercial: vehicle.commercial ? "1" : null,
            }), setShareMessage)}
          >Share this facility</button>
          <p className="detail-note">Awareness only — check posted signs. Missing limits do not mean the road is clear.</p>
        </section>
      )}
      {selected && selectedLabels && !selectedFacility && (
        <section className="detail-panel" aria-label="Selected clearance details">
          <button className="detail-close" aria-label="Close clearance details" onClick={() => updateUrl({ bridge: null })}>×</button>
          <p className="eyebrow">OFFICIAL POSTED CLEARANCE</p>
          <strong className={`detail-height ${selectedSeverity}`}>{formatHeight(selected.postedClearanceInches)}</strong>
          <p className={`margin-label ${selectedSeverity}`}>{describeMargin(selected.postedClearanceInches, height)}</p>
          <h2>{selectedLabels.title}</h2>
          {selectedLabels.subtitle !== selected.location && <p className="crossing">{selectedLabels.subtitle}</p>}
          {showPostingNote && (
            <p className="posting-note" role="note">
              New York generally requires clearance signs to post <strong>one foot (12″) lower</strong> than the measured opening.
              Your vehicle may still fit physically, but driving past a posted limit is still illegal — follow the sign.
            </p>
          )}
          <dl>
            <div><dt>Your vehicle</dt><dd>{formatHeight(height)}</dd></div>
            <div><dt>County / town</dt><dd>{selected.county}{selected.state ? `, ${selected.state}` : ""}</dd></div>
            <div><dt>Direction</dt><dd>Not specified by source</dd></div>
            <div><dt>Structure ID</dt><dd>{selected.structureId}</dd></div>
            {isInventoryLabel(selected.road) && selected.road ? <div><dt>Agency road name</dt><dd>{selected.road}</dd></div> : null}
          </dl>
          {selected.location && selectedLabels.title !== selected.location && (
            <p className="source-location">Source location: {selected.location}</p>
          )}
          <button
            className="share-clearance"
            type="button"
            onClick={() => {
              const feature = data?.features.find(f => f.properties.id === selectedId);
              const [lng, lat] = feature?.geometry.coordinates || [];
              copyLink(buildShareUrl({
                height: String(height),
                bridge: selected.id,
                lng: typeof lng === "number" ? lng.toFixed(5) : null,
                lat: typeof lat === "number" ? lat.toFixed(5) : null,
                z: "15",
              }), setShareMessage);
            }}
          >Share this clearance</button>
          <a className="source-link" href={selected.sources[0].sourceUrl} target="_blank" rel="noreferrer">{selected.state === "CT" ? "CTDOT" : "NYSDOT"} source record ↗</a>
          <p className="detail-note">Posted values only. This map does not determine road access or whether your vehicle will physically fit.</p>
        </section>
      )}
    </section>
  </main>;
}
