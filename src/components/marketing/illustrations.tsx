/**
 * Original, hand-built SVG illustrations for the marketing site.
 * Animations are CSS classes from globals.css that start when an ancestor gets `.in-view`.
 */
import { cn } from "@/lib/utils";

const INK = "var(--ink)";
const CHIP = "var(--ink)";
const CHIP_TEXT = "var(--bg)";

export const FILE_COLORS = { PDF: "#e5322d", DOCX: "#1f6feb", XLSX: "#1f9d55", PPTX: "#e8590c", JPG: "#7c3aed", PNG: "#0ea5a4", TXT: "#5b6170" } as const;

/** A document icon with a folded corner and a format label. */
export function FileIcon({ type = "PDF", className, tilt = 0 }: { type?: keyof typeof FILE_COLORS; className?: string; tilt?: number }) {
  const c = FILE_COLORS[type];
  return (
    <svg viewBox="0 0 52 64" className={cn("drop-shadow-[0_6px_10px_rgb(0_0_0/.15)]", className)} style={{ transform: tilt ? `rotate(${tilt}deg)` : undefined }} aria-hidden>
      <path d="M8 0h28l16 16v42a6 6 0 0 1-6 6H8a6 6 0 0 1-6-6V6a6 6 0 0 1 6-6z" fill={c} />
      <path d="M36 0v11a5 5 0 0 0 5 5h11z" fill="#fff" opacity=".45" />
      <rect x="-2" y="34" width="44" height="17" rx="4" fill="#fff" />
      <text x="20" y="46.5" textAnchor="middle" fontFamily="Inter, Arial, sans-serif" fontWeight="800" fontSize={type.length > 3 ? 10.5 : 12.5} fill={c}>{type}</text>
    </svg>
  );
}

/** Cartoon pointing hand (white glove). */
export function Hand({ x = 0, y = 0, s = 1, className }: { x?: number; y?: number; s?: number; className?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} className={className}>
      <path
        d="M24 4c0-2.2 1.8-4 4-4s4 1.8 4 4v22c0-2 1.8-3.6 3.8-3.6s3.8 1.6 3.8 3.6v2c0-2 1.8-3.6 3.8-3.6s3.8 1.6 3.8 3.6v3c0-2 1.8-3.4 3.6-3.4s3.6 1.4 3.6 3.4v14c0 10-6 18-16 18h-6c-6 0-10-3-13-8l-9-14c-1.2-2-.6-4.4 1.4-5.4s4.2-.4 5.4 1.4l4.2 6L24 40z"
        fill="#fff" stroke={INK} strokeWidth="2.6" strokeLinejoin="round"
      />
      <path d="M37 41v11M43 41v11M49 41v11" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
    </g>
  );
}

/** Text lines on a page. */
function Lines({ x, y, widths, gap = 13, h = 6 }: { x: number; y: number; widths: number[]; gap?: number; h?: number }) {
  return <>{widths.map((w, i) => <rect key={i} x={x} y={y + i * gap} width={w} height={h} rx={h / 2} fill={INK} />)}</>;
}

export function StepUpload() {
  return (
    <svg viewBox="0 0 260 220" className="w-full overflow-visible" aria-hidden>
      <rect x="34" y="14" width="164" height="172" rx="16" fill="var(--surface)" stroke="var(--border)" />
      <rect x="52" y="32" width="128" height="136" rx="8" fill="none" stroke="var(--border-strong)" strokeWidth="2" strokeDasharray="9 7" />
      <g transform="translate(108 78) rotate(-9)">
        <g className="anim-drop" style={{ ["--r" as string]: "0deg", transformBox: "fill-box", transformOrigin: "center" }}>
          <path d="M14 0h52l26 26v76a10 10 0 0 1-10 10H14A10 10 0 0 1 4 102V10A10 10 0 0 1 14 0z" fill="#e5322d" />
          <path d="M66 0v18a8 8 0 0 0 8 8h18z" fill="#fff" opacity=".45" />
          <rect x="-8" y="58" width="76" height="30" rx="7" fill="#fff" stroke="#f1d3d2" />
          <text x="30" y="80" textAnchor="middle" fontFamily="Inter, Arial, sans-serif" fontWeight="800" fontSize="21" fill="#e5322d">PDF</text>
        </g>
      </g>
      <Hand x={160} y={134} s={0.95} />
    </svg>
  );
}

