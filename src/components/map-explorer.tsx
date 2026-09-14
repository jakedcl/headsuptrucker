"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ClearanceCollection } from "@/lib/types";
import { describeMargin, formatHeight, getClearanceSeverity, isInventoryLabel, parseHeightParam, recordLabels } from "@/lib/clearance";
import { featuresAlongRoute, formatDriveMiles, formatDriveMinutes, type DrivePath, type DriveRoute, type Place } from "@/lib/path";
import { DriveForm } from "./drive-form";
import { HeightForm } from "./height-form";
import type { Viewport } from "./clearance-map";

const Map = dynamic(() => import("./clearance-map").then(m => m.ClearanceMap), {
  ssr: false,
  loading: () => <div className="map-message">Loading interactive map…</div>,
});

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
  const height = parseHeightParam(params.get("height"));
  const selectedId = params.get("bridge");
  const [data, setData] = useState<ClearanceCollection | null>(null);
  const [fetchError, setFetchError] = useState("");
  const [retry, setRetry] = useState(0);
  const [editing, setEditing] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [bounds, setBounds] = useState<[number, number, number, number] | null>(null);
  const [listLimit, setListLimit] = useState(30);
  const [shareMessage, setShareMessage] = useState("");
  const [drive, setDrive] = useState<DrivePath | null>(null);
  const [driveLoading, setDriveLoading] = useState(false);
  const [driveError, setDriveError] = useState("");
  const [driveRetry, setDriveRetry] = useState(0);
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
    fetch("/data/clearances-nyc-li.geojson", { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("The clearance dataset couldn’t be loaded.");
      const json = await response.json();
      if (json.type !== "FeatureCollection" || !Array.isArray(json.features) || json.features.length === 0) {
        throw new Error("The clearance dataset is unavailable.");
      }
      setData(json);
    }).catch(error => {
      if (error.name !== "AbortError") setFetchError(error.message);
    });
    return () => controller.abort();
  }, [retry]);

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


  const onSelect = useCallback((id: string) => updateUrl({ bridge: id }), []);
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

  const dangerCount = visible.filter(f => getClearanceSeverity(f.properties.postedClearanceInches, height) === "danger").length;
  const cautionCount = visible.filter(f => getClearanceSeverity(f.properties.postedClearanceInches, height) === "caution").length;
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
          ? <HeightForm key={height} initialHeight={height} compact onSubmit={h => { updateUrl({ height: String(h) }); setEditing(false); }} />
          : <div className="vehicle-number">{formatHeight(height)}<span>↕</span></div>}
        <div className="legend">
          <div><i className="swatch danger" /><span>At or below your height</span><strong>{dangerCount}</strong></div>
          <div><i className="swatch caution" /><span>1–12″ above your height</span><strong>{cautionCount}</strong></div>
        </div>
        <label className="all-toggle">
          <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} />
          Also show clearances more than 12″ above
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
      <div className="map-topline">
        <span className="coverage-chip">{activeDrive ? "THIS PATH" : "NYC + LONG ISLAND"} <span>· Partial coverage</span></span>
        <button className="share-button" onClick={() => copyLink(window.location.href, setShareMessage)}>
          {activeDrive ? "Share path ↗" : selectedId ? "Share clearance ↗" : "Share map ↗"}
        </button>
      </div>
      {shareMessage && <div className="share-status" role="status">{shareMessage}</div>}
      {mapCollection && (
        <Map
          data={mapCollection}
          height={height}
          showAll={showAll}
          selectedId={selectedId}
          drive={activeDrive}
          altRoutes={altRoutes}
          initialViewport={initialViewport}
          onSelect={onSelect}
          onViewport={onViewport}
        />
      )}
      {!data && <div className="map-message">{fetchError ? "Map data unavailable. Retry from the clearance list." : "Preparing your map…"}</div>}
      <div className="map-footnote">
        {activeDrive
          ? "Posted records near this path. Check signs. Missing markers do not guarantee clearance."
          : "Check posted signs. Missing markers do not guarantee clearance."}
      </div>
      {selected && selectedLabels && (
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
            <div><dt>County</dt><dd>{selected.county}</dd></div>
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
          <a className="source-link" href={selected.sources[0].sourceUrl} target="_blank" rel="noreferrer">NYSDOT source record ↗</a>
          <p className="detail-note">Posted values only. This map does not determine road access or whether your vehicle will physically fit.</p>
        </section>
      )}
    </section>
  </main>;
}
