"use client";
import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import { type GeoJSONSource, type Map as MapInstance } from "maplibre-gl";
import type { Feature, FeatureCollection, LineString } from "geojson";
import type { ClearanceCollection } from "@/lib/types";
import type { DrivePath } from "@/lib/path";
import { formatHeight, getClearanceSeverity, recordLabels } from "@/lib/clearance";
import { shouldSurfaceMapError } from "@/lib/map-errors";

export type Viewport = { lng: number; lat: number; z: number };

const EMPTY_DRIVE: FeatureCollection<LineString> = { type: "FeatureCollection", features: [] };
const MAP_STYLE = process.env.NEXT_PUBLIC_MAP_STYLE || "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json";

function toDriveGeoJSON(coordinates: number[][]): FeatureCollection<LineString> {
  return {
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates } }],
  };
}

function createEndpoint(letter: string, label: string) {
  const el = document.createElement("div");
  el.className = `endpoint-marker endpoint-${letter.toLowerCase()}`;
  el.innerHTML = `<span>${letter}</span>`;
  el.setAttribute("aria-label", label);
  return el;
}

const EMPTY_FC: FeatureCollection = { type: "FeatureCollection", features: [] };

/** One label point per facility — MultiLineString parts otherwise spam the same name. */
function facilityLabelPoints(fc: FeatureCollection): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: fc.features.flatMap(feature => {
      const props = feature.properties || {};
      if (feature.geometry?.type === "Point") {
        return [{ type: "Feature" as const, properties: props, geometry: feature.geometry }];
      }
      const lng = props.labelLng;
      const lat = props.labelLat;
      if (typeof lng !== "number" || typeof lat !== "number") return [];
      return [{
        type: "Feature" as const,
        properties: props,
        geometry: { type: "Point" as const, coordinates: [lng, lat] },
      }];
    }),
  };
}


export type AwarenessLayers = {
  truckRoutes: boolean;
  streetClosures: boolean;
  loadingZones: boolean;
  /** Bridges / tunnels / expressways + labels */
  roadFeatures: boolean;
  /** Commercial-vehicle-banned parkways */
  parkways: boolean;
  /** Posted load (weight) bridges */
  postedLoad: boolean;
  /** Parsed crossing limit segments (width/weight notes) */
  crossingLimits: boolean;
  /** Curated major bridge/tunnel pins */
  majorCrossings: boolean;
  /** Status-colored bridges / tunnels / parkways (clickable) */
  facilities: boolean;
};

