import { ImageResponse } from "next/og";

export const alt = "Heads' Up — posted clearance map";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "#f7d117",
          color: "#000000",
          fontFamily: "Helvetica, Arial, sans-serif",
          padding: 80,
        }}
      >
        <div style={{ fontSize: 96, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.05 }}>
          Heads&apos; Up
        </div>
        <div
          style={{
            marginTop: 28,
            fontSize: 32,
            fontWeight: 500,
            textAlign: "center",
            maxWidth: 900,
            lineHeight: 1.35,
          }}
        >
          Posted low-bridge clearances for NYC, Long Island, and nearby metros
        </div>
      </div>
    ),
    { ...size },
  );
}