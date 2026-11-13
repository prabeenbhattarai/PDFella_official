"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CalendarRange, CircleDollarSign, CreditCard, ExternalLink, FileText, Loader2, Repeat, Undo2, Wallet } from "lucide-react";
import { currentIdToken } from "@/lib/auth/firebase";
import type { PaymentRow, PaymentsOverview, PaymentStatus } from "@/lib/server/payments";
import { cn } from "@/lib/utils";
import { Badge, Block, day, fmt, Missing, money, Panel, Stat, StatGrid, td, th, when } from "./admin-ui";
import { UserDrawer } from "./user-drawer";

const STATUS: Record<PaymentStatus, { label: string; tone: "ok" | "warn" | "danger" | "muted" }> = {
  paid: { label: "Paid", tone: "ok" },
  refunded: { label: "Refunded", tone: "muted" },
  partially_refunded: { label: "Part refunded", tone: "warn" },
  failed: { label: "Failed", tone: "danger" },
  disputed: { label: "Disputed", tone: "danger" },
  pending: { label: "Pending", tone: "muted" },
};

const brandName = (b: string) => ({ visa: "Visa", mastercard: "Mastercard", amex: "Amex", discover: "Discover", jcb: "JCB", unionpay: "UnionPay", diners: "Diners" } as Record<string, string>)[b] ?? b.charAt(0).toUpperCase() + b.slice(1);
export const cardLabel = (c: PaymentRow["card"]) => (c ? `${brandName(c.brand)} •••• ${c.last4}` : "—");

export function StatusBadge({ row }: { row: Pick<PaymentRow, "status" | "failure"> }) {
  const s = STATUS[row.status];
  return <span title={row.failure ?? undefined}><Badge tone={s.tone}>{s.label}</Badge></span>;
}

async function getJson<T>(url: string): Promise<T> {
  const token = await currentIdToken();
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body) throw new Error(body?.message ?? `The server returned an error (${res.status}).`);
  return body as T;
}

