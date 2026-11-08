"use client";

import { Download, MonitorSmartphone, RefreshCw, Wifi } from "lucide-react";
import { cn } from "@/lib/utils";
import { brand } from "@/lib/brand";
import { ordered, PLATFORMS, useVisitorOs, type Os } from "@/components/marketing/desktop-platforms";

const STEPS: Record<Os, string[]> = {
  mac: ["Open PDFella-mac.dmg", "Drag PDFella into Applications", "Open it from Launchpad or the Dock"],
  windows: ["Run PDFella-windows-setup.exe", "Follow the installer (no admin needed)", "Open PDFella from the Start menu"],
};

/** `versions` comes from the CDN on the server; the links go through /download/<os>. */
export function DownloadButtons({ versions }: { versions: Record<Os, string | null> }) {
  const os = useVisitorOs();

  return (
    <>
      <div className="mx-auto mt-14 grid max-w-4xl gap-6 md:grid-cols-2">
        {ordered(os).map((id) => {
          const p = PLATFORMS[id];
          const Logo = p.logo;
          const mine = os === id;
          return (
            <div key={id} id={id} className={cn("relative flex scroll-mt-28 flex-col rounded-3xl p-7", mine ? "bg-[linear-gradient(160deg,#0f8a71,#063f34)] text-white shadow-[0_30px_70px_-25px_rgb(6_63_52/0.7)]" : "border border-border bg-surface")}>
              {mine && <span className="absolute -top-3.5 left-7 rounded-full bg-[#ffc83d] px-3 py-1 text-[12px] font-bold text-[#3d2b00] shadow-md">Your computer</span>}
              <div className="flex items-center gap-3">
                <span className={cn("flex size-12 items-center justify-center rounded-2xl", mine ? "bg-white/15" : "bg-surface-2")}><Logo className="size-6" /></span>
                <div>
                  <h2 className="text-[20px] font-semibold tracking-tight">{brand.name} for {p.name}</h2>
                  <p className={cn("text-[13px]", mine ? "text-white/75" : "text-ink-3")}>{p.detail}{versions[id] ? ` · v${versions[id]}` : ""}</p>
                </div>
              </div>
              <a href={`/download/${id}`} data-testid={`download-${id}`}
                className={cn("mt-7 inline-flex h-12 items-center justify-center gap-2 rounded-xl text-[15px] font-semibold transition", mine ? "bg-white text-[#0b6b57] hover:bg-white/90" : "bg-ink text-bg hover:opacity-90")}>
                <Download className="size-4" /> Download for {p.name}
              </a>
              <ol className={cn("mt-6 space-y-2 border-t pt-5 text-[14px]", mine ? "border-white/15 text-white/90" : "border-border text-ink-2")}>
                {STEPS[id].map((s, i) => (
                  <li key={s} className="flex items-start gap-2.5">
                    <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold", mine ? "bg-white/20" : "bg-accent-soft text-accent")}>{i + 1}</span>{s}
                  </li>
                ))}
              </ol>
            </div>
          );
        })}
      </div>

      <ul className="mx-auto mt-12 grid max-w-4xl gap-4 sm:grid-cols-3">
        {[
          { icon: RefreshCw, t: "Always up to date", d: "New features arrive the moment we ship them. Nothing to reinstall." },
          { icon: Wifi, t: "Needs internet", d: `The app opens ${brand.name} in its own window, so it needs Wi-Fi or a network.` },
          { icon: MonitorSmartphone, t: "Same account", d: "Sign in with Google once: it opens in your browser and returns to the app." },
        ].map(({ icon: I, t, d }) => (
          <li key={t} className="rounded-2xl border border-border bg-surface p-5">
            <I className="size-5 text-accent" aria-hidden />
            <p className="mt-3 text-[15px] font-semibold">{t}</p>
            <p className="mt-1 text-[13.5px] text-ink-3">{d}</p>
          </li>
        ))}
      </ul>

      <p className="mx-auto mt-10 max-w-2xl text-center text-[13px] text-ink-3">
        macOS says it can&apos;t verify {brand.name}? Click <strong className="text-ink-2">Done</strong>, then open <strong className="text-ink-2">System Settings → Privacy &amp; Security</strong>, scroll down and click <strong className="text-ink-2">Open Anyway</strong>. You only do this once. On Windows, choose <strong className="text-ink-2">More info → Run anyway</strong>.
      </p>
    </>
  );
}
