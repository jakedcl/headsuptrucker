import type { Metadata, Viewport } from "next";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";
import { SafetyDisclaimerModal } from "@/components/safety-disclaimer-modal";

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: "#f7d117",
  colorScheme: "light",
};

const siteUrl = "https://headsuptrucker.vercel.app";
const siteDescription =
  "Not a trucker GPS. Enter your height and see posted low bridges around NYC, Long Island, the Hudson Valley, southwest Connecticut, and NYC-facing New Jersey. Built for vans, cars, and box trucks. Free, no account.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Heads' Up — clearance map for vans, box trucks, and city haulers",
  description: siteDescription,
  applicationName: "Heads' Up",
  robots: { index: false, follow: false },
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "Heads' Up",
    title: "Heads' Up",
    description: siteDescription,
  },
  twitter: {
    card: "summary_large_image",
    title: "Heads' Up",
    description: siteDescription,
  },
  appleWebApp: {
    capable: true,
    title: "Heads' Up",
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
  },
  // iOS Safari still keys off this name for Add to Home Screen standalone mode.
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <SafetyDisclaimerModal />
      </body>
    </html>
  );
}
