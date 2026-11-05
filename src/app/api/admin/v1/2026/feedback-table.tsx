"use client";

import { useEffect, useState } from "react";
import { currentIdToken } from "@/lib/auth/firebase";
import { REWARD_SOURCES } from "@/lib/reward";

/** How new users say they found us. */
export function FeedbackTable({ refreshKey }: { refreshKey: number }) {
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const token = await currentIdToken();
        const res = await fetch("/api/admin/v1/2026/feedback", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
        const body = await res.json().catch(() => null);
        if (!alive) return;
        if (!res.ok) setError(body?.message ?? `The server returned an error (${res.status}).`);
        else setCounts(body.counts);
      } catch {
        if (alive) setError("The request didn't reach the server.");
      }
    })();
    return () => { alive = false; };
  }, [refreshKey]);
  const total = Object.values(counts ?? {}).reduce((a, b) => a + b, 0);
  return (
    <>
      <h2 className="mt-10 text-[13px] font-semibold tracking-wide text-ink-3 uppercase">How new users found us</h2>
      {error && <p className="mt-3 rounded-xl bg-surface-2 px-4 py-3 text-[13.5px] text-ink-3">{error}</p>}
      {counts && (
        <ul className="mt-3 divide-y divide-border rounded-2xl border border-border bg-surface">
          {total === 0 && <li className="px-4 py-4 text-center text-[13.5px] text-ink-3">No answers yet.</li>}
          {total > 0 && REWARD_SOURCES.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-4 px-4 py-2.5 text-[13.5px]">
              <span className="text-ink">{s.label}</span>
              <span className="text-ink-2 tabular-nums">{counts[s.id] ?? 0} · {Math.round(((counts[s.id] ?? 0) / total) * 100)}%</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
