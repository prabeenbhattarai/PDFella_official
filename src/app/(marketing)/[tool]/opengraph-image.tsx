import { ImageResponse } from "next/og";
import { getTool, tools, categories } from "@/lib/tools";
import { getContent } from "@/content/seo";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "PDFella PDF tool";

export function generateStaticParams() {
  return tools.map((t) => ({ tool: t.slug }));
}

const CAT: Record<string, string> = { edit: "#e5322d", organise: "#ee7a12", convert: "#1f6feb", optimise: "#0c7a64", security: "#7c3aed", forms: "#d6336c" };

/** Branded share image for each tool page (used by Google Discover, social networks and chat previews). */
export default async function OgImage({ params }: { params: Promise<{ tool: string }> }) {
  const t = getTool((await params).tool)!;
  const c = getContent(t.slug)!;
  const color = CAT[t.category];
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
          <div style={{ marginLeft: "auto", display: "flex", padding: "10px 22px", borderRadius: 999, background: color, color: "#fff", fontSize: 24, fontWeight: 700 }}>{categories[t.category].name}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ fontSize: 84, fontWeight: 800, color: "#15171c", lineHeight: 1.02, letterSpacing: -2 }}>{c.h1}</div>
          <div style={{ fontSize: 32, color: "#353942", lineHeight: 1.35, maxWidth: 980 }}>{c.subtitle}</div>
        </div>
        <div style={{ display: "flex", gap: 30, fontSize: 26, fontWeight: 600, color: "#0c7a64" }}>
          {["Free", "No sign-up", "No watermark", t.engine === "browser" ? "Runs in your browser" : "Files auto-deleted"].map((x) => (
            <div key={x} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 14, height: 14, borderRadius: 999, background: "#0c7a64", display: "flex" }} />{x}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
