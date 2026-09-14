"use client";
import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import { type GeoJSONSource, type Map as MapInstance } from "maplibre-gl";
import type { ClearanceCollection } from "@/lib/types";
import type { FeatureCollection, LineString } from "geojson";
import type { DrivePath } from "@/lib/path";
import { formatHeight, getClearanceSeverity, recordLabels } from "@/lib/clearance";

export type Viewport = { lng: number; lat: number; z: number };
const emptyDrive: FeatureCollection<LineString> = { type: "FeatureCollection", features: [] };
function driveCollection(coordinates: number[][]): FeatureCollection<LineString> {
  return { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates } }] };
}
function endpointMarker(letter: string, label: string) {
  const el = document.createElement("div");
  el.className = "endpoint-marker";
  el.textContent = letter;
  el.setAttribute("aria-label", label);
  return el;
}
export function ClearanceMap({ data, height, showAll, selectedId, drive, initialViewport, onSelect, onViewport }: {
  data: ClearanceCollection; height: number; showAll: boolean; selectedId: string | null; drive: DrivePath | null;
  initialViewport: Viewport; onSelect: (id: string) => void;
  onViewport: (viewport: Viewport, bounds: [number, number, number, number]) => void;
}) {
  const container = useRef<HTMLDivElement>(null), mapRef = useRef<MapInstance | null>(null);
  const current = useRef({ data, height, showAll, onSelect, onViewport });
  const initial = useRef(initialViewport);
  const ends = useRef<maplibregl.Marker[]>([]);
  const [ready, setReady] = useState(false), [error, setError] = useState("");
  useEffect(() => { current.current = { data, height, showAll, onSelect, onViewport }; }, [data, height, showAll, onSelect, onViewport]);
  useEffect(() => {
    if (!container.current) return;
    let map: MapInstance;
    try {
      maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
      map = new maplibregl.Map({ container: container.current, center: [initial.current.lng, initial.current.lat], zoom: initial.current.z, minZoom: 6, maxZoom: 18,
        attributionControl: false,
        style: { version: 8, sources: { basemap: { type: "raster", tiles: [process.env.NEXT_PUBLIC_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, maxzoom: 19,
          attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors' } },
          layers: [{ id: "basemap", type: "raster", source: "basemap", paint: { "raster-saturation": -0.8, "raster-opacity": 0.8 } }] },
      });
    } catch { setError("Your browser couldn’t start the interactive map. The clearance list is still available."); return; }
    mapRef.current = map;
    map.addControl(new maplibregl.AttributionControl({ compact: false }), "bottom-right");
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    const locate = new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: false });
    locate.on("error", () => setError("Location is unavailable. You can still pan and zoom the map."));
    map.addControl(locate, "top-right");
    const markers = new Map<string, maplibregl.Marker>();
    function updateMarkers() {
      if (!map.getSource("clearances") || !map.isSourceLoaded("clearances")) return;
      const keep = new Set<string>();
      for (const feature of map.querySourceFeatures("clearances")) {
        if (feature.geometry.type !== "Point") continue;
        const p = feature.properties;
        const key = p.cluster ? `cluster-${p.cluster_id}` : p.id;
        if (keep.has(key)) continue;
        keep.add(key);
        if (markers.has(key)) continue;
        const button = document.createElement("button");
        const severity = p.cluster ? (p.dangerCount > 0 ? "danger" : p.cautionCount > 0 ? "caution" : "clear") : p.severity;
        button.className = `clearance-marker ${severity} ${p.cluster ? "cluster-marker" : ""}`;
        button.textContent = p.cluster ? `${p.point_count}` : formatHeight(p.postedClearanceInches);
        button.setAttribute("aria-label", p.cluster ? `Zoom into ${p.point_count} clearance records` : `${formatHeight(p.postedClearanceInches)} posted clearance, ${p.displayTitle}`);
        button.onclick = async () => {
          if (p.cluster) {
            const source = map.getSource("clearances") as GeoJSONSource;
            try { const zoom = await source.getClusterExpansionZoom(p.cluster_id); map.easeTo({ center: feature.geometry.type === "Point" ? feature.geometry.coordinates as [number, number] : undefined, zoom }); } catch { /* Source can change while a cluster expands. */ }
          } else current.current.onSelect(p.id);
        };
        const marker = new maplibregl.Marker({ element: button }).setLngLat(feature.geometry.coordinates as [number, number]).addTo(map);
        markers.set(key, marker);
      }
      for (const [key, marker] of markers) if (!keep.has(key)) { marker.remove(); markers.delete(key); }
    }
    function reportViewport() {
      const c = map.getCenter(), b = map.getBounds();
      current.current.onViewport({ lng: c.lng, lat: c.lat, z: map.getZoom() }, [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
      updateMarkers();
    }
    map.on("load", () => {
      map.addSource("drive", { type: "geojson", data: emptyDrive });
      map.addLayer({ id: "drive-casing", type: "line", source: "drive", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#ffffff", "line-width": 7 } });
      map.addLayer({ id: "drive-line", type: "line", source: "drive", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#17212b", "line-width": 3.5 } });
      map.addSource("clearances", { type: "geojson", data: { type: "FeatureCollection", features: [] }, cluster: true, clusterMaxZoom: 12, clusterRadius: 38,
        clusterProperties: { dangerCount: ["+", ["case", ["==", ["get", "severity"], "danger"], 1, 0]], cautionCount: ["+", ["case", ["==", ["get", "severity"], "caution"], 1, 0]] } });
      // Keep a renderable layer: MapLibre skips loading sources used only by
      // fully transparent layers. HTML markers cover these tiny anchor dots.
      map.addLayer({ id: "clearance-source-layer", type: "circle", source: "clearances", paint: { "circle-radius": 1, "circle-color": "#526573", "circle-opacity": 0.05 } });
      setReady(true); reportViewport();
    });
    map.on("sourcedata", event => { if (event.sourceId === "clearances") updateMarkers(); });
    map.on("render", updateMarkers);
    map.on("moveend", reportViewport);
    map.on("error", () => setError("Part of the map couldn’t load. Try reloading; clearance records remain available in the list."));
    // A new dataset can reuse cluster IDs, so clear DOM markers before every update.
    map.on("dataloading", event => { if (event.dataType === "source" && event.sourceId === "clearances") { for (const m of markers.values()) m.remove(); markers.clear(); } });
    return () => { for (const m of markers.values()) m.remove(); for (const m of ends.current) m.remove(); map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const source = mapRef.current?.getSource("clearances") as GeoJSONSource | undefined;
    if (!ready || !source) return;
    source.setData({ type: "FeatureCollection", features: data.features.filter(f => showAll || f.properties.postedClearanceInches <= height + 12).map(f => ({ ...f, properties: { ...f.properties, severity: getClearanceSeverity(f.properties.postedClearanceInches, height), displayTitle: recordLabels(f.properties).title } })) }).catch(() => setError("Clearance markers couldn’t load. The source records are still available in the list."));
  }, [data, height, showAll, ready]);
  useEffect(() => {
    const map = mapRef.current;
    const source = map?.getSource("drive") as GeoJSONSource | undefined;
    if (!ready || !map || !source) return;
    for (const marker of ends.current) marker.remove();
    ends.current = [];
    if (!drive) { source.setData(emptyDrive).catch(() => undefined); return; }
    source.setData(driveCollection(drive.coordinates)).catch(() => setError("The driving path couldn’t be drawn. Posted records remain in the list."));
    ends.current = [
      new maplibregl.Marker({ element: endpointMarker("A", `Start: ${drive.from.label}`), anchor: "center" }).setLngLat([drive.from.lng, drive.from.lat]).addTo(map),
      new maplibregl.Marker({ element: endpointMarker("B", `End: ${drive.to.label}`), anchor: "center" }).setLngLat([drive.to.lng, drive.to.lat]).addTo(map),
    ];
    const bounds = drive.coordinates.reduce((box, pair) => box.extend(pair as [number, number]), new maplibregl.LngLatBounds(drive.coordinates[0] as [number, number], drive.coordinates[0] as [number, number]));
    map.fitBounds(bounds, { padding: 56, duration: 700, maxZoom: 14 });
  }, [drive, ready]);
  useEffect(() => {
    const feature = data.features.find(f => f.properties.id === selectedId);
    if (feature && ready) mapRef.current?.easeTo({ center: feature.geometry.coordinates as [number, number], zoom: Math.max(14, mapRef.current.getZoom()), duration: 500 });
  }, [selectedId, data, ready]);
  return <><div ref={container} className="map-canvas" />{!ready && !error && <div className="map-message" role="status">Opening the map…</div>}{error && <div className="map-message" role="status">{error}<button onClick={() => setError("")} aria-label="Dismiss map message">×</button></div>}</>;
}
