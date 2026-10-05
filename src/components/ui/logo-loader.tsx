"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { LogoMark } from "./logo";
import { cn } from "@/lib/utils";

/**
 * Branded loading state: the PDFella mark breathing inside a spinning ring,
 * with a short status line. `overlay` covers the whole viewport (used while
 * handing a file to the editor so the page never looks frozen). The overlay is
 * portalled to <body> because a transformed ancestor would trap `fixed`.
 */
export function LogoLoader({ label = "Opening your document…", hint, overlay = false, className }: { label?: string; hint?: string; overlay?: boolean; className?: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const ui = (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex flex-col items-center justify-center gap-5 text-center",
        overlay ? "fixed inset-0 z-[100] bg-bg/85 backdrop-blur-md animate-fade-in" : "min-h-dvh bg-bg",
        className,
      )}
    >
      <div className="relative grid size-28 place-items-center">
        <span className="absolute inset-0 rounded-full bg-accent/10 blur-xl" aria-hidden />
        <svg viewBox="0 0 100 100" className="absolute inset-0 size-full animate-spin [animation-duration:1.1s] motion-reduce:animate-none" aria-hidden>
          <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" strokeWidth="3" className="text-border" />
          <circle cx="50" cy="50" r="46" fill="none" stroke="var(--accent)" strokeWidth="3.5" strokeLinecap="round" strokeDasharray="70 220" />
        </svg>
        <LogoMark className="logo-breathe size-14" />
      </div>
      <div className="space-y-1.5">
        <p className="text-[17px] font-semibold text-ink">{label}</p>
        {hint && <p className="max-w-xs text-sm font-medium text-ink-3">{hint}</p>}
      </div>
      <div className="h-1 w-44 overflow-hidden rounded-full bg-border" aria-hidden>
        <div className="loader-bar h-full w-1/3 rounded-full bg-accent" />
      </div>
    </div>
  );
  if (!overlay) return ui;
  return mounted ? createPortal(ui, document.body) : null;
}
