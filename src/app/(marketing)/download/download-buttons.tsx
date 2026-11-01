"use client";

import { useEffect, useState } from "react";
import { Bell, Download, Loader2, MonitorSmartphone, RefreshCw, Wifi } from "lucide-react";
import { cn } from "@/lib/utils";
import { brand } from "@/lib/brand";
import { ordered, PLATFORMS, useVisitorOs, type Os } from "@/components/marketing/desktop-platforms";

const REPO = "prabeenbhattarai/PDFella_official";
const RELEASES = `https://github.com/${REPO}/releases/latest`;
/** Fixed-name copies uploaded by .github/workflows/desktop.yml to every release. */
const FILES: Record<Os, string> = { mac: "PDFella-mac.dmg", windows: "PDFella-windows-setup.exe" };

const STEPS: Record<Os, string[]> = {
  mac: ["Open PDFella-mac.dmg", "Drag PDFella into Applications", "Open it from Launchpad or the Dock"],
  windows: ["Run PDFella-windows-setup.exe", "Follow the installer (no admin needed)", "Open PDFella from the Start menu"],
};

type Availability = "checking" | "ready" | "soon";

/** Whether the latest GitHub release has each installer, so we never link to a missing file. */
function useReleases(): Record<Os, Availability> & { version: string | null } {
  const [state, setState] = useState<Record<Os, Availability> & { version: string | null }>({ mac: "checking", windows: "checking", version: null });
  useEffect(() => {
    fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: "application/vnd.github+json" } })
      .then(async (res) => {
        // Rate limited or GitHub down: assume the files are there rather than hiding them.
        if (!res.ok) return setState({ mac: res.status === 404 ? "soon" : "ready", windows: res.status === 404 ? "soon" : "ready", version: null });
        const release = (await res.json()) as { tag_name?: string; assets?: { name: string }[] };
        const has = (name: string) => release.assets?.some((a) => a.name === name) ?? false;
        setState({ mac: has(FILES.mac) ? "ready" : "soon", windows: has(FILES.windows) ? "ready" : "soon", version: release.tag_name?.replace(/^desktop-v/, "") ?? null });
      })
      .catch(() => setState({ mac: "ready", windows: "ready", version: null }));
  }, []);
  return state;
}

export function DownloadButtons() {
  const os = useVisitorOs();
  const releases = useReleases();

  return (
    <>
      <div className="mx-auto mt-14 grid max-w-4xl gap-6 md:grid-cols-2">
        {ordered(os).map((id) => {
          const p = PLATFORMS[id];
          const Logo = p.logo;
          const mine = os === id;
          const status = releases[id];
          return (
            <div key={id} id={id} className={cn("relative flex scroll-mt-28 flex-col rounded-3xl p-7", mine ? "bg-[linear-gradient(160deg,#0f8a71,#063f34)] text-white shadow-[0_30px_70px_-25px_rgb(6_63_52/0.7)]" : "border border-border bg-surface")}>
              {mine && <span className="absolute -top-3.5 left-7 rounded-full bg-[#ffc83d] px-3 py-1 text-[12px] font-bold text-[#3d2b00] shadow-md">Your computer</span>}
              <div className="flex items-center gap-3">
                <span className={cn("flex size-12 items-center justify-center rounded-2xl", mine ? "bg-white/15" : "bg-surface-2")}><Logo className="size-6" /></span>
                <div>
                  <h2 className="text-[20px] font-semibold tracking-tight">{brand.name} for {p.name}</h2>
                  <p className={cn("text-[13px]", mine ? "text-white/75" : "text-ink-3")}>{p.detail}{releases.version ? ` · v${releases.version}` : ""}</p>
                </div>
              </div>
              {status === "soon" ? (
                <span className={cn("mt-7 inline-flex h-12 items-center justify-center gap-2 rounded-xl text-[15px] font-semibold", mine ? "bg-white/15 text-white" : "bg-surface-2 text-ink-3")}>
                  <Bell className="size-4" /> Coming soon
                </span>
              ) : (
                <a href={status === "ready" ? `${RELEASES}/download/${FILES[id]}` : undefined} aria-disabled={status === "checking"}
                  className={cn("mt-7 inline-flex h-12 items-center justify-center gap-2 rounded-xl text-[15px] font-semibold transition", mine ? "bg-white text-[#0b6b57] hover:bg-white/90" : "bg-ink text-bg hover:opacity-90", status === "checking" && "pointer-events-none opacity-70")}>
                  {status === "checking" ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} Download for {p.name}
                </a>
              )}
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
        macOS says the app is from an unidentified developer? Right-click {brand.name} in Applications and choose <strong className="text-ink-2">Open</strong>. On Windows, choose <strong className="text-ink-2">More info → Run anyway</strong>.{" "}
        <a href={RELEASES} className="underline hover:text-ink">All releases</a>
      </p>
    </>
  );
}
