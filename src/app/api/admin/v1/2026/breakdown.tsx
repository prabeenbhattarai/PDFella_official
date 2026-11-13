"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Globe2, Link2, Loader2, Monitor, MousePointerClick, FileText } from "lucide-react";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { cn } from "@/lib/utils";
import { currentIdToken } from "@/lib/auth/firebase";
import type { Count, Insights } from "@/lib/server/admin";

type Part<T> = { data: T } | { error: string };
export interface Breakdown { traffic: Part<Insights>; accounts: Part<Record<string, number>> }
type Metric = "visitors" | "signedIn" | "accounts";

const fmt = (n: number) => n.toLocaleString();
const regionName = (() => {
  let names: Intl.DisplayNames | null = null;
  try { names = new Intl.DisplayNames(["en"], { type: "region" }); } catch { /* old browser */ }
  return (code: string) => { try { return names?.of(code) ?? code; } catch { return code; } };
})();
/** 🇳🇵 from "NP". */
const flag = (code: string) => (/^[A-Z]{2}$/.test(code) ? String.fromCodePoint(...[...code].map((c) => 0x1f1a5 + c.charCodeAt(0))) : "🏳️");

/** Shade for a value: the surface colour at 0, full accent at the maximum (square-root scale so small countries still show). */
const shade = (v: number, max: number) =>
  v <= 0 || max <= 0 ? "var(--surface-2)" : `color-mix(in srgb, var(--accent) ${Math.round(18 + 82 * Math.sqrt(v / max))}%, var(--surface-2))`;

interface Shape { code: string; name: string; d: string }

/** Country outlines, projected once. The map data (~100 KB) only loads on the admin page. */
function useWorld(width: number, height: number) {
  const [shapes, setShapes] = useState<Shape[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    Promise.all([import("d3-geo"), import("topojson-client"), import("world-atlas/countries-110m.json"), import("i18n-iso-countries")]).then(([d3, topo, world, iso]) => {
      if (cancelled) return;
      const topology = (world.default ?? world) as unknown as Parameters<typeof topo.feature>[0] & { objects: { countries: Parameters<typeof topo.feature>[1] } };
      const all = topo.feature(topology, topology.objects.countries) as unknown as FeatureCollection<Geometry, { name: string }>;
      const land = { ...all, features: all.features.filter((f) => f.id !== "010") }; // no Antarctica
      const projection = d3.geoEqualEarth().fitSize([width, height], land);
      const path = d3.geoPath(projection);
      const toAlpha2 = (f: Feature<Geometry, { name: string }>) =>
        (f.id && (iso.default ?? iso).numericToAlpha2(String(f.id))) || (f.properties.name === "Kosovo" ? "XK" : "");
      setShapes(land.features.map((f) => ({ code: toAlpha2(f) ?? "", name: f.properties.name, d: path(f) ?? "" })));
    });
    return () => { cancelled = true; };
  }, [width, height]);
  return shapes;
}

function WorldMap({ values, metric, rows }: { values: Record<string, number>; metric: Metric; rows: Map<string, { visitors: number; signedIn: number; accounts: number }> }) {
  const W = 960, H = 470;
  const shapes = useWorld(W, H);
  const box = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ code: string; name: string; x: number; y: number } | null>(null);
  const max = Math.max(0, ...Object.values(values));

  const show = (e: React.PointerEvent, s: Shape) => {
    const r = box.current!.getBoundingClientRect();
    setTip({ code: s.code, name: s.code ? regionName(s.code) : s.name, x: e.clientX - r.left, y: e.clientY - r.top });
  };
  const row = tip ? rows.get(tip.code) : undefined;

  return (
    <div ref={box} className="relative" onPointerLeave={() => setTip(null)}>
      {!shapes ? (
        <div className="flex aspect-[960/470] items-center justify-center text-ink-3"><Loader2 className="size-5 animate-spin" aria-label="Loading map" /></div>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="World map of users by country">
          {shapes.map((s, i) => (
            <path key={`${s.code}-${i}`} d={s.d} fill={shade(values[s.code] ?? 0, max)}
              className={cn("stroke-border transition-[fill,opacity] [stroke-width:0.6]", tip && tip.code === s.code && "stroke-ink [stroke-width:1.2]")}
              onPointerMove={(e) => show(e, s)} onPointerDown={(e) => show(e, s)} />
          ))}
        </svg>
      )}
      {tip && (
        <div className="pointer-events-none absolute z-10 min-w-44 rounded-xl border border-border bg-surface px-3 py-2.5 text-[12.5px] shadow-lg"
          style={{ left: Math.min(tip.x + 14, (box.current?.clientWidth ?? 0) - 190), top: Math.max(0, tip.y - 12) }}>
          <p className="mb-1.5 flex items-center gap-1.5 text-[13.5px] font-semibold text-ink"><span aria-hidden>{flag(tip.code)}</span>{tip.name}</p>
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 text-ink-2">
            <dt>Visitors</dt><dd className={cn("text-right tabular-nums", metric === "visitors" && "font-semibold text-ink")}>{fmt(row?.visitors ?? 0)}</dd>
            <dt>Signed in</dt><dd className={cn("text-right tabular-nums", metric === "signedIn" && "font-semibold text-ink")}>{fmt(row?.signedIn ?? 0)}</dd>
            <dt>Accounts</dt><dd className={cn("text-right tabular-nums", metric === "accounts" && "font-semibold text-ink")}>{fmt(row?.accounts ?? 0)}</dd>
          </dl>
        </div>
      )}
      {shapes && (
        <div className="mt-3 flex items-center gap-2 text-[11.5px] text-ink-3">
          <span>0</span>
          <span className="h-2 w-40 rounded-full" style={{ background: "linear-gradient(90deg, var(--surface-2), var(--accent))" }} aria-hidden />
          <span>{fmt(max)}</span>
        </div>
      )}
    </div>
  );
}

