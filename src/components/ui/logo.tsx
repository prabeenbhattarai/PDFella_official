import { brand } from "@/lib/brand";
import { cn } from "@/lib/utils";

/**
 * PDFella mark: a document with a folded corner, a rounded "P" carved into the
 * page, and a gold sparkle on its edge (the "ella": a little polish).
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-10 drop-shadow-[0_3px_6px_rgb(12_122_100/.25)]", className)} aria-hidden>
      <defs>
        <linearGradient id="pdfella-tile" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: "var(--accent)" }} />
          <stop offset="1" style={{ stopColor: "color-mix(in srgb, var(--accent) 70%, black)" }} />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="9" fill="url(#pdfella-tile)" />
      {/* page */}
      <path d="M10.2 6h8.3l5.5 5.5V23.6a2.6 2.6 0 0 1-2.6 2.6H10.2a2.6 2.6 0 0 1-2.6-2.6V8.6A2.6 2.6 0 0 1 10.2 6z" fill="#fff" />
      <path d="M18.5 6v3.9a1.6 1.6 0 0 0 1.6 1.6H24" fill="#cfe9e1" />
      {/* P */}
      <path d="M11.9 22.4V12.2h3.7a3 3 0 0 1 0 6h-3.7" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* sparkle */}
      <path d="M24.4 15.6c.45 2.95 1.55 4.05 4.5 4.5-2.95.45-4.05 1.55-4.5 4.5-.45-2.95-1.55-4.05-4.5-4.5 2.95-.45 4.05-1.55 4.5-4.5z" fill="#ffc83d" stroke="#fff" strokeWidth="1.1" strokeLinejoin="round" />
    </svg>
  );
}

/** Mark + wordmark: "PDF" set solid, "ella" in the italic display serif. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)} aria-label={brand.name}>
      <LogoMark />
      <span className="text-[26px] leading-none tracking-tight" aria-hidden>
        <span className="font-extrabold">PDF</span><span className="font-display text-[31px] text-accent italic">ella</span>
      </span>
    </span>
  );
}
