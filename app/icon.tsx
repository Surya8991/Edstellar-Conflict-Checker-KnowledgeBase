import { ImageResponse } from "next/og";

// Edstellar Conflict Checker favicon — gradient "CC" mark on dark blue.
// Reuses the SETUP_GUIDE.html visual identity for consistency.

export const runtime = "edge";
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
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
          fontSize: 18,
          fontWeight: 900,
          letterSpacing: -1,
          borderRadius: 6,
        }}
      >
        CC
      </div>
    ),
    { ...size },
  );
}
