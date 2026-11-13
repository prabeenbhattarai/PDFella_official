"use client";

import { useEffect, useState } from "react";
import { Activity, CalendarClock, CreditCard, Crown, Globe2, Loader2, Monitor, X } from "lucide-react";
import { currentIdToken } from "@/lib/auth/firebase";
import type { UserDetail } from "@/lib/server/admin";
import { REWARD_SOURCES, rewardLabel } from "@/lib/reward";
import { UserPayments } from "./payments-section";

const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—");
const region = (() => { try { return new Intl.DisplayNames(["en"], { type: "region" }); } catch { return null; } })();
const flag = (code: string) => String.fromCodePoint(...[...code].map((c) => 0x1f1a5 + c.charCodeAt(0)));
const place = (code: string | null, city?: string | null) =>
  code ? <span><span aria-hidden>{flag(code)}</span> {[city, region?.of(code) ?? code].filter(Boolean).join(", ")}</span> : "—";

function Section({ icon: Icon, title, children }: { icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border px-5 py-4">
      <h3 className="mb-2.5 flex items-center gap-2 text-[12px] font-semibold tracking-wide text-ink-3 uppercase"><Icon className="size-3.5" aria-hidden /> {title}</h3>
      {children}
    </section>
  );
}

function Rows({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-2 text-[13.5px]">
      {items.map(([k, v]) => <div key={k} className="contents"><dt className="text-ink-3">{k}</dt><dd className="min-w-0 break-words text-ink">{v}</dd></div>)}
    </dl>
  );
}

/** Everything about one account, from /api/admin/v1/2026/accounts/[uid]. */
export function UserDrawer({ uid, onClose }: { uid: string; onClose: () => void }) {
  const [user, setUser] = useState<UserDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setUser(null);
    setError(null);
    (async () => {
      try {
        const token = await currentIdToken();
        const res = await fetch(`/api/admin/v1/2026/accounts/${encodeURIComponent(uid)}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
        const body = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok || !body) setError(body?.message ?? `The server returned an error (${res.status}).`);
        else setUser(body);
      } catch {
        if (!cancelled) setError("The request didn't reach the server.");
      }
    })();
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", esc);
    return () => { cancelled = true; document.removeEventListener("keydown", esc); };
  }, [uid, onClose, reloads]);

  return <UserDrawerView user={user} error={error} onClose={onClose} onChanged={() => setReloads((n) => n + 1)} />;
}

function PlanSection({ uid, plan, billing, reward, onChanged }: { uid: string; plan: UserDetail["plan"]; billing: UserDetail["billing"]; reward: UserDetail["reward"]; onChanged?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const active = !!plan && (!plan.until || Date.parse(plan.until) > Date.now());
  const set = async (next: "lite" | "pro" | null, days?: number) => {
    setBusy(true);
    setProblem(null);
    try {
      const token = await currentIdToken();
      const res = await fetch(`/api/admin/v1/2026/accounts/${encodeURIComponent(uid)}/plan`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ plan: next, days }) });
      const body = await res.json().catch(() => null);
      if (!res.ok) setProblem(body?.message ?? `The server returned an error (${res.status}).`);
      else onChanged?.();
    } catch {
      setProblem("The request didn't reach the server.");
    } finally {
      setBusy(false);
    }
  };
  const btn = "rounded-lg border border-border px-2.5 py-1.5 text-[12.5px] font-medium text-ink-2 hover:bg-surface-2 disabled:opacity-50";
  return (
    <Section icon={Crown} title="Plan">
      <p className="text-[13.5px] text-ink" data-testid="user-plan">{active ? `${plan?.id === "lite" ? "Lite" : "Pro"}${plan?.until ? ` until ${when(plan.until)}` : ""}` : "Free"}</p>
      {billing && (
        <div className="mt-2.5 mb-3">
          <Rows items={[
            ["Status", billing.subscription ? `${billing.subscription.status}${billing.subscription.cancelsAtEnd ? ", cancels at period end" : ""}` : "No subscription yet"],
            ["Billed", billing.subscription?.interval ? `Every ${billing.subscription.interval}` : "—"],
            ["Period ends", when(billing.subscription?.periodEnd)],
            ...(billing.checkoutStarted && !billing.subscription ? [["Started buying", `${billing.checkoutStarted.plan}, ${billing.checkoutStarted.billing}, ${when(billing.checkoutStarted.at)}`] as [string, React.ReactNode]] : []),
            ["Stripe", <a key="stripe" className="break-all text-accent hover:underline" target="_blank" rel="noreferrer" href={`https://dashboard.stripe.com/${billing.testMode ? "test/" : ""}customers/${billing.customer}`}>{billing.customer}{billing.testMode ? " (test)" : ""}</a>],
          ]} />
        </div>
      )}
      {reward && <p className="mt-1.5 text-[13px] text-ink-2">Welcome reward: {rewardLabel(reward.feature)}, until {when(reward.until)}{reward.source ? `. Found us through: ${REWARD_SOURCES.find((s) => s.id === reward.source)?.label ?? reward.source}` : ""}.</p>}
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button type="button" disabled={busy} className={btn} onClick={() => void set("lite", 30)}>Lite, 30 days</button>
        <button type="button" disabled={busy} className={btn} onClick={() => void set("pro", 30)}>Pro, 30 days</button>
        <button type="button" disabled={busy} className={btn} onClick={() => void set("pro", 365)}>Pro, 1 year</button>
        {active && <button type="button" disabled={busy} className={btn} onClick={() => void set(null)}>Remove plan</button>}
      </div>
      <p className="mt-2 text-[12px] text-ink-3">They get it the next time they open the site.</p>
      {problem && <p role="alert" className="mt-2 text-[13px] text-danger">{problem}</p>}
    </Section>
  );
}

