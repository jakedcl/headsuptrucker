import type { Metadata, Viewport } from "next";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";
import "@fontsource/barlow-condensed/800.css";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

export const viewport: Viewport = {
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "Heads Up — clearance map for vans, box trucks, and city haulers",
  description: "Not a trucker GPS. Enter your height and see posted low bridges around NYC, Long Island, southwest Connecticut, and NYC-facing New Jersey. Built for vans, cars, and box trucks. Free, no account.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