export function StepEdit() {
  return (
    <svg viewBox="0 0 260 220" className="w-full overflow-visible" aria-hidden>
      <g transform="rotate(7 140 110)"><rect x="78" y="34" width="132" height="160" rx="10" fill="var(--surface-3)" /></g>
      <g transform="rotate(-6 130 100)">
        <rect x="64" y="16" width="136" height="168" rx="10" fill="var(--surface)" stroke="var(--border)" />
        <path d="M80 89 H178" stroke="#ffe14d" strokeWidth="13" strokeLinecap="round" className="anim-draw" style={{ ["--len" as string]: "100" }} />
        <Lines x={80} y={34} widths={[98, 92, 96, 88, 98, 96, 84, 94, 62]} gap={14} />
      </g>
      <g transform="translate(176 62) rotate(38)">
        <rect x="0" y="0" width="22" height="52" rx="5" fill="#fff" stroke={INK} strokeWidth="2.6" />
        <rect x="0" y="0" width="22" height="13" rx="5" fill={INK} />
        <path d="M3 52 L11 66 L19 52 Z" fill="#fff" stroke={INK} strokeWidth="2.6" strokeLinejoin="round" />
        <path d="M8 60 L11 66 L14 60 Z" fill="#ffd400" />
      </g>
    </svg>
  );
}

export function StepDownload() {
  const rays = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    return [130 + Math.cos(a) * 104, 104 + Math.sin(a) * 96, 130 + Math.cos(a) * 118, 104 + Math.sin(a) * 110];
  });
  return (
    <svg viewBox="0 0 260 220" className="w-full overflow-visible" aria-hidden>
      <g className="anim-burst" style={{ transformBox: "view-box", transformOrigin: "130px 104px" }}>
        {rays.map(([x1, y1, x2, y2], i) => <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--ink-3)" strokeWidth="2.4" strokeLinecap="round" />)}
      </g>
      <rect x="82" y="22" width="132" height="168" rx="10" fill="var(--surface)" stroke="var(--border)" />
      <Lines x={98} y={42} widths={[96, 90, 98]} gap={14} />
      <Lines x={98} y={150} widths={[90, 62]} gap={14} />
      <g transform="translate(56 82)">
        <g className="anim-press" style={{ transformBox: "fill-box", transformOrigin: "center", transform: "rotate(-4deg)" }}>
          <rect x="0" y="0" width="160" height="50" rx="11" fill="#1aa64b" />
          <rect x="0" y="0" width="160" height="25" rx="11" fill="#fff" opacity=".12" />
          <text x="80" y="33" textAnchor="middle" fontFamily="Inter, Arial, sans-serif" fontWeight="700" fontSize="22" fill="#fff">Download</text>
        </g>
      </g>
      <Hand x={150} y={114} s={0.95} />
    </svg>
  );
}