function addOverlayLayers(map: MapInstance) {
  if (!map.getSource("truck-routes")) {
    map.addSource("truck-routes", { type: "geojson", data: EMPTY_FC });
    map.addLayer({
      id: "truck-routes-line",
      type: "line",
      source: "truck-routes",
      layout: { "line-cap": "round", "line-join": "round", visibility: "none" },
      paint: {
        "line-color": [
          "match",
          ["get", "routeType"],
          "Through", "#1d4ed8",
          "Limited Local", "#7c3aed",
          "#334155",
        ],
        "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1.2, 14, 3.5],
        "line-opacity": 0.55,
      },
    });
  }
  if (!map.getSource("street-closures")) {
    map.addSource("street-closures", { type: "geojson", data: EMPTY_FC });
    map.addLayer({
      id: "street-closures-line",
      type: "line",
      source: "street-closures",
      layout: { "line-cap": "round", "line-join": "round", visibility: "none" },
      paint: {
        "line-color": "#dc2626",
        "line-width": ["interpolate", ["linear"], ["zoom"], 10, 2.5, 14, 6],
        "line-opacity": 0.9,
      },
    });
  }
  if (!map.getSource("loading-zones")) {
    map.addSource("loading-zones", { type: "geojson", data: EMPTY_FC });
    map.addLayer({
      id: "loading-zones-circle",
      type: "circle",
      source: "loading-zones",
      layout: { visibility: "none" },
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 2.5, 14, 5.5],
        "circle-color": [
          "match",
          ["get", "zoneType"],
          "neighborhood", "#0f766e",
          "#047857",
        ],
        "circle-opacity": 0.85,
        "circle-stroke-width": 1,
        "circle-stroke-color": "#ffffff",
      },
    });
  }
  if (!map.getSource("road-features")) {
    map.addSource("road-features", { type: "geojson", data: EMPTY_FC });
    map.addLayer({
      id: "road-features-line",
      type: "line",
      source: "road-features",
      layout: { "line-cap": "round", "line-join": "round", visibility: "none" },
      paint: {
        "line-color": [
          "match",
          ["get", "kind"],
          "bridge", "#b45309",
          "tunnel", "#6d28d9",
          "expressway", "#0f766e",
          "#64748b",
        ],
        "line-width": ["interpolate", ["linear"], ["zoom"], 9, 1.4, 14, 4],
        "line-opacity": 0.7,
      },
    });
  }
  if (!map.getSource("road-labels")) {
    map.addSource("road-labels", { type: "geojson", data: EMPTY_FC });
    map.addLayer({
      id: "road-labels-symbol",
      type: "symbol",
      source: "road-labels",
      layout: {
        visibility: "none",
        "text-field": ["get", "name"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 10, 10, 14, 13],
        "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
        "text-offset": [0, 0.2],
        "text-anchor": "top",
        "text-max-width": 10,
        "text-optional": true,
      },
      paint: {
        "text-color": [
          "match",
          ["get", "kind"],
          "bridge", "#92400e",
          "tunnel", "#5b21b6",
          "expressway", "#115e59",
          "parkway", "#9f1239",
          "#334155",
        ],
        "text-halo-color": "#ffffff",
        "text-halo-width": 1.4,
      },
      minzoom: 10,
    });
  }
  if (!map.getSource("parkways")) {
    map.addSource("parkways", { type: "geojson", data: EMPTY_FC });
    map.addLayer({
      id: "parkways-line",
      type: "line",
      source: "parkways",
      layout: { "line-cap": "round", "line-join": "round", visibility: "none" },
      paint: {
        "line-color": "#e11d48",
        "line-width": ["interpolate", ["linear"], ["zoom"], 9, 2, 14, 5],
        "line-opacity": 0.75,
        "line-dasharray": [1.2, 1.4],
      },
    });
  }
  if (!map.getSource("posted-load")) {
    map.addSource("posted-load", { type: "geojson", data: EMPTY_FC });
    map.addLayer({
      id: "posted-load-circle",
      type: "circle",
      source: "posted-load",
      layout: { visibility: "none" },
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 4, 14, 8],
        "circle-color": [
          "case",
          ["==", ["get", "conflict"], "danger"], "#7f1d1d",
          ["==", ["get", "conflict"], "ok"], "#a78bfa",
          "#7c3aed",
        ],
        "circle-opacity": 0.9,
        "circle-stroke-width": 1.5,
        "circle-stroke-color": "#fff",
      },
    });
  }
  if (!map.getSource("crossing-limits")) {
    map.addSource("crossing-limits", { type: "geojson", data: EMPTY_FC });
    map.addLayer({
      id: "crossing-limits-line",
      type: "line",
      source: "crossing-limits",
      layout: { "line-cap": "round", "line-join": "round", visibility: "none" },
      paint: {
        "line-color": [
          "case",
          ["==", ["get", "conflict"], "danger"], "#b91c1c",
          "#ea580c",
        ],
        "line-width": ["interpolate", ["linear"], ["zoom"], 10, 2.5, 14, 6],
        "line-opacity": 0.85,
      },
    });
  }
  if (!map.getSource("major-crossings")) {
    map.addSource("major-crossings", { type: "geojson", data: EMPTY_FC });
    map.addLayer({
      id: "major-crossings-circle",
      type: "circle",
      source: "major-crossings",
      layout: { visibility: "none" },
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 5, 13, 9],
        "circle-color": [
          "match",
          ["get", "kind"],
          "tunnel", "#6d28d9",
          "#b45309",
        ],
        "circle-opacity": 0.92,
        "circle-stroke-width": 2,
        "circle-stroke-color": "#fff",
      },
    });
    map.addLayer({
      id: "major-crossings-label",
      type: "symbol",
      source: "major-crossings",
      layout: {
        visibility: "none",
        "text-field": ["get", "name"],
        "text-size": 12,
        "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
        "text-offset": [0, 1.1],
        "text-anchor": "top",
        "text-optional": true,
        "text-padding": 40,
      },
      paint: {
        "text-color": "#1e293b",
        "text-halo-color": "#ffffff",
        "text-halo-width": 1.5,
      },
      minzoom: 9,
    });
  }
  if (!map.getSource("facilities")) {
    map.addSource("facilities", { type: "geojson", data: EMPTY_FC });
    const statusColor = [
      "match",
      ["get", "status"],
      "danger", "#c9322a",
      "caution", "#cf720e",
      "unknown", "#64748b",
      "ok", "#0f7a4c",
      "#cf720e",
    ] as never;
    map.addLayer({
      id: "facilities-line",
      type: "line",
      source: "facilities",
      filter: ["any", ["==", ["geometry-type"], "LineString"], ["==", ["geometry-type"], "MultiLineString"]],
      layout: { "line-cap": "round", "line-join": "round", visibility: "none" },
      paint: {
        "line-color": statusColor,
        "line-width": ["interpolate", ["linear"], ["zoom"], 9, 2.5, 14, 6],
        "line-opacity": 0.85,
      },
    });
    map.addLayer({
      id: "facilities-circle",
      type: "circle",
      source: "facilities",
      filter: ["==", ["geometry-type"], "Point"],
      layout: { visibility: "none" },
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 6, 13, 10],
        "circle-color": statusColor,
        "circle-opacity": 0.95,
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff",
      },
    });
    if (!map.getSource("facilities-labels")) {
      map.addSource("facilities-labels", { type: "geojson", data: EMPTY_FC });
    }
    map.addLayer({
      id: "facilities-label",
      type: "symbol",
      source: "facilities-labels",
      layout: {
        visibility: "none",
        "text-field": ["get", "name"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 9, 11, 13, 13],
        "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
        "text-offset": [0, 1.15],
        "text-anchor": "top",
        "text-optional": true,
        "text-padding": 28,
        "symbol-sort-key": [
          "match",
          ["get", "status"],
          "danger", 0,
          "caution", 1,
          2,
        ],
      },
      paint: {
        "text-color": "#1e293b",
        "text-halo-color": "#ffffff",
        "text-halo-width": 1.5,
      },
      minzoom: 9,
    });
  }
  if (!map.getSource("focus-highlight")) {
    map.addSource("focus-highlight", { type: "geojson", data: EMPTY_FC });
    map.addLayer({
      id: "focus-glow-line",
      type: "line",
      source: "focus-highlight",
      filter: ["any", ["==", ["geometry-type"], "LineString"], ["==", ["geometry-type"], "MultiLineString"]],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#ffffff",
        "line-width": ["interpolate", ["linear"], ["zoom"], 9, 12, 14, 22],
        "line-opacity": 0.55,
        "line-blur": 7,
      },
    });
    map.addLayer({
      id: "focus-line",
      type: "line",
      source: "focus-highlight",
      filter: ["any", ["==", ["geometry-type"], "LineString"], ["==", ["geometry-type"], "MultiLineString"]],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#007aff",
        "line-width": ["interpolate", ["linear"], ["zoom"], 9, 3.5, 14, 7.5],
        "line-opacity": 0.98,
      },
    });
    map.addLayer({
      id: "focus-glow-circle",
      type: "circle",
      source: "focus-highlight",
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 16, 13, 26],
        "circle-color": "#ffffff",
        "circle-opacity": 0.55,
        "circle-blur": 0.65,
        "circle-stroke-width": 0,
      },
    });
    map.addLayer({
      id: "focus-circle",
      type: "circle",
      source: "focus-highlight",
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 7, 13, 12],
        "circle-color": "#007aff",
        "circle-opacity": 0.98,
        "circle-stroke-width": 3,
        "circle-stroke-color": "#ffffff",
      },
    });
  }
  if (!map.getSource("hover-highlight")) {
    map.addSource("hover-highlight", { type: "geojson", data: EMPTY_FC });
    map.addLayer({
      id: "hover-glow-line",
      type: "line",
      source: "hover-highlight",
      filter: ["any", ["==", ["geometry-type"], "LineString"], ["==", ["geometry-type"], "MultiLineString"]],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#0f172a",
        "line-width": ["interpolate", ["linear"], ["zoom"], 9, 7, 14, 12],
        "line-opacity": 0.28,
        "line-blur": 2,
      },
    });
    map.addLayer({
      id: "hover-glow-circle",
      type: "circle",
      source: "hover-highlight",
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 11, 13, 16],
        "circle-color": "#0f172a",
        "circle-opacity": 0.22,
        "circle-blur": 0.4,
      },
    });
  }
  if (!map.getSource("drive")) {
    map.addSource("drive", { type: "geojson", data: EMPTY_DRIVE });
    map.addLayer({
      id: "drive-glow",
      type: "line",
      source: "drive",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#d63b2f",
        "line-width": 16,
        "line-opacity": 0.28,
        "line-blur": 10,
      },
    });
    map.addLayer({
      id: "drive-casing",
      type: "line",
      source: "drive",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#ffffff", "line-width": 11, "line-opacity": 0.95 },
    });
    map.addLayer({
      id: "drive-line",
      type: "line",
      source: "drive",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#d63b2f", "line-width": 5.5, "line-opacity": 0.98 },
    });
  }
  if (!map.getSource("drive-alts")) {
    map.addSource("drive-alts", { type: "geojson", data: EMPTY_DRIVE });
    map.addLayer({
      id: "drive-alts-line",
      type: "line",
      source: "drive-alts",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#8ec5ff",
        "line-width": 4.5,
        "line-opacity": 0.55,
      },
    }, "drive-casing");
  }
  if (!map.getSource("clearances")) {
    map.addSource("clearances", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
      cluster: true,
      clusterMaxZoom: 12,
      clusterRadius: 38,
      clusterProperties: {
        dangerCount: ["+", ["case", ["==", ["get", "severity"], "danger"], 1, 0]],
        cautionCount: ["+", ["case", ["==", ["get", "severity"], "caution"], 1, 0]],
      },
    });
    // Keep a renderable layer: MapLibre skips loading sources used only by
    // fully transparent layers. HTML markers cover these tiny anchor dots.
    map.addLayer({
      id: "clearance-source-layer",
      type: "circle",
      source: "clearances",
      paint: { "circle-radius": 1, "circle-color": "#526573", "circle-opacity": 0.05 },
    });
  }
}

