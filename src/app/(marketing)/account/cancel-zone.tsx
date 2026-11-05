"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Clock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/form";
import { UNDO_CANCEL_MINUTES } from "@/lib/plan-limits";

const two = (n: number) => String(n).padStart(2, "0");
const remaining = (ms: number) => { const s = Math.ceil(ms / 1000); return `${two(Math.floor(s / 60))}:${two(s % 60)}`; };
const CONFIRM_WORD = "cancel";

/** The red area: cancelling, then a few minutes to get the plan back. The server enforces the limit. */
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
          <p className="mt-1.5 text-[14px] text-ink-2">You won&apos;t be charged again, and you keep {planName} until {periodEnd}. You&apos;ll have {UNDO_CANCEL_MINUTES} minutes to change your mind.</p>
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
        <p className="mt-1.5 text-[14px] text-ink-2" data-testid="undo-expired">The {UNDO_CANCEL_MINUTES} minutes to get this plan back have passed. You keep {planName} until {periodEnd}, and you won&apos;t be charged again. After that, you can buy a new plan from the pricing page.</p>
      )}
    </section>
  );
}

/** Cancelling is hard to undo, so it has to be typed out. */
export function CancelDialog({ open, planName, periodEnd, busy, onClose, onConfirm }: { open: boolean; planName: string; periodEnd: string; busy: boolean; onClose: () => void; onConfirm: () => void }) {
  const [typed, setTyped] = useState("");
  useEffect(() => { if (open) setTyped(""); }, [open]);
  const matches = typed.trim().toLowerCase() === CONFIRM_WORD;
  return (
    <Dialog open={open} onClose={onClose} title="Cancel your subscription?"
      description={`You won't be charged again, and you keep ${planName} until ${periodEnd}. After that, your account moves to the Free plan.`}
      footer={<><Button variant="ghost" onClick={onClose}>Keep my plan</Button><Button variant="danger" disabled={!matches || busy} onClick={onConfirm} data-testid="confirm-cancel">{busy && <Loader2 className="animate-spin" />} Cancel subscription</Button></>}>
      <form onSubmit={(e) => { e.preventDefault(); if (matches && !busy) onConfirm(); }}>
        <p className="text-[14px] font-medium text-danger">You&apos;ll have {UNDO_CANCEL_MINUTES} minutes to change your mind. After that, this subscription can&apos;t be brought back.</p>
        <label htmlFor="confirm-cancel-word" className="mt-4 block text-[14px] text-ink-2">Type <strong className="text-ink">{CONFIRM_WORD}</strong> to confirm</label>
        <Input id="confirm-cancel-word" data-autofocus className="mt-1.5" autoComplete="off" autoCapitalize="off" spellCheck={false} placeholder={CONFIRM_WORD} value={typed} onChange={(e) => setTyped(e.target.value)} data-testid="confirm-cancel-word" />
      </form>
    </Dialog>
  );
}

/** A short goodbye after cancelling, with what happens next. */
export function SorryDialog({ open, planName, periodEnd, onClose }: { open: boolean; planName: string; periodEnd: string; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} size="sm" title="Sorry to see you go" footer={<Button className="w-full" onClick={onClose} data-testid="sorry-ok">OK</Button>}>
      <div data-testid="sorry-dialog" className="space-y-2 text-[14px] text-ink-2">
        <p>Your subscription is cancelled, and you won&apos;t be charged again. You keep {planName} until {periodEnd}.</p>
        <p>Changed your mind? You have {UNDO_CANCEL_MINUTES} minutes to get your plan back.</p>
      </div>
    </Dialog>
  );
}
