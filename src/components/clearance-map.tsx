"use client";
import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import { type GeoJSONSource, type Map as MapInstance } from "maplibre-gl";
import type { FeatureCollection, LineString } from "geojson";
import type { ClearanceCollection } from "@/lib/types";
import type { DrivePath } from "@/lib/path";
import { formatHeight, getClearanceSeverity, recordLabels } from "@/lib/clearance";

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

export type AwarenessLayers = {
  truckRoutes: boolean;
  truckRestrictions: boolean;
  streetClosures: boolean;
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
          "#2563eb",
        ],
        "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1.2, 14, 3.5],
        "line-opacity": 0.55,
      },
    });
    map.addLayer({
      id: "truck-restrictions-line",
      type: "line",
      source: "truck-routes",
      filter: [
        "all",
        ["has", "restriction"],
        ["!=", ["get", "restriction"], null],
        ["!=", ["get", "restriction"], ""],
      ],
      layout: { "line-cap": "round", "line-join": "round", visibility: "none" },
      paint: {
        "line-color": "#b45309",
        "line-width": ["interpolate", ["linear"], ["zoom"], 10, 2, 14, 5],
        "line-opacity": 0.85,
        "line-dasharray": [1.4, 1.2],
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
  if (!map.getSource("drive")) {
    map.addSource("drive", { type: "geojson", data: EMPTY_DRIVE });
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
      paint: { "line-color": "#0a84ff", "line-width": 5.5, "line-opacity": 0.98 },
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
        "line-color": "#8aa0b3",
        "line-width": 4,
        "line-opacity": 0.7,
        "line-dasharray": [1.2, 1.8],
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
  initialViewport,
  onSelect,
  onViewport,
}: {
  data: ClearanceCollection;
  height: number;
  showAll: boolean;
  selectedId: string | null;
  drive: DrivePath | null;
  altRoutes?: number[][][];
  awareness: AwarenessLayers;
  truckRoutesData: FeatureCollection | null;
  streetClosuresData: FeatureCollection | null;
  initialViewport: Viewport;
  onSelect: (id: string) => void;
  onViewport: (viewport: Viewport, bounds: [number, number, number, number]) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapInstance | null>(null);
  const current = useRef({ data, height, showAll, onSelect, onViewport });
  const initial = useRef(initialViewport);
  const ends = useRef<maplibregl.Marker[]>([]);
  const focusedId = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    current.current = { data, height, showAll, onSelect, onViewport };
  }, [data, height, showAll, onSelect, onViewport]);

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
      setReady(true);
      reportViewport();
    });
    map.on("sourcedata", event => { if (event.sourceId === "clearances") updateMarkers(); });
    map.on("render", updateMarkers);
    map.on("moveend", reportViewport);
    map.on("error", () => setError("Part of the map couldn’t load. Try reloading; clearance records remain available in the list."));
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
    const showRoutes = awareness.truckRoutes;
    const showRestrictions = awareness.truckRestrictions;
    if (map.getLayer("truck-routes-line")) {
      map.setLayoutProperty("truck-routes-line", "visibility", showRoutes ? "visible" : "none");
    }
    if (map.getLayer("truck-restrictions-line")) {
      map.setLayoutProperty("truck-restrictions-line", "visibility", showRestrictions ? "visible" : "none");
    }
  }, [truckRoutesData, awareness.truckRoutes, awareness.truckRestrictions, ready]);

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
    const source = map?.getSource("drive") as GeoJSONSource | undefined;
    const altSource = map?.getSource("drive-alts") as GeoJSONSource | undefined;
    if (!ready || !map || !source || !altSource) return;
    for (const marker of ends.current) marker.remove();
    ends.current = [];
    if (!drive) {
      source.setData(EMPTY_DRIVE).catch(() => undefined);
      altSource.setData(EMPTY_DRIVE).catch(() => undefined);
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
    }).catch(() => undefined);
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