function ShareControl(onShare: () => void): maplibregl.IControl {
  let container: HTMLDivElement | undefined;
  return {
    onAdd() {
      container = document.createElement("div");
      container.className = "maplibregl-ctrl maplibregl-ctrl-group";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "map-share-ctrl";
      button.title = "Share map";
      button.setAttribute("aria-label", "Share map");
      button.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>`;
      button.addEventListener("click", () => onShare());
      container.appendChild(button);
      return container;
    },
    onRemove() {
      container?.remove();
      container = undefined;
    },
  };
}

export function ClearanceMap({
  data,
  height,
  showAll,
  selectedId,
  drive,
  altRoutes = [],
  awareness,
  truckRoutesData,
  streetClosuresData,
  loadingZonesData,
  roadFeaturesData = null,
  roadLabelsData = null,
  parkwaysData = null,
  postedLoadData = null,
  crossingLimitsData = null,
  majorCrossingsData = null,
  facilitiesData = null,
  selectedFacilityId = null,
  initialViewport,
  onSelect,
  onFacilitySelect,
  onClearFocus,
  onViewport,
  onShare,
}: {
  data: ClearanceCollection;
  height: number;
  showAll: boolean;
  selectedId: string | null;
  selectedFacilityId?: string | null;
  drive: DrivePath | null;
  altRoutes?: number[][][];
  awareness: AwarenessLayers;
  truckRoutesData: FeatureCollection | null;
  streetClosuresData: FeatureCollection | null;
  loadingZonesData: FeatureCollection | null;
  roadFeaturesData?: FeatureCollection | null;
  roadLabelsData?: FeatureCollection | null;
  parkwaysData?: FeatureCollection | null;
  postedLoadData?: FeatureCollection | null;
  crossingLimitsData?: FeatureCollection | null;
  majorCrossingsData?: FeatureCollection | null;
  facilitiesData?: FeatureCollection | null;
  initialViewport: Viewport;
  onSelect: (id: string) => void;
  onFacilitySelect?: (id: string) => void;
  onClearFocus?: () => void;
  onViewport: (viewport: Viewport, bounds: [number, number, number, number]) => void;
  onShare?: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapInstance | null>(null);
  const current = useRef({ data, height, showAll, onSelect, onFacilitySelect, onClearFocus, onViewport, onShare });
  const initial = useRef(initialViewport);
  const ends = useRef<maplibregl.Marker[]>([]);
  const focusedId = useRef<string | null>(null);
  const markersRef = useRef(new Map<string, maplibregl.Marker>());
  const selectedIdRef = useRef(selectedId);
  const selectedFacilityIdRef = useRef(selectedFacilityId ?? null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    current.current = { data, height, showAll, onSelect, onFacilitySelect, onClearFocus, onViewport, onShare };
  }, [data, height, showAll, onSelect, onFacilitySelect, onClearFocus, onViewport, onShare]);

  useEffect(() => {
    if (!container.current) return;
    let map: MapInstance;
    try {
      maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
      map = new maplibregl.Map({
        container: container.current,
        style: MAP_STYLE,
        center: [initial.current.lng, initial.current.lat],
        zoom: initial.current.z,
        minZoom: 6,
        maxZoom: 18,
        attributionControl: false,
      });
    } catch {
      setError("Your browser couldn’t start the interactive map. The clearance list is still available.");
      return;
    }
    mapRef.current = map;
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    const locate = new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: false,
    });
    locate.on("error", () => setError("Location is unavailable. You can still pan and zoom the map."));
    map.addControl(locate, "top-right");
    if (current.current.onShare) {
      map.addControl(ShareControl(() => current.current.onShare?.()), "top-right");
    }

    const markers = markersRef.current;
    markers.clear();
    function syncMarkerFocus() {
      const focusId = selectedIdRef.current;
      for (const [key, marker] of markers) {
        const el = marker.getElement();
        const on = Boolean(focusId) && key === focusId;
        el.classList.toggle("is-focused", on);
        if (on) el.setAttribute("aria-current", "true");
        else el.removeAttribute("aria-current");
      }
    }
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
        const severity = p.cluster
          ? (p.dangerCount > 0 ? "danger" : p.cautionCount > 0 ? "caution" : "clear")
          : p.severity;
        button.className = `clearance-marker ${severity} ${p.cluster ? "cluster-marker" : ""}`;
        button.textContent = p.cluster ? `${p.point_count}` : formatHeight(p.postedClearanceInches);
        button.setAttribute(
          "aria-label",
          p.cluster
            ? `Zoom into ${p.point_count} clearance records`
            : `${formatHeight(p.postedClearanceInches)} posted clearance, ${p.displayTitle}`,
        );
        button.onclick = async () => {
          if (p.cluster) {
            const source = map.getSource("clearances") as GeoJSONSource;
            try {
              const zoom = await source.getClusterExpansionZoom(p.cluster_id);
              map.easeTo({
                center: feature.geometry.type === "Point" ? feature.geometry.coordinates as [number, number] : undefined,
                zoom,
              });
            } catch {
              /* Source can change while a cluster expands. */
            }
          } else {
            current.current.onSelect(p.id);
          }
        };
        markers.set(
          key,
          new maplibregl.Marker({ element: button })
            .setLngLat(feature.geometry.coordinates as [number, number])
            .addTo(map),
        );
      }
      for (const [key, marker] of markers) {
        if (!keep.has(key)) {
          marker.remove();
          markers.delete(key);
        }
      }
      syncMarkerFocus();
    }

    function reportViewport() {
      const c = map.getCenter();
      const b = map.getBounds();
      current.current.onViewport(
        { lng: c.lng, lat: c.lat, z: map.getZoom() },
        [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()],
      );
      updateMarkers();
    }

    map.on("load", () => {
      addOverlayLayers(map);
    map.on("click", "facilities-line", event => {
      event.originalEvent.stopPropagation();
      const id = event.features?.[0]?.properties?.id;
      if (id) current.current.onFacilitySelect?.(String(id));
    });
    map.on("click", "facilities-circle", event => {
      event.originalEvent.stopPropagation();
      const id = event.features?.[0]?.properties?.id;
      if (id) current.current.onFacilitySelect?.(String(id));
    });
    // Empty map click clears focus / closes the info card.
    map.on("click", event => {
      const layers = ["facilities-line", "facilities-circle"].filter(id => map.getLayer(id));
      const hits = layers.length
        ? map.queryRenderedFeatures(event.point, { layers })
        : [];
      if (hits.length) return;
      if (!selectedIdRef.current && !selectedFacilityIdRef.current) return;
      current.current.onClearFocus?.();
    });
    for (const layerId of ["facilities-line", "facilities-circle"]) {
      map.on("mouseenter", layerId, event => {
        map.getCanvas().style.cursor = "pointer";
        const feature = event.features?.[0];
        if (!feature || !map.getSource("hover-highlight")) return;
        const id = feature.properties?.id;
        if (id && id === selectedFacilityIdRef.current) return;
        (map.getSource("hover-highlight") as GeoJSONSource).setData({
          type: "FeatureCollection",
          features: [{
            type: "Feature",
            properties: feature.properties || {},
            geometry: feature.geometry as never,
          }],
        }).catch(() => undefined);
      });
      map.on("mouseleave", layerId, () => {
        map.getCanvas().style.cursor = "";
        const source = map.getSource("hover-highlight") as GeoJSONSource | undefined;
        source?.setData(EMPTY_FC);
      });
    }

      setReady(true);
      reportViewport();
    });
    map.on("sourcedata", event => { if (event.sourceId === "clearances") updateMarkers(); });
    map.on("render", updateMarkers);
    map.on("moveend", reportViewport);
    map.on("error", event => {
      if (!shouldSurfaceMapError(event)) return;
      const sourceId = "sourceId" in event ? String((event as { sourceId?: unknown }).sourceId ?? "") : "";
      if (sourceId === "clearances") {
        setError("Clearance markers couldn’t load. The source records are still available in the list.");
        return;
      }
      setError("The basemap couldn’t load. Try reloading; clearance records remain available in the list.");
    });
    map.on("dataloading", event => {
      if (event.dataType === "source" && event.sourceId === "clearances") {
        for (const marker of markers.values()) marker.remove();
        markers.clear();
      }
    });

    return () => {
      for (const marker of markers.values()) marker.remove();
      for (const marker of ends.current) marker.remove();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const source = mapRef.current?.getSource("clearances") as GeoJSONSource | undefined;
    if (!ready || !source) return;
    source.setData({
      type: "FeatureCollection",
      features: data.features
        .filter(f => showAll || f.properties.postedClearanceInches <= height + 12)
        .map(f => ({
          ...f,
          properties: {
            ...f.properties,
            severity: getClearanceSeverity(f.properties.postedClearanceInches, height),
            displayTitle: recordLabels(f.properties).title,
          },
        })),
    }).catch(() => setError("Clearance markers couldn’t load. The source records are still available in the list."));
  }, [data, height, showAll, ready]);

  useEffect(() => {
    const map = mapRef.current;
    const source = map?.getSource("truck-routes") as GeoJSONSource | undefined;
    if (!ready || !map || !source) return;
    if (truckRoutesData) {
      source.setData(truckRoutesData).catch(() => {
        setError("Truck route overlay couldn’t load.");
      });
    }
    if (map.getLayer("truck-routes-line")) {
      map.setLayoutProperty("truck-routes-line", "visibility", awareness.truckRoutes ? "visible" : "none");
    }
  }, [truckRoutesData, awareness.truckRoutes, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map?.getLayer("drive-glow")) return;
    if (!drive) {
      map.setPaintProperty("drive-glow", "line-opacity", 0);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      if (!mapRef.current?.getLayer("drive-glow")) return;
      const wave = 0.5 + 0.5 * Math.sin(((now - start) / 1400) * Math.PI * 2);
      mapRef.current.setPaintProperty("drive-glow", "line-opacity", 0.18 + wave * 0.28);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [drive, ready]);

  useEffect(() => {
    const map = mapRef.current;
    const source = map?.getSource("street-closures") as GeoJSONSource | undefined;
    if (!ready || !map || !source) return;
    if (streetClosuresData) {
      source.setData(streetClosuresData).catch(() => {
        setError("Street closure overlay couldn’t load.");
      });
    }
    if (map.getLayer("street-closures-line")) {
      map.setLayoutProperty(
        "street-closures-line",
        "visibility",
        awareness.streetClosures ? "visible" : "none",
      );
    }
  }, [streetClosuresData, awareness.streetClosures, ready]);

  useEffect(() => {
    const map = mapRef.current;
    const source = map?.getSource("loading-zones") as GeoJSONSource | undefined;
    if (!ready || !map || !source) return;
    if (loadingZonesData) {
      source.setData(loadingZonesData).catch(() => {
        setError("Loading zone overlay couldn’t load.");
      });
    }
    if (map.getLayer("loading-zones-circle")) {
      map.setLayoutProperty(
        "loading-zones-circle",
        "visibility",
        awareness.loadingZones ? "visible" : "none",
      );
    }
  }, [loadingZonesData, awareness.loadingZones, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const pairs: Array<[string, string, FeatureCollection | null, boolean]> = [
      ["road-features", "road-features-line", roadFeaturesData, awareness.roadFeatures],
      ["road-labels", "road-labels-symbol", roadLabelsData, awareness.roadFeatures],
      ["parkways", "parkways-line", parkwaysData, awareness.parkways],
      ["posted-load", "posted-load-circle", postedLoadData, awareness.postedLoad],
      ["crossing-limits", "crossing-limits-line", crossingLimitsData, awareness.crossingLimits],
      ["major-crossings", "major-crossings-circle", majorCrossingsData, awareness.majorCrossings],
      ["major-crossings", "major-crossings-label", majorCrossingsData, awareness.majorCrossings],
      ["facilities", "facilities-line", facilitiesData, awareness.facilities],
      ["facilities", "facilities-circle", facilitiesData, awareness.facilities],
      ["facilities-labels", "facilities-label", facilitiesData ? facilityLabelPoints(facilitiesData) : null, awareness.facilities],
    ];
    for (const [sourceId, layerId, dataFc, on] of pairs) {
      const source = map.getSource(sourceId) as GeoJSONSource | undefined;
      if (source && dataFc) {
        source.setData(dataFc).catch(() => {
          setError("A map overlay couldn’t load.");
        });
      }
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, "visibility", on ? "visible" : "none");
      }
    }
  }, [
    ready,
    awareness.roadFeatures,
    awareness.parkways,
    awareness.postedLoad,
    awareness.crossingLimits,
    awareness.majorCrossings,
    awareness.facilities,
    roadFeaturesData,
    roadLabelsData,
    parkwaysData,
    postedLoadData,
    crossingLimitsData,
    majorCrossingsData,
    facilitiesData,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    const source = map?.getSource("drive") as GeoJSONSource | undefined;
    const altSource = map?.getSource("drive-alts") as GeoJSONSource | undefined;
    if (!ready || !map || !source || !altSource) return;
    for (const marker of ends.current) marker.remove();
    ends.current = [];
    if (!drive) {
      source.setData(EMPTY_DRIVE);
      altSource.setData(EMPTY_DRIVE);
      return;
    }
    source.setData(toDriveGeoJSON(drive.coordinates)).catch(() => {
      setError("The driving path couldn’t be drawn. Posted records remain in the list.");
    });
    altSource.setData({
      type: "FeatureCollection",
      features: altRoutes
        .filter(line => Array.isArray(line) && line.length >= 2)
        .map(coordinates => ({
          type: "Feature" as const,
          properties: {},
          geometry: { type: "LineString" as const, coordinates },
        })),
    });
    ends.current = [
      new maplibregl.Marker({ element: createEndpoint("A", `Start: ${drive.from.label}`), anchor: "center" })
        .setLngLat([drive.from.lng, drive.from.lat]).addTo(map),
      new maplibregl.Marker({ element: createEndpoint("B", `End: ${drive.to.label}`), anchor: "center" })
        .setLngLat([drive.to.lng, drive.to.lat]).addTo(map),
    ];
    const allLines = [drive.coordinates, ...altRoutes.filter(line => line.length >= 2)];
    const seed = allLines[0][0] as [number, number];
    const bounds = allLines.reduce(
      (box, line) => line.reduce((inner, pair) => inner.extend(pair as [number, number]), box),
      new maplibregl.LngLatBounds(seed, seed),
    );
    map.fitBounds(bounds, { padding: 56, duration: 700, maxZoom: 14 });
  }, [drive, altRoutes, ready]);

  // Keep focus refs + marker pulse class in sync with the open info card.
  useEffect(() => {
    selectedIdRef.current = selectedId;
    selectedFacilityIdRef.current = selectedFacilityId ?? null;
    for (const [key, marker] of markersRef.current) {
      const el = marker.getElement();
      const on = Boolean(selectedId) && key === selectedId;
      el.classList.toggle("is-focused", on);
      if (on) el.setAttribute("aria-current", "true");
      else el.removeAttribute("aria-current");
    }
  }, [selectedId, selectedFacilityId]);

  // Draw a pulsing highlight under the open info card (clearance pin or facility geometry).
  useEffect(() => {
    const map = mapRef.current;
    const source = map?.getSource("focus-highlight") as GeoJSONSource | undefined;
    if (!ready || !map || !source) return;

    let feature: Feature | null = null;
    if (selectedFacilityId && facilitiesData) {
      const match = facilitiesData.features.find(f => f.properties?.id === selectedFacilityId);
      if (match) feature = match as Feature;
    } else if (selectedId) {
      const match = data.features.find(f => f.properties.id === selectedId);
      if (match) feature = match as Feature;
    }

    source.setData(
      feature
        ? { type: "FeatureCollection", features: [feature] }
        : EMPTY_FC,
    );

    // Clear sticky hover when selection changes.
    const hover = map.getSource("hover-highlight") as GeoJSONSource | undefined;
    hover?.setData(EMPTY_FC);

    if (!feature) return;

    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      if (!mapRef.current?.getLayer("focus-glow-line")) return;
      const wave = 0.5 + 0.5 * Math.sin(((now - start) / 900) * Math.PI * 2);
      const lineGlow = 0.22 + wave * 0.38;
      const circleGlow = 0.2 + wave * 0.4;
      mapRef.current.setPaintProperty("focus-glow-line", "line-opacity", lineGlow);
      mapRef.current.setPaintProperty("focus-glow-circle", "circle-opacity", circleGlow);
      const lineWidth = ["interpolate", ["linear"], ["zoom"], 9, 8 + wave * 4, 14, 14 + wave * 6];
      const circleRadius = ["interpolate", ["linear"], ["zoom"], 8, 12 + wave * 4, 13, 18 + wave * 6];
      mapRef.current.setPaintProperty("focus-glow-line", "line-width", lineWidth as never);
      mapRef.current.setPaintProperty("focus-glow-circle", "circle-radius", circleRadius as never);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      source.setData(EMPTY_FC);
    };
  }, [selectedId, selectedFacilityId, facilitiesData, data, ready]);

  // Only fly when the selected record changes. Re-running on every data refresh
  // was forcing zoom back up and blocking zoom-out while the detail card stayed open.
  useEffect(() => {
    if (!ready) return;
    if (!selectedId) {
      focusedId.current = null;
      return;
    }
    if (focusedId.current === selectedId) return;
    const feature = current.current.data.features.find(f => f.properties.id === selectedId);
    if (!feature) return;
    focusedId.current = selectedId;
    mapRef.current?.easeTo({
      center: feature.geometry.coordinates as [number, number],
      zoom: Math.max(14, mapRef.current.getZoom()),
      duration: 500,
    });
  }, [selectedId, ready]);

  return <>
    <div ref={container} className="map-canvas" />
    {!ready && !error && <div className="map-message" role="status">Opening the map…</div>}
    {error && <div className="map-message" role="status">{error}<button onClick={() => setError("")} aria-label="Dismiss map message">×</button></div>}
  </>;
}
