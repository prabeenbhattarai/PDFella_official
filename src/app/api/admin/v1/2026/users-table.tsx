"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Loader2, Monitor, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { currentIdToken } from "@/lib/auth/firebase";
import type { UserPage } from "@/lib/server/admin";
import { UserDrawer } from "./user-drawer";

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—");
const SIZES = [20, 50, 100];
const region = (() => { try { return new Intl.DisplayNames(["en"], { type: "region" }); } catch { return null; } })();
const flag = (code: string) => String.fromCodePoint(...[...code].map((c) => 0x1f1a5 + c.charCodeAt(0)));

/** Every registered account, page by page, with search. Reads /api/admin/v1/2026/accounts. */
export function UsersTable({ refreshKey }: { refreshKey: number }) {
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [data, setData] = useState<UserPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const close = useCallback(() => setOpen(null), []);

  // Search as you type, without a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => { setQ(input.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [input]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const token = await currentIdToken();
        const params = new URLSearchParams({ page: String(page), size: String(size), ...(q ? { q } : {}) });
        const res = await fetch(`/api/admin/v1/2026/accounts?${params}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
        const body = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok || !body) { setError(body?.message ?? `The server returned an error (${res.status}).`); return; }
        setError(null);
        setData(body);
      } catch {
        if (!cancelled) setError("The request didn't reach the server.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [page, size, q, refreshKey]);

  const from = data && data.total ? (data.page - 1) * data.size + 1 : 0;
  const to = data ? Math.min(data.total, data.page * data.size) : 0;
  const nav = "flex size-8 items-center justify-center rounded-lg border border-border text-ink-2 hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-40";

  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
        <p className="flex items-center gap-2 text-[13px] font-medium text-ink-3">
          All sign-ups <span className="hidden text-[12px] font-normal sm:inline">· click someone for details</span> {data && <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[12px] tabular-nums">{data.total.toLocaleString()}</span>}
          {loading && <Loader2 className="size-3.5 animate-spin" aria-label="Loading" />}
        </p>
        <label className="flex h-9 w-full items-center gap-2 rounded-lg border border-border bg-bg px-2.5 text-ink-3 focus-within:border-accent sm:w-72">
          <Search className="size-4 shrink-0" aria-hidden />
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Search name or email" aria-label="Search users"
            className="min-w-0 flex-1 bg-transparent text-[13.5px] text-ink outline-none placeholder:text-ink-3" />
        </label>
      </div>

      {error && <p role="alert" className="border-b border-border px-5 py-3 text-[13.5px] text-danger">{error}</p>}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-[14px]">
          <thead className="bg-surface-2/60 text-[12px] text-ink-3">
            <tr><th className="w-12 px-5 py-2 font-medium">#</th><th className="px-5 py-2 font-medium">User</th><th className="px-5 py-2 font-medium">Country</th><th className="px-5 py-2 font-medium">Joined</th><th className="px-5 py-2 font-medium">Last sign-in</th><th className="px-5 py-2 font-medium">Desktop app</th></tr>
          </thead>
          <tbody className={cn(loading && "opacity-60")}>
            {data && data.rows.length === 0 && <tr><td colSpan={6} className="px-5 py-8 text-center text-ink-3">{q ? `No one matches “${q}”.` : "No one has signed up yet."}</td></tr>}
            {data?.rows.map((r, i) => (
              <tr key={r.uid} tabIndex={0} onClick={() => setOpen(r.uid)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(r.uid); } }}
                aria-label={`Open details for ${r.email ?? r.name ?? "this account"}`}
                className="cursor-pointer border-t border-border transition-colors outline-none hover:bg-surface-2/60 focus-visible:bg-surface-2">
                <td className="px-5 py-3 text-ink-3 tabular-nums">{from + i}</td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element -- remote Google avatar */}
                    {r.photo ? <img src={r.photo} alt="" referrerPolicy="no-referrer" className="size-8 rounded-full" /> : <span className="flex size-8 items-center justify-center rounded-full bg-surface-2 text-[13px] font-semibold">{(r.name ?? r.email ?? "?").charAt(0).toUpperCase()}</span>}
                    <div className="min-w-0"><p className="truncate font-medium text-ink">{r.name ?? "—"}</p><p className="truncate text-[12.5px] text-ink-3">{r.email}</p></div>
                  </div>
                </td>
                <td className="px-5 py-3 whitespace-nowrap text-ink-2">
                  {r.country ? <span title={r.country}><span aria-hidden>{flag(r.country)}</span> {region?.of(r.country) ?? r.country}</span> : <span className="text-ink-3">—</span>}
                </td>
                <td className="px-5 py-3 whitespace-nowrap text-ink-2">{when(r.createdAt)}</td>
                <td className="px-5 py-3 whitespace-nowrap text-ink-2">{when(r.lastSignInAt)}</td>
                <td className="px-5 py-3 whitespace-nowrap">
                  {r.desktopLastUsed
                    ? <span className="inline-flex items-center gap-1.5 rounded-md bg-accent-soft px-2 py-0.5 text-[12px] font-semibold text-accent" title={`Last used ${when(r.desktopLastUsed)}`}><Monitor className="size-3.5" /> Uses app</span>
                    : <span className="text-ink-3">—</span>}
                </td>
              </tr>
            ))}
            {!data && !error && <tr><td colSpan={6} className="px-5 py-8 text-center text-ink-3">Loading…</td></tr>}
          </tbody>
        </table>
      </div>

      {open && <UserDrawer uid={open} onClose={close} />}

      {data && data.total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3 text-[13px] text-ink-3">
          <div className="flex items-center gap-3">
            <span className="tabular-nums">{from.toLocaleString()}–{to.toLocaleString()} of {data.total.toLocaleString()}</span>
            <label className="flex items-center gap-1.5">Rows
              <select value={size} onChange={(e) => { setSize(Number(e.target.value)); setPage(1); }} className="h-8 rounded-lg border border-border bg-bg px-1.5 text-ink">
                {SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          </div>
          <div className="flex items-center gap-1.5">
            <button type="button" className={nav} onClick={() => setPage(1)} disabled={data.page <= 1} aria-label="First page"><ChevronsLeft className="size-4" /></button>
            <button type="button" className={nav} onClick={() => setPage(data.page - 1)} disabled={data.page <= 1} aria-label="Previous page"><ChevronLeft className="size-4" /></button>
            <span className="px-2 text-ink-2 tabular-nums">Page {data.page} of {data.pages}</span>
            <button type="button" className={nav} onClick={() => setPage(data.page + 1)} disabled={data.page >= data.pages} aria-label="Next page"><ChevronRight className="size-4" /></button>
            <button type="button" className={nav} onClick={() => setPage(data.pages)} disabled={data.page >= data.pages} aria-label="Last page"><ChevronsRight className="size-4" /></button>
          </div>
        </div>
      )}
    </div>
  );
}