/** Revenue, subscriptions and payments from Stripe. Loaded once and shared by the Overview and Revenue pages. */
export function usePayments(refreshKey: number) {
  const [data, setData] = useState<PaymentsOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    getJson<PaymentsOverview>("/api/admin/v1/2026/payments")
      .then((d) => { if (alive) { setData(d); setError(null); } })
      .catch((e) => { if (alive) setError((e as Error).message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [refreshKey]);
  return { data, error, loading };
}

function change(now: number, before: number) {
  if (!before) return now ? "First month with revenue" : "No revenue last month";
  const pct = Math.round(((now - before) / before) * 100);
  return `${pct >= 0 ? "+" : ""}${pct}% vs last month`;
}

/** The revenue numbers, also shown on the Overview page. */
export function RevenueStats({ data }: { data: PaymentsOverview }) {
  const c = data.currency;
  const s = data.subscriptions;
  return (
    <StatGrid>
      <Stat icon={CircleDollarSign} tone="accent" label="Revenue this month" value={money(data.revenue.month, c)} hint={change(data.revenue.month, data.revenue.lastMonth)} testId="revenue-month" />
      <Stat icon={Repeat} label="Monthly recurring revenue" value={money(s.mrr, c)} hint="Yearly plans counted as a twelfth" />
      <Stat icon={Wallet} label="Active subscriptions" value={fmt(s.active)} hint={`${fmt(s.lite)} Lite · ${fmt(s.pro)} Pro${s.cancelling ? ` · ${fmt(s.cancelling)} cancelling` : ""}`} />
      <Stat icon={CalendarRange} label="Revenue, all time" value={money(data.revenue.allTime, c)} hint={`${fmt(data.revenue.payments)} payments · ${money(data.revenue.refunds, c)} refunded`} />
    </StatGrid>
  );
}

/** The Revenue page. Read-only: refunds and cancellations are done in Stripe. */
export function PaymentsSection({ refreshKey }: { refreshKey: number }) {
  const { data, error, loading } = usePayments(refreshKey);
  const [open, setOpen] = useState<string | null>(null);
  const close = useCallback(() => setOpen(null), []);

  if (error) return <div className="mt-6"><Missing text={error} /></div>;
  if (!data) return <div className="mt-16 flex justify-center text-ink-3"><Loader2 className="size-5 animate-spin" aria-label="Loading payments" /></div>;
  const c = data.currency;
  const attention = data.pastDue.length + data.disputes.length;

  return (
    <div className={cn(loading && "opacity-70")}>
      {!data.live && <p className="mt-6 rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-[13.5px] text-ink-2">Showing Stripe <strong>test mode</strong>. The live site shows real payments.</p>}

      <div className="mt-6"><RevenueStats data={data} /></div>

      <StatGrid className="mt-3">
        <Stat icon={Repeat} label="Monthly plans" value={fmt(data.subscriptions.monthly)} />
        <Stat icon={CalendarRange} label="Yearly plans" value={fmt(data.subscriptions.yearly)} />
        <Stat icon={Undo2} label="Refunded, all time" value={money(data.revenue.refunds, c)} />
        <Stat icon={CircleDollarSign} label="Revenue last month" value={money(data.revenue.lastMonth, c)} />
      </StatGrid>

      {attention > 0 && (
        <Block title="Needs attention" description="Stripe keeps retrying failed renewals. Disputes need a reply in Stripe before their deadline.">
          <Panel className="border-warn/40">
            <ul className="divide-y divide-border">
              {data.pastDue.map((p) => (
                <li key={p.stripeUrl} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-[13.5px]">
                  <AlertTriangle className="size-4 shrink-0 text-warn" aria-hidden />
                  <span className="font-medium text-ink">Renewal failed</span>
                  <button type="button" disabled={!p.uid} onClick={() => p.uid && setOpen(p.uid)} className="text-ink-2 enabled:hover:underline">{p.email ?? "Unknown customer"}</button>
                  {p.plan && <Badge>{p.plan}</Badge>}
                  {p.since && <span className="text-ink-3">since {day(p.since)}</span>}
                  <a href={p.stripeUrl} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-accent hover:underline">Open in Stripe <ExternalLink className="size-3.5" /></a>
                </li>
              ))}
              {data.disputes.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-[13.5px]">
                  <AlertTriangle className="size-4 shrink-0 text-danger" aria-hidden />
                  <span className="font-medium text-ink">Dispute</span>
                  <span className="text-ink-2">{d.email ?? "Unknown customer"}</span>
                  <span className="text-ink-2 tabular-nums">{money(d.amount, d.currency)}</span>
                  <span className="text-ink-3">{day(d.created)}</span>
                  <a href={d.stripeUrl} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-accent hover:underline">Respond in Stripe <ExternalLink className="size-3.5" /></a>
                </li>
              ))}
            </ul>
          </Panel>
        </Block>
      )}

      <Block title="Recent payments" description={`The latest ${fmt(data.recent.length)}. Click a customer for their account.${data.truncated ? " Totals cover the most recent 2,000 payments." : ""}`}>
        <Panel>
          {/* Phones: one card per payment. */}
          <ul className="divide-y divide-border sm:hidden">
            {data.recent.length === 0 && <li className="px-4 py-8 text-center text-[13.5px] text-ink-3">No payments yet.</li>}
            {data.recent.map((r) => (
              <li key={r.id} className="flex items-start gap-3 px-4 py-3 text-[13px]">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2"><span className={cn("font-semibold tabular-nums", r.status === "failed" ? "text-ink-3 line-through" : "text-ink")}>{money(r.amount, r.currency)}</span><StatusBadge row={r} /></p>
                  {r.uid ? <button type="button" onClick={() => setOpen(r.uid)} className="block max-w-full truncate text-left font-medium text-ink-2 hover:underline">{r.email ?? r.name ?? "Customer"}</button>
                    : <p className="truncate text-ink-2">{r.email ?? r.name ?? "—"}</p>}
                  <p className="truncate text-[12px] text-ink-3">{day(r.created)}{r.plan ? ` · ${r.plan}` : ""}{r.kind ? ` · ${r.kind}` : ""}</p>
                  <p className="text-[12px] text-ink-3">{cardLabel(r.card)}{r.refunded > 0 && r.status !== "refunded" ? ` · ${money(r.refunded, r.currency)} refunded` : ""}</p>
                </div>
                <a href={r.stripeUrl} target="_blank" rel="noreferrer" aria-label="Open in Stripe" className="flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink"><ExternalLink className="size-4" /></a>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-left text-[13.5px]" data-testid="payments-table">
              <thead className="bg-surface-2/60"><tr><th className={th}>Date</th><th className={th}>Customer</th><th className={th}>For</th><th className={cn(th, "text-right")}>Amount</th><th className={th}>Status</th><th className={th}>Card</th><th className={cn(th, "text-right")}>Links</th></tr></thead>
              <tbody>
                {data.recent.length === 0 && <tr><td colSpan={7} className="px-5 py-10 text-center text-ink-3">No payments yet.</td></tr>}
                {data.recent.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className={cn(td, "whitespace-nowrap text-ink-2")}>{when(r.created)}</td>
                    <td className={cn(td, "max-w-[240px]")}>
                      {r.uid ? <button type="button" onClick={() => setOpen(r.uid)} className="block max-w-full truncate text-left font-medium text-ink hover:underline">{r.email ?? r.name ?? "Customer"}</button>
                        : <span className="block truncate text-ink-2">{r.email ?? r.name ?? "—"}</span>}
                    </td>
                    <td className={cn(td, "whitespace-nowrap")}><span className="text-ink">{r.plan ?? "—"}</span>{r.kind && <span className="block text-[12px] text-ink-3">{r.kind}</span>}</td>
                    <td className={cn(td, "text-right whitespace-nowrap tabular-nums")}>
                      <span className={cn("font-medium", r.status === "failed" ? "text-ink-3 line-through" : "text-ink")}>{money(r.amount, r.currency)}</span>
                      {r.refunded > 0 && r.status !== "refunded" && <span className="block text-[12px] text-ink-3">{money(r.refunded, r.currency)} refunded</span>}
                    </td>
                    <td className={td}><StatusBadge row={r} /></td>
                    <td className={cn(td, "whitespace-nowrap text-ink-2")}>{cardLabel(r.card)}</td>
                    <td className={cn(td, "text-right whitespace-nowrap")}>
                      <span className="inline-flex items-center gap-1">
                        {r.invoicePdf && <a href={r.invoicePdf} target="_blank" rel="noreferrer" aria-label="Invoice PDF" title="Invoice PDF" className="flex size-8 items-center justify-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink"><FileText className="size-4" /></a>}
                        <a href={r.stripeUrl} target="_blank" rel="noreferrer" aria-label="Open in Stripe" title="Open in Stripe" className="flex size-8 items-center justify-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink"><ExternalLink className="size-4" /></a>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </Block>
      <p className="mt-4 flex items-center gap-1.5 text-[12px] text-ink-3"><CreditCard className="size-3.5" aria-hidden /> Read-only, from Stripe, refreshed every minute. Refunds and cancellations are done in the Stripe dashboard. Months are calendar months in UTC.</p>
      {open && <UserDrawer uid={open} onClose={close} />}
    </div>
  );
}

/** One account's payments, in the user drawer. */
export function UserPayments({ uid }: { uid: string }) {
  const [data, setData] = useState<{ rows: PaymentRow[]; card: PaymentRow["card"]; stripeUrl: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setData(null);
    getJson<{ rows: PaymentRow[]; card: PaymentRow["card"]; stripeUrl: string | null }>(`/api/admin/v1/2026/accounts/${encodeURIComponent(uid)}/payments`)
      .then((d) => { if (alive) { setData(d); setError(null); } })
      .catch((e) => { if (alive) setError((e as Error).message); });
    return () => { alive = false; };
  }, [uid]);

  if (error) return <p className="text-[13px] text-ink-3">{error}</p>;
  if (!data) return <Loader2 className="size-4 animate-spin text-ink-3" aria-label="Loading payments" />;
  if (data.rows.length === 0) return <p className="text-[13px] text-ink-3" data-testid="user-payments">No payments yet.</p>;
  const paid = data.rows.filter((r) => r.status !== "failed" && r.status !== "pending").reduce((n, r) => n + r.amount - r.refunded, 0);
  return (
    <div data-testid="user-payments">
      <div className="mb-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-surface-2 px-3 py-2.5"><p className="text-[11.5px] text-ink-3">Paid in total</p><p className="mt-0.5 text-[16px] font-semibold text-ink tabular-nums">{money(paid, data.rows[0].currency)}</p></div>
        <div className="rounded-xl bg-surface-2 px-3 py-2.5"><p className="text-[11.5px] text-ink-3">Card</p><p className="mt-0.5 truncate text-[14px] font-semibold text-ink">{cardLabel(data.card)}</p></div>
      </div>
      <ul className="divide-y divide-border rounded-xl border border-border">
        {data.rows.map((r) => (
          <li key={r.id} className="flex items-center gap-3 px-3 py-2.5 text-[13px]">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2"><span className={cn("font-semibold tabular-nums", r.status === "failed" ? "text-ink-3 line-through" : "text-ink")}>{money(r.amount, r.currency)}</span><StatusBadge row={r} /></p>
              <p className="truncate text-[12px] text-ink-3">{day(r.created)}{r.plan ? ` · ${r.plan}` : ""}{r.kind ? ` · ${r.kind}` : ""}{r.refunded > 0 && r.status !== "refunded" ? ` · ${money(r.refunded, r.currency)} refunded` : ""}</p>
              {r.failure && <p className="text-[12px] text-danger">{r.failure}</p>}
            </div>
            {r.invoicePdf && <a href={r.invoicePdf} target="_blank" rel="noreferrer" aria-label="Invoice PDF" title="Invoice PDF" className="flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink"><FileText className="size-4" /></a>}
            <a href={r.stripeUrl} target="_blank" rel="noreferrer" aria-label="Open in Stripe" title="Open in Stripe" className="flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink"><ExternalLink className="size-4" /></a>
          </li>
        ))}
      </ul>
    </div>
  );
}