export function UserDrawerView({ user, error, onClose, onChanged }: { user: UserDetail | null; error: string | null; onClose: () => void; onChanged?: () => void }) {
  const a = user?.activity && !("error" in user.activity) && user.activity.lastSeen ? user.activity : null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-[2px] animate-fade-in" onClick={onClose}>
      <aside role="dialog" aria-modal="true" aria-label="Account details" onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full flex-col overflow-y-auto border-l border-border bg-surface shadow-2xl sm:w-[460px]">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface/95 px-5 py-3 backdrop-blur">
          <p className="text-[14px] font-semibold text-ink">Account</p>
          <button type="button" onClick={onClose} aria-label="Close" className="flex size-9 items-center justify-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink"><X className="size-4" /></button>
        </div>

        {error && <p role="alert" className="m-5 rounded-xl bg-danger/10 px-4 py-3 text-[13.5px] text-danger">{error}</p>}
        {!user && !error && <div className="flex flex-1 items-center justify-center py-20 text-ink-3"><Loader2 className="size-5 animate-spin" aria-label="Loading" /></div>}

        {user && (
          <>
            <div className="flex items-center gap-4 px-5 py-5">
              {/* eslint-disable-next-line @next/next/no-img-element -- remote Google avatar */}
              {user.photo ? <img src={user.photo} alt="" referrerPolicy="no-referrer" className="size-14 rounded-full" /> : <span className="flex size-14 items-center justify-center rounded-full bg-surface-2 text-[20px] font-semibold">{(user.name ?? user.email ?? "?").charAt(0).toUpperCase()}</span>}
              <div className="min-w-0">
                <p className="truncate text-[17px] font-semibold text-ink">{user.name ?? "—"}</p>
                <p className="truncate text-[13.5px] text-ink-2">{user.email}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11.5px] font-semibold">
                  {user.providers.map((p) => <span key={p} className="rounded-md bg-surface-2 px-1.5 py-0.5 text-ink-2">{p}</span>)}
                  {user.emailVerified && <span className="rounded-md bg-accent-soft px-1.5 py-0.5 text-accent">Verified</span>}
                  {user.disabled && <span className="rounded-md bg-danger/10 px-1.5 py-0.5 text-danger">Disabled</span>}
                  {user.desktop && <span className="rounded-md bg-accent-soft px-1.5 py-0.5 text-accent">Desktop app</span>}
                </div>
              </div>
            </div>

            <Section icon={CalendarClock} title="Account">
              <Rows items={[
                ["Joined", when(user.createdAt)],
                ["Last sign-in", when(user.lastSignInAt)],
                ["Last active", when(user.lastActiveAt)],
                ["Country", place(user.country ?? a?.country ?? null)],
                ["Account ID", <code key="id" className="text-[12px] text-ink-2">{user.uid}</code>],
              ]} />
            </Section>

            <PlanSection uid={user.uid} plan={user.plan} billing={user.billing} reward={user.reward} onChanged={onChanged} />

            {user.billing && (
              <Section icon={CreditCard} title="Payments">
                <UserPayments uid={user.uid} />
              </Section>
            )}

            {user.desktop && (
              <Section icon={Monitor} title="Desktop app">
                <Rows items={[
                  ["System", user.desktop.os === "mac" ? "macOS" : user.desktop.os === "windows" ? "Windows" : "—"],
                  ["Version", user.desktop.v ? `v${user.desktop.v}` : "—"],
                  ["Opens", user.desktop.opens.toLocaleString()],
                  ["First used", when(user.desktop.first)],
                  ["Last used", when(user.desktop.last)],
                ]} />
              </Section>
            )}

            <Section icon={Globe2} title="Device and location">
              {a ? (
                <Rows items={[
                  ["Location", place(a.country, a.city)],
                  ["Device", a.device ?? "—"],
                  ["Browser", a.browser ?? "—"],
                  ["System", a.os ?? "—"],
                ]} />
              ) : <Empty activity={user.activity} />}
            </Section>

            <Section icon={Activity} title="Activity">
              {a ? (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    {[["Page views", a.pageviews.toLocaleString()], ["Active days", a.activeDays.toLocaleString()], ["Last seen", a.lastSeen ? new Date(a.lastSeen).toLocaleDateString() : "—"]].map(([k, v]) => (
                      <div key={k} className="rounded-xl bg-surface-2 px-3 py-2.5"><p className="text-[11.5px] text-ink-3">{k}</p><p className="mt-0.5 text-[16px] font-semibold text-ink tabular-nums">{v}</p></div>
                    ))}
                  </div>
                  {a.pages.length > 0 && (
                    <>
                      <p className="mt-4 mb-1.5 text-[12px] font-medium text-ink-3">Most used pages</p>
                      <ul className="space-y-1 text-[13px]">
                        {a.pages.map((p) => <li key={p.path} className="flex justify-between gap-3"><span className="truncate font-mono text-[12.5px] text-ink">{p.path}</span><span className="text-ink-2 tabular-nums">{p.views}</span></li>)}
                      </ul>
                    </>
                  )}
                  {a.recent.length > 0 && (
                    <>
                      <p className="mt-4 mb-1.5 text-[12px] font-medium text-ink-3">Recent activity</p>
                      <ol className="space-y-1.5 border-l border-border pl-3 text-[13px]">
                        {a.recent.map((r, i) => (
                          <li key={i} className="relative">
                            <span className="absolute top-1.5 -left-[16.5px] size-2 rounded-full bg-accent" aria-hidden />
                            <span className="text-ink first-letter:uppercase">{r.event}</span>
                            {r.path && <span className="ml-1.5 font-mono text-[12px] text-ink-3">{r.path}</span>}
                            <span className="block text-[11.5px] text-ink-3">{when(r.at)}</span>
                          </li>
                        ))}
                      </ol>
                    </>
                  )}
                </>
              ) : <Empty activity={user.activity} />}
            </Section>
          </>
        )}
      </aside>
    </div>
  );
}

function Empty({ activity }: { activity: UserDetail["activity"] }) {
  const text = activity === null
    ? "Add POSTHOG_PERSONAL_API_KEY and POSTHOG_PROJECT_ID to see activity."
    : "error" in activity ? `Couldn't read activity: ${activity.error}`
      : "Nothing yet. Activity is linked to accounts from this update on, so it appears after their next signed-in visit.";
  return <p className="text-[13px] text-ink-3">{text}</p>;
}
