"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { ClearanceCollection } from "@/lib/types";
import { describeMargin, formatHeight, getClearanceSeverity, parseHeightParam } from "@/lib/clearance";
import { HeightForm } from "./height-form";
import type { Viewport } from "./clearance-map";

const Map = dynamic(() => import("./clearance-map").then(m => m.ClearanceMap), { ssr: false, loading: () => <div className="map-message">Loading interactive map…</div> });
function updateUrl(values: Record<string, string | null>) {
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(values)) { if (value === null) url.searchParams.delete(key); else url.searchParams.set(key, value); }
  window.history.replaceState(null, "", url);
}
function viewportNumber(value: string | null, fallback: number, min: number, max: number) {
  if (!value?.trim()) return fallback;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : fallback;
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
  const initialViewport: Viewport = { lng: viewportNumber(params.get("lng"), -73.63, -180, 180), lat: viewportNumber(params.get("lat"), 40.74, -80, 80), z: viewportNumber(params.get("z"), 10, 6, 18) };
  useEffect(() => {
    const controller = new AbortController();
    setFetchError("");
    fetch("/data/clearances-nyc-li.geojson", { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("The clearance dataset couldn’t be loaded.");
      const json = await response.json();
      if (json.type !== "FeatureCollection" || !Array.isArray(json.features) || json.features.length === 0) throw new Error("The clearance dataset is unavailable.");
      setData(json);
    }).catch(error => { if (error.name !== "AbortError") setFetchError(error.message); });
    return () => controller.abort();
  }, [retry]);
  const onSelect = useCallback((id: string) => updateUrl({ bridge: id }), []);
  const onViewport = useCallback((viewport: Viewport, nextBounds: [number, number, number, number]) => {
    setBounds(nextBounds);
    updateUrl({ lng: viewport.lng.toFixed(5), lat: viewport.lat.toFixed(5), z: viewport.z.toFixed(2) });
  }, []);
  if (height === null) return <main className="height-required"><p className="eyebrow">FIRST, YOUR VEHICLE</p><h1>How tall are you?</h1>{params.has("height") && <p role="alert">That link doesn’t contain a valid vehicle height. Enter yours below.</p>}<HeightForm onSubmit={h => updateUrl({ height: String(h) })} /></main>;
  const visible = (data?.features || []).filter(f => {
    const [lng, lat] = f.geometry.coordinates;
    return (showAll || f.properties.postedClearanceInches <= height + 12) && (!bounds || (lng >= bounds[0] && lat >= bounds[1] && lng <= bounds[2] && lat <= bounds[3]));
  }).sort((a, b) => a.properties.postedClearanceInches - b.properties.postedClearanceInches || a.properties.id.localeCompare(b.properties.id));
  const dangerCount = visible.filter(f => getClearanceSeverity(f.properties.postedClearanceInches, height) === "danger").length;
  const cautionCount = visible.filter(f => getClearanceSeverity(f.properties.postedClearanceInches, height) === "caution").length;
  const selected = data?.features.find(f => f.properties.id === selectedId)?.properties;
  const updated = data?.features[0]?.properties.sources[0].datasetUpdatedAt;
  return <main className="explorer">
    <aside className="explorer-sidebar" aria-label="Vehicle controls and clearance list">
      <div className="vehicle-panel"><div className="panel-heading"><span className="eyebrow">YOUR VEHICLE HEIGHT</span><button className="text-button" onClick={() => setEditing(!editing)}>{editing ? "Cancel" : "Edit"}</button></div>{editing ? <HeightForm key={height} initialHeight={height} compact onSubmit={h => { updateUrl({ height: String(h) }); setEditing(false); }} /> : <div className="vehicle-number">{formatHeight(height)}<span>↕</span></div>}
      <div className="legend"><div><i className="swatch danger" /><span>At or below your height</span><strong>{dangerCount}</strong></div><div><i className="swatch caution" /><span>1–12″ above your height</span><strong>{cautionCount}</strong></div></div>
      <label className="all-toggle"><input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} />Also show clearances more than 12″ above</label></div>
      <div className="list-heading"><h1>In this map view</h1><span>{visible.length} records</span></div>
      <div className="clearance-list">{fetchError ? <div className="list-message" role="alert"><p>{fetchError}</p><button className="secondary" onClick={() => setRetry(n => n + 1)}>Try again</button></div> : !data ? <p className="list-message" role="status">Loading official clearance records…</p> : !visible.length ? <p className="list-message">No matching posted clearances in this view. Pan or zoom to explore. A missing marker does not mean a road is clear.</p> : <><ul>{visible.slice(0, listLimit).map(f => { const p = f.properties, severity = getClearanceSeverity(p.postedClearanceInches, height); return <li key={p.id}><button className={`clearance-row ${selectedId === p.id ? "selected" : ""}`} onClick={() => onSelect(p.id)}><span className={`height-badge ${severity}`}>{formatHeight(p.postedClearanceInches)}</span><span className="row-road"><strong>{p.road || "Road name unavailable"}</strong><span>{p.appliesTo === "under" ? "Under" : "On bridge over"} {p.crossing || "unnamed crossing"}</span></span><span className="row-arrow" aria-hidden="true">↗</span><span className="sr-only">{describeMargin(p.postedClearanceInches, height)}</span></button></li>; })}</ul>{visible.length > listLimit && <button className="load-more" onClick={() => setListLimit(n => n + 30)}>Show more records</button>}</>}</div>
      <div className="sidebar-foot"><span>NYSDOT layer updated {updated ? new Date(updated).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "date unavailable"}</span><Link href="/methodology">Sources & coverage ↗</Link></div>
    </aside>
    <section className="map-area" aria-label="Clearance map"><div className="map-topline"><span className="coverage-chip">NYC + LONG ISLAND <span>· Partial coverage</span></span><button className="share-button" onClick={async () => { try { await navigator.clipboard.writeText(window.location.href); setShareMessage("Link copied"); } catch { setShareMessage("Copy the link from your browser’s address bar."); } }}>Share map ↗</button></div>{shareMessage && <div className="share-status" role="status">{shareMessage}</div>}
      {data && <Map data={data} height={height} showAll={showAll} selectedId={selectedId} initialViewport={initialViewport} onSelect={onSelect} onViewport={onViewport} />}
      {!data && <div className="map-message">{fetchError ? "Map data unavailable. Retry from the clearance list." : "Preparing your map…"}</div>}
      <div className="map-footnote">Check posted signs. Missing markers do not guarantee clearance.</div>
      {selected && <section className="detail-panel" aria-label="Selected clearance details"><button className="detail-close" aria-label="Close clearance details" onClick={() => updateUrl({ bridge: null })}>×</button><p className="eyebrow">OFFICIAL POSTED CLEARANCE</p><strong className={`detail-height ${getClearanceSeverity(selected.postedClearanceInches, height)}`}>{formatHeight(selected.postedClearanceInches)}</strong><p className={`margin-label ${getClearanceSeverity(selected.postedClearanceInches, height)}`}>{describeMargin(selected.postedClearanceInches, height)}</p><h2>{selected.road}</h2><p className="crossing">{selected.appliesTo === "under" ? "Under" : "On bridge over"} {selected.crossing}</p><dl><div><dt>Your vehicle</dt><dd>{formatHeight(height)}</dd></div><div><dt>County</dt><dd>{selected.county}</dd></div><div><dt>Direction</dt><dd>Not specified by source</dd></div><div><dt>Structure ID</dt><dd>{selected.structureId}</dd></div></dl>{selected.location && <p className="source-location">Source location: {selected.location}</p>}<a className="source-link" href={selected.sources[0].sourceUrl} target="_blank" rel="noreferrer">NYSDOT source record ↗</a><p className="detail-note">Posted values only. This map does not determine road access or whether your vehicle will physically fit.</p></section>}
    </section>
  </main>;
}
