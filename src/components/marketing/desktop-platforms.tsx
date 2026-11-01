"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, RefreshCw, Wifi } from "lucide-react";
import { cn } from "@/lib/utils";
import { brand } from "@/lib/brand";

/** The desktop app (desktop/), shared by the header's Desktop menu and /download. */
export type Os = "mac" | "windows";

export function AppleLogo({ className }: { className?: string }) {
  return <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden><path d="M16.37 12.6c-.02-2.2 1.8-3.26 1.88-3.31-1.03-1.5-2.62-1.7-3.18-1.73-1.35-.14-2.64.8-3.33.8-.69 0-1.74-.78-2.87-.76-1.47.02-2.83.86-3.59 2.18-1.54 2.66-.39 6.6 1.1 8.76.73 1.06 1.6 2.24 2.73 2.2 1.1-.05 1.51-.7 2.84-.7 1.32 0 1.7.7 2.86.68 1.18-.02 1.93-1.07 2.65-2.13.84-1.22 1.18-2.41 1.2-2.47-.03-.01-2.27-.87-2.29-3.52zM14.2 6.13c.6-.73 1.01-1.75.9-2.76-.87.04-1.92.58-2.54 1.31-.56.64-1.05 1.67-.92 2.66.97.08 1.96-.49 2.56-1.21z" /></svg>;
}

export function WindowsLogo({ className }: { className?: string }) {
  return <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden><path d="M3 5.1 10.4 4v7.2H3zm8.3-1.2L21 2.5v8.7h-9.7zM3 12.6h7.4v7.2L3 18.8zm8.3 0H21v8.9l-9.7-1.4z" /></svg>;
}

export const PLATFORMS: Record<Os, { name: string; logo: typeof AppleLogo; detail: string }> = {
  mac: { name: "macOS", logo: AppleLogo, detail: "Apple silicon & Intel · macOS 11+" },
  windows: { name: "Windows", logo: WindowsLogo, detail: "Windows 10 & 11 · 64-bit" },
};

/** The visitor's desktop OS, or null (phones, Linux, before hydration). */
export function useVisitorOs(): Os | null {
  const [os, setOs] = useState<Os | null>(null);
  useEffect(() => {
    const ua = navigator.userAgent;
    if (/iPhone|iPad|Android/.test(ua)) return;
    setOs(/Mac/.test(ua) ? "mac" : /Windows/.test(ua) ? "windows" : null);
  }, []);
  return os;
}

/** Your computer's OS first. */
export const ordered = (os: Os | null): Os[] => (os === "windows" ? ["windows", "mac"] : ["mac", "windows"]);

/** The header's Desktop mega menu. */
export function DesktopMenu({ onNavigate }: { onNavigate: () => void }) {
  const os = useVisitorOs();
  return (
    <div className="w-[560px] p-2">
      <div className="flex items-start justify-between px-2 pt-1 pb-3">
        <div>
          <p className="text-[15px] font-semibold text-ink">{brand.name} for desktop</p>
          <p className="text-[13px] text-ink-3">Every tool in its own window, one click from your Dock or Start menu.</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {ordered(os).map((id) => {
          const p = PLATFORMS[id];
          const Logo = p.logo;
          const mine = os === id;
          return (
            <Link key={id} href={`/download#${id}`} onClick={onNavigate}
              className={cn(
                "group relative flex flex-col rounded-xl p-4 transition",
                mine
                  ? "bg-[linear-gradient(160deg,#0f8a71,#063f34)] text-white shadow-[0_14px_30px_-14px_rgb(6_63_52/0.7)] hover:brightness-110"
                  : "border border-border hover:border-border-strong hover:bg-surface-2",
              )}>
              {mine && <span className="absolute top-3 right-3 rounded-full bg-[#ffc83d] px-2 py-0.5 text-[10.5px] font-bold text-[#3d2b00]">Your computer</span>}
              <span className={cn("flex size-10 items-center justify-center rounded-xl", mine ? "bg-white/15" : "bg-surface-2 text-ink")}><Logo className="size-5" /></span>
              <span className="mt-3 text-[15px] font-semibold">{p.name}</span>
              <span className={cn("text-[12.5px]", mine ? "text-white/75" : "text-ink-3")}>{p.detail}</span>
              <span className={cn("mt-3 inline-flex items-center gap-1 text-[13px] font-semibold", mine ? "text-white" : "text-accent")}>
                Download <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          );
        })}
      </div>
      <div className="mt-2 flex items-center justify-between rounded-lg bg-surface-2 px-4 py-2.5 text-[12.5px] text-ink-3">
        <span className="flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5"><RefreshCw className="size-3.5" /> Always up to date</span>
          <span className="inline-flex items-center gap-1.5"><Wifi className="size-3.5" /> Needs internet</span>
        </span>
        <Link href="/download" onClick={onNavigate} className="font-semibold text-accent hover:underline">All downloads</Link>
      </div>
    </div>
  );
}
