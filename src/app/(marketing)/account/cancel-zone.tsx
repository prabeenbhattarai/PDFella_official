"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Clock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const two = (n: number) => String(n).padStart(2, "0");
const remaining = (ms: number) => { const s = Math.floor(ms / 1000); return `${two(Math.floor(s / 3600))}:${two(Math.floor(s / 60) % 60)}:${two(s % 60)}`; };

/** The red area: cancelling, then 24 hours to get the plan back. The server enforces the limit. */
export function CancelZone({ planName, periodEnd, cancelled, undoUntil, busy, onCancel, onUndo }: {
  planName: string; periodEnd: string; cancelled: boolean; undoUntil: string | null; busy: boolean; onCancel: () => void; onUndo: () => void;
}) {
  const deadline = undoUntil ? Date.parse(undoUntil) : 0;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!cancelled || !deadline) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [cancelled, deadline]);
  const left = deadline - now;
  const canUndo = cancelled && left > 0;

  return (
    <section className="mt-8 rounded-2xl border border-danger/40 bg-danger/5 p-6" aria-labelledby="cancel-zone" data-testid="cancel-zone">
      <h2 id="cancel-zone" className="flex items-center gap-2 text-[16px] font-semibold tracking-tight text-danger"><AlertTriangle className="size-4" aria-hidden /> {cancelled ? "Subscription cancelled" : "Cancel subscription"}</h2>

      {!cancelled && (
        <>
          <p className="mt-1.5 text-[14px] text-ink-2">You won&apos;t be charged again, and you keep {planName} until {periodEnd}. You&apos;ll have 24 hours to change your mind.</p>
          <Button variant="danger" className="mt-4" onClick={onCancel}>Cancel subscription</Button>
        </>
      )}

      {canUndo && (
        <>
          <p className="mt-1.5 text-[14px] text-ink-2">You won&apos;t be charged again, and you keep {planName} until {periodEnd}. Changed your mind? You can get your plan back for a limited time.</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button disabled={busy} onClick={onUndo}>{busy && <Loader2 className="animate-spin" />} Get my plan back</Button>
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-danger/10 px-2.5 py-1.5 text-[13.5px] font-semibold text-danger tabular-nums" role="timer" data-testid="undo-timer"><Clock className="size-3.5" aria-hidden /> {remaining(left)} left</span>
          </div>
        </>
      )}

      {cancelled && !canUndo && (
        <p className="mt-1.5 text-[14px] text-ink-2" data-testid="undo-expired">The 24 hours to get this plan back have passed. You keep {planName} until {periodEnd}, and you won&apos;t be charged again. After that, you can buy a new plan from the pricing page.</p>
      )}
    </section>
  );
}