/** Hand-drawn connecting arrows between steps. */
export function SquiggleArrow({ loop, className }: { loop?: boolean; className?: string }) {
  const d = loop
    ? "M6 34 C 34 26, 66 40, 64 64 C 62 84, 34 82, 38 60 C 42 40, 92 30, 140 32"
    : "M6 40 C 22 22, 40 22, 46 36 S 62 56, 74 40 S 110 30, 140 36";
  return (
    <svg viewBox="0 0 150 90" className={cn("w-full overflow-visible", className)} aria-hidden>
      <path d={d} fill="none" stroke="var(--ink-3)" strokeWidth="2.4" strokeLinecap="round" className="anim-draw" style={{ ["--len" as string]: "220" }} />
      <path d={loop ? "M128 22 L141 32 L128 42" : "M127 26 L141 36 L128 46"} fill="none" stroke="var(--ink-3)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Hero artwork: a fanned stack of documents with real-looking edits and floating file badges. */
export function HeroStack() {
  return (
    <div className="relative mx-auto aspect-[5/4.4] w-full max-w-[640px] select-none" aria-hidden>
      {/* back sheets */}
      <div className="paper float-b absolute top-[9%] left-[24%] h-[78%] w-[52%] rounded-xl shadow-md" style={{ ["--r" as string]: "9deg" }} />
      <div className="paper float-a absolute top-[6%] left-[18%] h-[80%] w-[54%] rounded-xl shadow-md" style={{ ["--r" as string]: "-7deg", animationDelay: "-2s" }} />
      {/* front document */}
      <div className="paper absolute top-[4%] left-[22%] h-[84%] w-[56%] rounded-xl p-[6%] shadow-lg" style={{ transform: "rotate(-1.5deg)" }}>
        <div className="h-[4.5%] w-[62%] rounded bg-ink/85" />
        <div className="mt-[3%] h-[2%] w-[40%] rounded bg-ink-3/50" />
        <div className="mt-[6%] space-y-[2.6%]">
          {[94, 88, 96, 70].map((w, i) => <div key={i} className="h-[2.2%] min-h-[5px] rounded bg-ink/70" style={{ width: `${w}%` }} />)}
        </div>
        <div className="relative mt-[4%]">
          <div className="absolute -inset-x-1 -inset-y-0.5 rounded-sm bg-[#ffe14d]/80" />
          <div className="relative h-[7px] w-[86%] rounded bg-ink/70" />
        </div>
        <div className="mt-[4%] space-y-[2.6%]">
          {[92, 97, 84].map((w, i) => <div key={i} className="h-[2.2%] min-h-[5px] rounded bg-ink/70" style={{ width: `${w}%` }} />)}
        </div>
        <div className="mt-[5%] flex h-[18%] items-center justify-center rounded-lg bg-gradient-to-br from-[#cfe7df] via-[#9cc9bd] to-[#5d8f86]" />
        <svg viewBox="0 0 150 40" className="absolute bottom-[7%] left-[7%] w-[44%]"><path d="M6 30 C 14 6, 22 4, 24 18 S 22 36, 34 22 S 46 4, 52 16 S 54 34, 64 24 C 72 16, 78 10, 84 20 S 92 32, 104 18 C 112 10, 120 14, 126 22 L 144 12" fill="none" stroke="#1f3a8a" strokeWidth="3" strokeLinecap="round" /></svg>
        <div className="absolute right-[7%] bottom-[9%] rotate-[-9deg] rounded-md border-[3px] border-[#1f9d55] px-2 py-0.5 text-[clamp(9px,1.4vw,15px)] font-black tracking-widest text-[#1f9d55]">APPROVED</div>
      </div>
      {/* floating file badges */}
      <div className="float-a absolute top-[2%] left-[2%] w-[13%]" style={{ ["--r" as string]: "-10deg" }}><FileIcon type="PDF" /></div>
      <div className="float-b absolute top-[34%] left-[0%] w-[12%]" style={{ ["--r" as string]: "8deg", animationDelay: "-3s" }}><FileIcon type="DOCX" /></div>
      <div className="float-a absolute top-[6%] right-[3%] w-[12%]" style={{ ["--r" as string]: "10deg", animationDelay: "-1s" }}><FileIcon type="XLSX" /></div>
      <div className="float-b absolute right-[1%] bottom-[22%] w-[12%]" style={{ ["--r" as string]: "-8deg", animationDelay: "-4s" }}><FileIcon type="JPG" /></div>
      <div className="float-a absolute bottom-[3%] left-[8%] w-[12%]" style={{ ["--r" as string]: "6deg", animationDelay: "-5s" }}><FileIcon type="PPTX" /></div>
      {/* action chips */}
      <div className="float-b absolute top-[22%] right-[8%] flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-[12px] font-medium shadow-md" style={{ animationDelay: "-2s" }}>
        <span className="size-2 rounded-full bg-[#1f9d55]" /> Signed
      </div>
      <div className="float-a absolute bottom-[12%] left-[16%] flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-[12px] font-medium shadow-md" style={{ animationDelay: "-3.5s" }}>
        <span className="size-2 rounded-full bg-accent" /> 8.4 MB → 2.1 MB
      </div>
      <div className="float-b absolute top-[52%] right-[12%] flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-[12px] font-medium shadow-md" style={{ animationDelay: "-1.5s" }}>
        <span className="size-2 rounded-full bg-[#ffd400]" /> Text edited
      </div>
    </div>
  );
}

/* ───────────────────────── "Why" section illustrations (same visual language as the steps) */

const PDF_RED = "#e5322d";

export function WhyInstant() {
  return (
    <svg viewBox="0 0 260 200" className="w-full overflow-visible" aria-hidden>
      {/* browser window */}
      <rect x="18" y="22" width="224" height="150" rx="14" fill="var(--surface)" stroke={INK} strokeWidth="2.6" />
      <path d="M18 48 H242" stroke={INK} strokeWidth="2.6" />
      <circle cx="34" cy="35" r="3.6" fill="#ff6159" /><circle cx="46" cy="35" r="3.6" fill="#ffbd2e" /><circle cx="58" cy="35" r="3.6" fill="#28c840" />
      <rect x="76" y="29" width="120" height="12" rx="6" fill="var(--surface-3)" />
      {/* drop zone with a PDF landing */}
      <rect x="36" y="62" width="120" height="94" rx="10" fill="none" stroke="var(--border-strong)" strokeWidth="2" strokeDasharray="8 6" />
      <g transform="translate(74 70) rotate(-8)">
        <g className="anim-drop" style={{ ["--r" as string]: "0deg", transformBox: "fill-box", transformOrigin: "center" }}>
          <path d="M8 0h30l15 15v47a6 6 0 0 1-6 6H8a6 6 0 0 1-6-6V6a6 6 0 0 1 6-6z" fill={PDF_RED} stroke={INK} strokeWidth="2.2" />
          <rect x="-4" y="36" width="42" height="16" rx="4" fill="#fff" stroke={INK} strokeWidth="1.8" />
          <text x="17" y="48" textAnchor="middle" fontFamily="Inter, Arial, sans-serif" fontWeight="800" fontSize="11" fill={PDF_RED}>PDF</text>
        </g>
      </g>
      {/* lightning badge */}
      <g className="anim-drop" style={{ ["--r" as string]: "0deg", transformBox: "fill-box", transformOrigin: "center", animationDelay: "250ms" }}>
        <circle cx="198" cy="98" r="30" fill="#ffd400" stroke={INK} strokeWidth="2.6" />
        <path d="M201 76 L186 101 H198 L194 121 L211 93 H199 Z" fill="#fff" stroke={INK} strokeWidth="2.4" strokeLinejoin="round" />
      </g>
      <g transform="translate(160 140)">
        <rect width="78" height="26" rx="13" fill={CHIP} />
        <text x="39" y="17.5" textAnchor="middle" fontFamily="Inter, Arial, sans-serif" fontWeight="700" fontSize="11.5" fill={CHIP_TEXT}>Ready in 3s</text>
      </g>
    </svg>
  );
}

export function WhyPrivate() {
  return (
    <svg viewBox="0 0 260 200" className="w-full overflow-visible" aria-hidden>
      {/* crossed-out cloud */}
      <g transform="translate(186 10)">
        <path d="M14 34 a12 12 0 0 1 2-24 a16 16 0 0 1 30-3 a12 12 0 0 1 8 27 z" fill="var(--surface)" stroke="var(--ink-3)" strokeWidth="2.4" strokeLinejoin="round" />
        <path d="M6 42 L58 2" stroke={PDF_RED} strokeWidth="3" strokeLinecap="round" />
      </g>
      {/* laptop */}
      <rect x="46" y="46" width="168" height="108" rx="10" fill="var(--surface)" stroke={INK} strokeWidth="2.6" />
      <rect x="56" y="56" width="148" height="88" rx="5" fill="var(--surface-2)" />
      <path d="M26 154 H234 L222 170 H38 Z" fill="var(--surface)" stroke={INK} strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M112 162 H148" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
      {/* document on screen */}
      <rect x="70" y="64" width="58" height="72" rx="5" fill="var(--surface)" stroke={INK} strokeWidth="2.2" />
      {[76, 86, 96, 106, 116].map((y, i) => <rect key={y} x="78" y={y} width={[40, 34, 42, 30, 38][i]} height="4.5" rx="2.2" fill={INK} />)}
      {/* shield with padlock */}
      <g className="anim-drop" style={{ ["--r" as string]: "0deg", transformBox: "fill-box", transformOrigin: "center" }}>
        <path d="M168 62 L196 72 V96 C196 114 184 126 168 132 C152 126 140 114 140 96 V72 Z" fill="var(--accent)" stroke={INK} strokeWidth="2.6" strokeLinejoin="round" />
        <rect x="157" y="92" width="22" height="18" rx="3" fill="#fff" stroke={INK} strokeWidth="2.2" />
        <path d="M162 92 V86 a6 6 0 0 1 12 0 V92" fill="none" stroke={INK} strokeWidth="2.2" />
        <circle cx="168" cy="101" r="2.4" fill={INK} />
      </g>
    </svg>
  );
}

export function WhyRealPdf() {
  return (
    <svg viewBox="0 0 260 200" className="w-full overflow-visible" aria-hidden>
      <g transform="rotate(5 140 100)"><rect x="76" y="20" width="132" height="166" rx="10" fill="var(--surface-3)" /></g>
      <rect x="62" y="14" width="136" height="170" rx="10" fill="var(--surface)" stroke={INK} strokeWidth="2.6" />
      <text x="78" y="46" fontFamily="Georgia, serif" fontWeight="700" fontSize="22" fill={INK}>Aa</text>
      {/* selected live text */}
      <rect x="76" y="58" width="96" height="14" rx="3" fill="var(--accent)" opacity=".25" className="anim-drop" style={{ ["--r" as string]: "0deg" }} />
      <rect x="78" y="62.5" width="90" height="5.5" rx="2.7" fill={INK} />
      <path d="M174 54 V76 M170 54 H178 M170 76 H178" stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round" />
      {[82, 94, 106].map((y, i) => <rect key={y} x="78" y={y} width={[104, 96, 84][i]} height="5.5" rx="2.7" fill={INK} />)}
      {/* vector curve with editing handles */}
      <path d="M84 166 C 102 118, 140 182, 176 134" fill="none" stroke="var(--accent)" strokeWidth="3.2" strokeLinecap="round" className="anim-draw" style={{ ["--len" as string]: "130" }} />
      <path d="M84 166 L102 118 M176 134 L140 182" stroke="var(--ink-3)" strokeWidth="1.6" strokeDasharray="3 3" />
      {[[84, 166], [176, 134]].map(([x, y]) => <rect key={x} x={x - 5} y={y - 5} width="10" height="10" fill="#fff" stroke={INK} strokeWidth="2" />)}
      {[[102, 118], [140, 182]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="4.5" fill="var(--accent)" stroke={INK} strokeWidth="1.8" />)}
      {/* format chips */}
      <g transform="translate(184 40)"><rect width="56" height="22" rx="11" fill={CHIP} /><text x="28" y="15" textAnchor="middle" fontFamily="Inter, Arial, sans-serif" fontWeight="700" fontSize="10.5" fill={CHIP_TEXT}>TEXT</text></g>
      <g transform="translate(186 150)"><rect width="62" height="22" rx="11" fill="var(--accent)" /><text x="31" y="15" textAnchor="middle" fontFamily="Inter, Arial, sans-serif" fontWeight="700" fontSize="10.5" fill="var(--accent-ink)">VECTOR</text></g>
    </svg>
  );
}

export function WhyBigFiles() {
  const angles = [-14, -8, -2, 4];
  return (
    <svg viewBox="0 0 260 200" className="w-full overflow-visible" aria-hidden>
      {angles.map((a, i) => (
        <g key={a} transform={`rotate(${a} 120 190)`}>
          <rect x="70" y="26" width="100" height="136" rx="8" fill={i === angles.length - 1 ? "var(--surface)" : "var(--surface-2)"} stroke={i === angles.length - 1 ? INK : "var(--border-strong)"} strokeWidth={i === angles.length - 1 ? 2.6 : 2} />
        </g>
      ))}
      <g transform="rotate(10 120 190)">
        <rect x="70" y="26" width="100" height="136" rx="8" fill="var(--surface)" stroke={INK} strokeWidth="2.6" />
        <Lines x={84} y={44} widths={[56, 70, 64, 72, 50]} gap={13} h={5} />
        <rect x="84" y="114" width="72" height="34" rx="4" fill="#cfe7df" stroke={INK} strokeWidth="1.8" />
      </g>
      {/* smooth-scroll track */}
      <rect x="214" y="30" width="10" height="140" rx="5" fill="var(--surface-3)" />
      <rect x="214" y="58" width="10" height="34" rx="5" fill="var(--accent)" className="anim-drop" style={{ ["--r" as string]: "0deg" }} />
      {/* page-count badge */}
      <g className="anim-drop" style={{ ["--r" as string]: "0deg", transformBox: "fill-box", transformOrigin: "center", animationDelay: "200ms" }}>
        <rect x="16" y="120" width="92" height="40" rx="12" fill={CHIP} />
        <text x="62" y="138" textAnchor="middle" fontFamily="Georgia, serif" fontWeight="700" fontSize="17" fill={CHIP_TEXT}>500</text>
        <text x="62" y="153" textAnchor="middle" fontFamily="Inter, Arial, sans-serif" fontWeight="600" fontSize="9.5" fill={CHIP_TEXT} opacity=".75">PAGES, NO LAG</text>
      </g>
    </svg>
  );
}


/* ───────────────────────── Security section illustrations */

function Chip({ x, y, w, label, accent }: { x: number; y: number; w: number; label: string; accent?: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width={w} height="24" rx="12" fill={accent ? "var(--accent)" : CHIP} />
      <text x={w / 2} y="16" textAnchor="middle" fontFamily="Inter, Arial, sans-serif" fontWeight="700" fontSize="10.5" fill={accent ? "var(--accent-ink)" : CHIP_TEXT}>{label}</text>
    </g>
  );
}

export function SecLocal() {
  return (
    <svg viewBox="0 0 260 200" className="w-full overflow-visible" aria-hidden>
      {/* monitor */}
      <rect x="30" y="22" width="190" height="124" rx="12" fill="var(--surface)" stroke={INK} strokeWidth="2.6" />
      <path d="M108 146 L102 168 H148 L142 146" fill="var(--surface)" stroke={INK} strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M90 170 H160" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
      {/* document being edited */}
      <rect x="58" y="38" width="76" height="92" rx="6" fill="var(--surface-2)" stroke={INK} strokeWidth="2.2" />
      <Lines x={68} y={50} widths={[52, 44, 56, 38]} gap={12} h={4.5} />
      <path d="M68 104 H112" stroke="#ffe14d" strokeWidth="9" strokeLinecap="round" className="anim-draw" style={{ ["--len" as string]: "50" }} />
      <rect x="68" y="101.5" width="40" height="4.5" rx="2.2" fill={INK} />
      {/* pen */}
      <g transform="translate(140 66) rotate(40)">
        <rect x="0" y="0" width="14" height="44" rx="4" fill="var(--accent)" stroke={INK} strokeWidth="2.2" />
        <path d="M2 44 L7 56 L12 44 Z" fill="var(--surface)" stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
      </g>
      {/* no upload */}
      <g transform="translate(196 6)" className="anim-drop" style={{ ["--r" as string]: "0deg", transformBox: "fill-box", transformOrigin: "center" }}>
        <circle cx="22" cy="22" r="21" fill="var(--surface)" stroke={INK} strokeWidth="2.4" />
        <path d="M22 32 V13 M14 20 L22 12 L30 20" fill="none" stroke={INK} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8 36 L36 8" stroke={PDF_RED} strokeWidth="3" strokeLinecap="round" />
      </g>
      <Chip x={150} y={156} w={98} label="On your device" accent />
    </svg>
  );
}

export function SecDelete() {
  return (
    <svg viewBox="0 0 260 200" className="w-full overflow-visible" aria-hidden>
      {/* document dropping into the bin */}
      <g transform="translate(96 4) rotate(-14)">
        <g className="anim-drop" style={{ ["--r" as string]: "0deg", transformBox: "fill-box", transformOrigin: "center" }}>
          <rect x="0" y="0" width="50" height="62" rx="5" fill="var(--surface)" stroke={INK} strokeWidth="2.2" />
          <Lines x={8} y={10} widths={[30, 34, 26, 32]} gap={10} h={4} />
        </g>
      </g>
      {/* bin */}
      <path d="M78 84 H182" stroke={INK} strokeWidth="2.8" strokeLinecap="round" />
      <path d="M112 84 V76 a4 4 0 0 1 4 -4 h28 a4 4 0 0 1 4 4 V84" fill="none" stroke={INK} strokeWidth="2.6" />
      <path d="M88 90 L96 176 a6 6 0 0 0 6 5 h56 a6 6 0 0 0 6 -5 L172 90 Z" fill="var(--surface)" stroke={INK} strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M112 104 L115 164 M130 104 V164 M148 104 L145 164" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
      {/* timer */}
      <g transform="translate(184 26)">
        <circle cx="26" cy="30" r="26" fill="var(--surface)" stroke={INK} strokeWidth="2.6" />
        <path d="M20 2 H32 M26 2 V5" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
        <path d="M26 30 L26 14" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
        <path d="M26 30 L37 36" stroke="var(--accent)" strokeWidth="2.6" strokeLinecap="round" />
        <circle cx="26" cy="30" r="2.6" fill={INK} />
      </g>
      <Chip x={176} y={92} w={70} label="60 min" accent />
    </svg>
  );
}

export function SecEncrypted() {
  const packet = (x: number, y: number) => (
    <g transform={`translate(${x} ${y})`}>
      <rect width="56" height="26" rx="8" fill="var(--surface)" stroke={INK} strokeWidth="2.2" />
      <text x="28" y="17.5" textAnchor="middle" fontFamily="ui-monospace, Menlo, monospace" fontWeight="700" fontSize="11" fill="var(--ink-2)">#9f2a</text>
    </g>
  );
  return (
    <svg viewBox="0 0 260 200" className="w-full overflow-visible" aria-hidden>
      <path d="M44 100 H216" stroke="var(--border-strong)" strokeWidth="2.4" strokeDasharray="5 6" className="anim-draw" style={{ ["--len" as string]: "180" }} />
      {packet(8, 62)}
      {packet(8, 112)}
      {packet(196, 62)}
      {packet(196, 112)}
      {/* padlock */}
      <g className="anim-drop" style={{ ["--r" as string]: "0deg", transformBox: "fill-box", transformOrigin: "center" }}>
        <path d="M108 86 V64 a22 22 0 0 1 44 0 V86" fill="none" stroke={INK} strokeWidth="6" strokeLinecap="round" />
        <path d="M108 86 V64 a22 22 0 0 1 44 0 V86" fill="none" stroke="var(--surface)" strokeWidth="1.6" strokeLinecap="round" opacity=".5" />
        <rect x="92" y="84" width="76" height="70" rx="12" fill="var(--accent)" stroke={INK} strokeWidth="2.6" />
        <circle cx="130" cy="112" r="8" fill="var(--surface)" stroke={INK} strokeWidth="2.2" />
        <path d="M130 118 V134" stroke={INK} strokeWidth="5" strokeLinecap="round" />
      </g>
      <Chip x={86} y={168} w={88} label="TLS · AES-256" />
    </svg>
  );
}

export function SecNoTraining() {
  return (
    <svg viewBox="0 0 260 200" className="w-full overflow-visible" aria-hidden>
      <g transform="rotate(-5 120 100)"><rect x="70" y="26" width="110" height="146" rx="10" fill="var(--surface-3)" /></g>
      <rect x="62" y="20" width="114" height="150" rx="10" fill="var(--surface)" stroke={INK} strokeWidth="2.6" />
      <Lines x={76} y={38} widths={[70, 84, 62, 80, 74, 56]} gap={13} h={5} />
      <rect x="76" y="122" width="86" height="34" rx="5" fill="#cfe7df" stroke={INK} strokeWidth="1.8" />
      {/* AI sparkle, prohibited */}
      <g transform="translate(160 58)" className="anim-drop" style={{ ["--r" as string]: "0deg", transformBox: "fill-box", transformOrigin: "center" }}>
        <circle cx="34" cy="34" r="32" fill="var(--surface)" stroke={INK} strokeWidth="2.6" />
        <path d="M34 14 C36 26 42 32 54 34 C42 36 36 42 34 54 C32 42 26 36 14 34 C26 32 32 26 34 14 Z" fill="#ffd400" stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
        <path d="M12 56 L56 12" stroke={PDF_RED} strokeWidth="4" strokeLinecap="round" />
      </g>
      <Chip x={146} y={150} w={102} label="Not for training" />
    </svg>
  );
}
