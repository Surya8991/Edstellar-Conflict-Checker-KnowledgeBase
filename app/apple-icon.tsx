import { ImageResponse } from "next/og";

// 180x180 PNG used by iOS home-screen, macOS share sheets, and other contexts
// that prefer a larger icon than the favicon.

export const runtime = "edge";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #7c9cff, #22d3ee)",
          color: "#0b1020",
          fontSize: 96,
          fontWeight: 900,
          letterSpacing: -4,
          borderRadius: 36,
        }}
      >
        CC
      </div>
    ),
    { ...size },
  );
}
