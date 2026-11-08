import type { Metadata } from "next";
import { brand } from "@/lib/brand";
import { DownloadButtons } from "./download-buttons";
import { latestBuild } from "@/lib/desktop-downloads";

/**
 * Desktop app downloads, built by .github/workflows/desktop.yml and served from
 * Vercel Blob through /download/mac and /download/windows.
 */
export const metadata: Metadata = {
  title: "Download the desktop app",
  description: `${brand.name} for macOS and Windows: edit, sign, convert and organise PDFs in its own window.`,
  alternates: { canonical: "/download" },
};

export const revalidate = 300;

export default async function DownloadPage() {
  const [mac, windows] = await Promise.all([latestBuild("mac"), latestBuild("windows")]);
  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[560px] bg-[radial-gradient(60%_60%_at_50%_0%,color-mix(in_srgb,var(--accent)_16%,transparent),transparent)]" aria-hidden />
      <section className="wrap relative pt-20 pb-24 sm:pt-28">
        <div className="mx-auto max-w-3xl text-center">
          <p className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface/80 px-3 py-1 text-[13px] font-semibold text-accent">Desktop app</p>
          <h1 className="mt-5 font-display text-5xl leading-[1.02] tracking-tight sm:text-7xl">{brand.name} for your <span className="text-accent italic">desktop</span></h1>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-ink-2">Every {brand.name} tool in its own window, one click from your Dock or Start menu. Always up to date, and it needs an internet connection.</p>
        </div>
        <DownloadButtons versions={{ mac: mac?.version ?? null, windows: windows?.version ?? null }} />
      </section>
    </div>
  );
}