function Panel({ icon: Icon, title, children, className }: { icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border border-border bg-surface p-4 sm:p-5", className)}>
      <h3 className="mb-3 flex items-center gap-2 text-[13px] font-medium text-ink-3"><Icon className="size-4" aria-hidden /> {title}</h3>
      {children}
    </section>
  );
}

/** A ranked list with proportional bars. */
function Bars({ rows, label = (k) => k, empty }: { rows: Count[]; label?: (key: string) => React.ReactNode; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.visitors));
  if (!rows.length) return <p className="py-4 text-center text-[13px] text-ink-3">{empty}</p>;
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => (
        <li key={r.key} className="relative overflow-hidden rounded-lg px-2.5 py-1.5 text-[13.5px]">
          <span className="absolute inset-y-0 left-0 rounded-lg bg-accent-soft" style={{ width: `${(r.visitors / max) * 100}%` }} aria-hidden />
          <span className="relative flex items-center justify-between gap-3">
            <span className="min-w-0 truncate text-ink">{label(r.key)}</span>
            <span className="shrink-0 text-ink-2 tabular-nums">{fmt(r.visitors)}<span className="ml-1.5 text-[11.5px] text-ink-3">{fmt(r.views)} views</span></span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function Trend({ daily }: { daily: Insights["daily"] }) {
  const max = Math.max(1, ...daily.map((d) => d.visitors));
  return (
    <div>
      <div className="flex h-28 items-end gap-[3px]" role="img" aria-label={`Visitors per day: ${daily.map((d) => `${d.date} ${d.visitors}`).join(", ")}`}>
        {daily.map((d) => (
          <div key={d.date} className="group relative flex-1">
            <div className="rounded-t bg-accent/75 transition-colors group-hover:bg-accent" style={{ height: `${Math.max(2, (d.visitors / max) * 112)}px` }} />
            <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded bg-ink px-1.5 py-0.5 text-[11px] whitespace-nowrap text-bg group-hover:block">{d.date.slice(5)}: {fmt(d.visitors)} visitors · {fmt(d.views)} views</span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-ink-3"><span>{daily[0]?.date.slice(5)}</span><span>today</span></div>
    </div>
  );
}

const METRICS: { id: Metric; label: string }[] = [{ id: "visitors", label: "Visitors" }, { id: "signedIn", label: "Signed in" }, { id: "accounts", label: "Accounts" }];

/** Countries (map + list), traffic sources, pages and devices. Reads /api/admin/v1/2026/breakdown. */
export function BreakdownSection({ days, label, refreshKey }: { days: 1 | 7 | 30; label: string; refreshKey: number }) {
  const [data, setData] = useState<Breakdown | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const token = await currentIdToken();
        const res = await fetch(`/api/admin/v1/2026/breakdown?days=${days}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
        const body = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok || !body) setError(body?.message ?? `The server returned an error (${res.status}).`);
        else { setError(null); setData(body); }
      } catch {
        if (!cancelled) setError("The request didn't reach the server.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [days, refreshKey]);

  return <BreakdownView data={data} error={error} loading={loading} label={label} />;
}

/** The section itself, given the breakdown response. */
export function BreakdownView({ data, error, loading, label }: { data: Breakdown | null; error: string | null; loading: boolean; label: string }) {
  const [metric, setMetric] = useState<Metric>("visitors");
  const traffic = data && "data" in data.traffic ? data.traffic.data : null;
  const accounts = data && "data" in data.accounts ? data.accounts.data : null;

  const rows = useMemo(() => {
    const m = new Map<string, { visitors: number; signedIn: number; accounts: number }>();
    for (const c of traffic?.countries ?? []) m.set(c.code, { visitors: c.visitors, signedIn: c.signedIn, accounts: 0 });
    for (const [code, n] of Object.entries(accounts ?? {})) m.set(code, { visitors: 0, signedIn: 0, ...m.get(code), accounts: n });
    return m;
  }, [traffic, accounts]);
  const values = useMemo(() => Object.fromEntries([...rows].map(([code, r]) => [code, r[metric]])), [rows, metric]);
  const ranked = [...rows].filter(([, r]) => r[metric] > 0).sort((a, b) => b[1][metric] - a[1][metric]);
  const total = ranked.reduce((n, [, r]) => n + r[metric], 0);

  return (
    <>
      <div className="mt-10 flex flex-wrap items-end justify-between gap-3">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink">Countries · {metric === "accounts" ? "all time" : label} {loading && <Loader2 className="size-3.5 animate-spin" aria-label="Loading" />}</h2>
        <div className="flex rounded-xl border border-border bg-surface p-1" role="tablist" aria-label="Map shows">
          {METRICS.map((m) => (
            <button key={m.id} role="tab" aria-selected={metric === m.id} onClick={() => setMetric(m.id)}
              className={cn("rounded-lg px-3 py-1.5 text-[13px] font-medium", metric === m.id ? "bg-ink text-bg" : "text-ink-3 hover:text-ink")}>{m.label}</button>
          ))}
        </div>
      </div>
      {error && <p role="alert" className="mt-3 rounded-xl bg-danger/10 px-4 py-3 text-[13.5px] text-danger">{error}</p>}
      {data && "error" in data.traffic && metric !== "accounts" && <p className="mt-3 rounded-xl border border-dashed border-border-strong bg-surface p-4 text-[13.5px] text-ink-3">{data.traffic.error}</p>}
      {traffic?.notes.map((n) => <p key={n} className="mt-3 rounded-xl border border-dashed border-border-strong bg-surface px-4 py-2.5 text-[12.5px] text-ink-3">Couldn&apos;t load {n}</p>)}
      {data && "error" in data.accounts && metric === "accounts" && <p className="mt-3 rounded-xl border border-dashed border-border-strong bg-surface p-4 text-[13.5px] text-ink-3">{data.accounts.error}</p>}

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Panel icon={Globe2} title="Where people are">
          <WorldMap values={values} metric={metric} rows={rows} />
        </Panel>
        <Panel icon={Globe2} title={`Top countries · ${fmt(total)} ${METRICS.find((m) => m.id === metric)!.label.toLowerCase()}`}>
          {ranked.length === 0 ? <p className="py-4 text-center text-[13px] text-ink-3">{metric === "accounts" ? "Countries appear as signed-in people come back." : "No visits in this period."}</p> : (
            <ol className="max-h-[420px] space-y-1 overflow-y-auto pr-1">
              {ranked.map(([code, r], i) => (
                <li key={code} className="relative overflow-hidden rounded-lg px-2.5 py-1.5 text-[13.5px]">
                  <span className="absolute inset-y-0 left-0 rounded-lg bg-accent-soft" style={{ width: `${(r[metric] / ranked[0][1][metric]) * 100}%` }} aria-hidden />
                  <span className="relative flex items-center gap-2">
                    <span className="w-5 text-right text-[11.5px] text-ink-3 tabular-nums">{i + 1}</span>
                    <span aria-hidden>{flag(code)}</span>
                    <span className="min-w-0 flex-1 truncate text-ink">{regionName(code)}</span>
                    <span className="text-ink-2 tabular-nums">{fmt(r[metric])}</span>
                    <span className="w-10 text-right text-[11.5px] text-ink-3 tabular-nums">{total ? Math.round((r[metric] / total) * 100) : 0}%</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>

      {traffic && (
        <>
          <h2 className="mt-8 text-[15px] font-semibold text-ink">Traffic · {label}</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <Panel icon={Link2} title="Where visitors came from">
              <Bars rows={traffic.sources} empty="No visits in this period." label={(k) => (k === "Direct" ? <span className="text-ink-2">Direct or bookmarked</span> : k)} />
            </Panel>
            <Panel icon={FileText} title="Most visited pages">
              <Bars rows={traffic.pages} empty="No visits in this period." label={(k) => <span className="font-mono text-[12.5px]">{k}</span>} />
            </Panel>
            <Panel icon={Monitor} title="Devices">
              <Bars rows={traffic.devices} empty="No data yet." />
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div><p className="mb-1.5 text-[12px] font-medium text-ink-3">Browsers</p><Bars rows={traffic.browsers} empty="No data yet." /></div>
                <div><p className="mb-1.5 text-[12px] font-medium text-ink-3">Systems</p><Bars rows={traffic.systems} empty="No data yet." /></div>
              </div>
            </Panel>
            <Panel icon={MousePointerClick} title="Visitors per day · last 30 days">
              <Trend daily={traffic.daily} />
            </Panel>
          </div>
        </>
      )}
    </>
  );
}
