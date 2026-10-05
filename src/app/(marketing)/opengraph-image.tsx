import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "PDFella: free online PDF editor";

export default function OgImage() {
  const files: [string, string][] = [["PDF", "#e5322d"], ["DOCX", "#1f6feb"], ["XLSX", "#1f9d55"], ["JPG", "#7c3aed"]];
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "#f7f7f4", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <svg width="56" height="56" viewBox="0 0 32 32">
            <rect x="1" y="1" width="30" height="30" rx="9" fill="#0c7a64" />
            <path d="M10.2 6h8.3l5.5 5.5V23.6a2.6 2.6 0 0 1-2.6 2.6H10.2a2.6 2.6 0 0 1-2.6-2.6V8.6A2.6 2.6 0 0 1 10.2 6z" fill="#fff" />
            <path d="M18.5 6v3.9a1.6 1.6 0 0 0 1.6 1.6H24" fill="#cfe9e1" />
            <path d="M11.9 22.4V12.2h3.7a3 3 0 0 1 0 6h-3.7" fill="none" stroke="#0c7a64" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M24.2 17.4c.35 2.3 1.2 3.15 3.5 3.5-2.3.35-3.15 1.2-3.5 3.5-.35-2.3-1.2-3.15-3.5-3.5 2.3-.35 3.15-1.2 3.5-3.5z" fill="#ffc83d" stroke="#fff" strokeWidth="1" />
          </svg>
          <div style={{ display: "flex", fontSize: 38, color: "#15171c" }}><span style={{ fontWeight: 800 }}>PDF</span><span style={{ color: "#0c7a64", fontStyle: "italic", fontWeight: 600 }}>ella</span></div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 92, fontWeight: 800, color: "#15171c", lineHeight: 1, letterSpacing: -2 }}>Free online PDF editor</div>
          <div style={{ fontSize: 34, color: "#353942" }}>Edit text, sign, convert, compress and organise PDFs in your browser.</div>
        </div>
        <div style={{ display: "flex", gap: 18 }}>
          {files.map(([l, c]) => <div key={l} style={{ display: "flex", padding: "12px 26px", borderRadius: 14, background: c, color: "#fff", fontSize: 28, fontWeight: 800 }}>{l}</div>)}
        </div>
      </div>
    ),
    size,
  );
}
