import { Suspense } from "react";
import { SiteHeader } from "@/components/site-header";
import { MapExplorer } from "@/components/map-explorer";
export default function MapPage() { return <><SiteHeader /><Suspense fallback={<p className="loading-message">Loading your map…</p>}><MapExplorer /></Suspense></>; }
