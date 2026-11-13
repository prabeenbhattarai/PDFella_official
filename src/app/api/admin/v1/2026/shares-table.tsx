"use client";

import { useCallback, useEffect, useState } from "react";
import { Flag, Lock, Trash2 } from "lucide-react";
import { currentIdToken } from "@/lib/auth/firebase";
import { formatBytes } from "@/lib/utils";
import type { AdminShare } from "./shares/route";

const when = (t: number) => new Date(t).toLocaleDateString(undefined, { dateStyle: "medium" });

/** Live share links, reported first, with a way to take one down. Reads /api/admin/v1/2026/shares. */
export function SharesTable({ refreshKey }: { refreshKey: number }) {
  const [data, setData] = useState<{ available: boolean; links: AdminShare[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const token = await currentIdToken();
      const res = await fetch("/api/admin/v1/2026/shares", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body) { setError(body?.message ?? `The server returned an error (${res.status}).`); return; }
      setError(null);
      setData(body);
    } catch {
      setError("The request didn't reach the server.");
    }
  }, []);
  useEffect(() => { void load(); }, [load, refreshKey]);

  const remove = async (id: string) => {
    if (!confirm("Take this link down? Its file is deleted and the link stops working for everyone.")) return;
    const token = await currentIdToken();
    const res = await fetch(`/api/admin/v1/2026/shares/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
    if (!res?.ok) { setError("Couldn't take the link down. Please try again."); return; }
    void load();
  };

  return (
    <>
      <h2 className="mt-8 text-[15px] font-semibold text-ink">Share links</h2>
      {error && <p role="alert" className="mt-3 rounded-xl bg-danger/10 px-4 py-3 text-[13.5px] text-danger">{error}</p>}
      {data && !data.available && <p className="mt-3 rounded-xl bg-surface-2 px-4 py-3 text-[13.5px] text-ink-3">Share links aren&apos;t switched on. See docs/SHARING.md.</p>}
      {data?.available && (
        <div className="mt-3 overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <thead className="border-b border-border text-[12px] text-ink-3">
              <tr><th className="px-4 py-2.5 font-medium">Sender</th><th className="px-4 py-2.5 font-medium">Size</th><th className="px-4 py-2.5 font-medium">Created</th><th className="px-4 py-2.5 font-medium">Expires</th><th className="px-4 py-2.5 font-medium">Reports</th><th /></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.links.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-ink-3">No live links.</td></tr>}
              {data.links.map((l) => (
                <tr key={l.id} className={l.reports.length ? "bg-danger/5" : undefined}>
                  <td className="px-4 py-2.5"><span className="inline-flex items-center gap-1.5">{l.ownerEmail ?? "Unknown"}{l.hasPassword && <Lock className="size-3 text-ink-3" aria-label="Has a password" />}</span></td>
                  <td className="px-4 py-2.5 tabular-nums">{formatBytes(l.size)}</td>
                  <td className="px-4 py-2.5">{when(l.createdAt)}</td>
                  <td className="px-4 py-2.5">{when(l.expiresAt)}</td>
                  <td className="px-4 py-2.5">
                    {l.reports.length === 0 ? "None" : (
                      <span className="inline-flex items-center gap-1.5 font-medium text-danger" title={l.reports.map((r) => [r.reason, r.details].filter(Boolean).join(": ")).join("\n")}>
                        <Flag className="size-3.5" /> {l.reports.length} · {[...new Set(l.reports.map((r) => r.reason))].join(", ")}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right"><button type="button" onClick={() => void remove(l.id)} aria-label="Take this link down" title="Take this link down" className="inline-flex size-8 items-center justify-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-danger"><Trash2 className="size-4" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
