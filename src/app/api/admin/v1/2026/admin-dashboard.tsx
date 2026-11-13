"use client";

import { useCallback, useEffect, useState } from "react";
import { CircleDollarSign, Download, LayoutDashboard, Link2, Loader2, LogOut, MessageSquareText, MonitorSmartphone, RefreshCw, ShieldAlert, UserCheck, UserPlus, Users, UserX } from "lucide-react";
import { AppleLogo, WindowsLogo } from "@/components/marketing/desktop-platforms";
import { cn } from "@/lib/utils";
import { brand } from "@/lib/brand";
import { LogoMark } from "@/components/ui/logo";
import { authEnabled, useAuth } from "@/lib/auth/store";
import { currentIdToken, signInWithGoogle, signOutUser } from "@/lib/auth/firebase";
import { UsersTable } from "./users-table";
import { SharesTable } from "./shares-table";
import { FeedbackTable } from "./feedback-table";
import { BreakdownSection } from "./breakdown";
import { PaymentsSection, RevenueStats, usePayments } from "./payments-section";
import { Block, fmt, Missing, Panel, Stat, StatGrid, td, th, when } from "./admin-ui";
import type { DesktopPeople, DesktopUsage, DownloadStats, UserStats, VisitorStats } from "@/lib/server/admin";

/** The only account that may sign in here. The server checks this too (ADMIN_EMAILS). */
const OWNER = (process.env.NEXT_PUBLIC_ADMIN_EMAIL || "prabeenbhattarai7450@gmail.com").toLowerCase();
const PLANS_ON = !!process.env.NEXT_PUBLIC_PLANS_ENABLED;
const BILLING_ON = !!process.env.NEXT_PUBLIC_BILLING_ENABLED;

type Part<T> = { data: T } | { error: string };
interface Stats { admin: string; generatedAt: string; users: Part<UserStats>; visitors: Part<VisitorStats>; downloads: Part<DownloadStats>; desktop: Part<DesktopUsage>; people: Part<DesktopPeople> }
type Win = "d1" | "d7" | "d30";
const WINDOWS: { id: Win; label: string }[] = [{ id: "d1", label: "24 hours" }, { id: "d7", label: "7 days" }, { id: "d30", label: "30 days" }];

type PageId = "overview" | "revenue" | "users" | "desktop" | "survey" | "links";
const PAGES: { id: PageId; label: string; icon: React.ComponentType<{ className?: string }>; title: string; description: string; range?: boolean; show?: boolean }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, title: "Overview", description: "Users, visitors and revenue at a glance.", range: true },
  { id: "revenue", label: "Revenue", icon: CircleDollarSign, title: "Revenue", description: "Payments and subscriptions from Stripe. Read-only.", show: BILLING_ON },
  { id: "users", label: "Users", icon: Users, title: "Users", description: "Everyone who has signed up. Click someone for their details." },
  { id: "desktop", label: "Desktop app", icon: MonitorSmartphone, title: "Desktop app", description: "Downloads and who uses the app.", range: true },
  { id: "survey", label: "Survey", icon: MessageSquareText, title: "Survey", description: "How new users say they found us.", show: PLANS_ON },
  { id: "links", label: "Shared links", icon: Link2, title: "Shared links", description: "Documents people have shared by link." },
];
const visible = PAGES.filter((p) => p.show !== false);

const OS_LABEL: Record<string, string> = { mac: "macOS", windows: "Windows" };

function usePage(): [PageId, (p: PageId) => void] {
  const [page, setPage] = useState<PageId>("overview");
  useEffect(() => {
    const read = () => {
      const id = location.hash.slice(1) as PageId;
      setPage(visible.some((p) => p.id === id) ? id : "overview");
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  const go = useCallback((p: PageId) => {
    history.replaceState(null, "", `#${p}`);
    setPage(p);
    window.scrollTo({ top: 0 });
  }, []);
  return [page, go];
}

function DesktopPeopleTable({ data }: { data: DesktopPeople }) {
  const known = data.people.filter((p) => p.known).length;
  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
        <p className="text-[13px] font-medium text-ink-2">Last 30 days</p>
        <p className="text-[12.5px] text-ink-3">{known} signed in · {data.people.length - known} unknown</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[13.5px]">
          <thead className="bg-surface-2/60"><tr><th className={th}>User</th><th className={th}>System</th><th className={th}>Last used</th><th className={th}>First used</th><th className={cn(th, "text-right")}>Activity</th></tr></thead>
          <tbody>
            {data.people.length === 0 && <tr><td colSpan={5} className="px-5 py-8 text-center text-ink-3">No one has used the desktop app in the last 30 days.</td></tr>}
            {data.people.map((p, i) => (
              <tr key={`${p.email ?? "unknown"}-${p.lastSeen}-${i}`} className="border-t border-border">
                <td className={td}>
                  {p.known ? (
                    <div className="flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element -- remote Google avatar */}
                      {p.photo ? <img src={p.photo} alt="" referrerPolicy="no-referrer" className="size-8 rounded-full" /> : <span className="flex size-8 items-center justify-center rounded-full bg-surface-2 text-[13px] font-semibold">{(p.name ?? p.email ?? "?").charAt(0).toUpperCase()}</span>}
                      <div className="min-w-0"><p className="truncate font-medium text-ink">{p.name ?? "—"}</p><p className="truncate text-[12.5px] text-ink-3">{p.email}</p></div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <span className="flex size-8 items-center justify-center rounded-full border border-dashed border-border-strong text-[13px] font-semibold text-ink-3">?</span>
                      <span className="rounded-md bg-surface-2 px-2 py-0.5 text-[12px] font-semibold text-ink-3">Unknown</span>
                    </div>
                  )}
                </td>
                <td className={cn(td, "whitespace-nowrap text-ink-2")}>{p.os ? OS_LABEL[p.os] ?? p.os : "—"}{p.version ? <span className="text-ink-3"> · v{p.version}</span> : null}</td>
                <td className={cn(td, "whitespace-nowrap text-ink-2")}>{when(p.lastSeen)}</td>
                <td className={cn(td, "whitespace-nowrap text-ink-2")}>{when(p.firstSeen)}</td>
                <td className={cn(td, "text-right whitespace-nowrap text-ink-2 tabular-nums")}>{fmt(p.count)} {p.known ? (p.count === 1 ? "open" : "opens") : (p.count === 1 ? "page" : "pages")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.notes.map((n) => <p key={n} className="border-t border-border px-5 py-2.5 text-[12.5px] text-ink-3">{n}</p>)}
    </Panel>
  );
}

function SignupChart({ daily }: { daily: UserStats["daily"] }) {
  const max = Math.max(1, ...daily.map((d) => d.signups));
  const total = daily.reduce((n, d) => n + d.signups, 0);
  return (
    <Panel className="p-5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[13px] font-medium text-ink-2">Sign-ups per day</p>
        <p className="text-[12.5px] text-ink-3 tabular-nums">{fmt(total)} in 30 days</p>
      </div>
      <div className="mt-4 flex h-36 items-end gap-[3px]" role="img" aria-label={`Sign-ups per day: ${daily.map((d) => `${d.date} ${d.signups}`).join(", ")}`}>
        {daily.map((d) => (
          <div key={d.date} className="group relative flex-1">
            <div className="rounded-t-sm bg-accent/70 transition-colors group-hover:bg-accent" style={{ height: `${Math.max(2, (d.signups / max) * 144)}px` }} />
            <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded bg-ink px-1.5 py-0.5 text-[11px] whitespace-nowrap text-bg group-hover:block">{d.date.slice(5)}: {d.signups}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-ink-3"><span>{daily[0]?.date.slice(5)}</span><span>today</span></div>
    </Panel>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-dvh items-center justify-center bg-bg px-4">{children}</div>;
}

export function AdminDashboard() {
  const user = useAuth((s) => s.user);
  const ready = useAuth((s) => s.ready);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  // Bumped by Refresh so every section reloads with the overview.
  const [refreshKey, setRefreshKey] = useState(0);
  const [win, setWin] = useState<Win>("d7");
  const [rejected, setRejected] = useState<string | null>(null);
  const [page, go] = usePage();
  const isOwner = user?.email?.toLowerCase() === OWNER;

  const load = useCallback(async () => {
    setLoading(true);
    setRefreshKey((k) => k + 1);
    setError(null);
    try {
      const token = await currentIdToken();
      const res = await fetch("/api/admin/v1/2026/overview", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body) {
        setStats(null);
        setError({ status: res.status, message: body?.message ?? `The server returned an error (${res.status}).` });
      } else setStats(body);
    } catch {
      setError({ status: 0, message: "The request didn't reach the server. If you use an ad or tracker blocker, allow pdfella.com and try again." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) { setStats(null); return; }
    // Any other Google account is signed straight back out; we never ask the server for data.
    if (!isOwner) {
      setRejected(user.email ?? "That account");
      void signOutUser({ quiet: true });
      return;
    }
    setRejected(null);
    void load();
  }, [user, isOwner, load]);

  if (!authEnabled) return <Centered><Missing text="Sign-in isn't configured (NEXT_PUBLIC_FIREBASE_* variables)." /></Centered>;
  if (!ready) return <Centered><Loader2 className="size-6 animate-spin text-ink-3" /></Centered>;

  if (!user) {
    return (
      <Centered>
        <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-8 text-center shadow-sm">
          <LogoMark className="mx-auto size-12" />
          <h1 className="mt-5 text-[22px] font-semibold tracking-tight text-ink">{brand.name} admin</h1>
          <p className="mt-2 text-[14px] text-ink-3">Only the owner&apos;s Google account can sign in here.</p>
          {rejected && <p role="alert" className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-[13px] text-danger">{rejected} isn&apos;t allowed. It has been signed out.</p>}
          <button type="button" disabled={busy} onClick={async () => { setBusy(true); setRejected(null); try { await signInWithGoogle(OWNER); } catch { /* closed */ } finally { setBusy(false); } }}
            className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-border-strong bg-white text-[15px] font-semibold text-[#1f1f1f] hover:bg-[#f8f9fa] disabled:opacity-70">
            {busy ? <Loader2 className="size-5 animate-spin" /> : null} Sign in with Google
          </button>
        </div>
      </Centered>
    );
  }

  if (!isOwner) return <Centered><Loader2 className="size-6 animate-spin text-ink-3" /></Centered>;

  // Nothing below renders until the server has confirmed this account is an admin.
  if (!stats) {
    return (
      <Centered>
        {error ? (
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-8 text-center">
            <ShieldAlert className="mx-auto size-10 text-danger" />
            <h1 className="mt-4 text-[20px] font-semibold text-ink">{error.status === 403 ? "Access denied" : error.status === 401 ? "Please sign in again" : "Couldn't load the admin panel"}</h1>
            <p className="mt-2 text-[14px] text-ink-3">{error.message}</p>
            <div className="mt-6 flex gap-2">
              {error.status !== 403 && <button type="button" onClick={() => void load()} className="h-11 flex-1 rounded-xl bg-ink text-[14px] font-medium text-bg hover:opacity-90">Try again</button>}
              <button type="button" onClick={() => void signOutUser()} className="h-11 flex-1 rounded-xl border border-border text-[14px] font-medium text-ink-2 hover:bg-surface-2">Sign out</button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 text-[14px] text-ink-3"><Loader2 className="size-6 animate-spin" /> Checking access…</div>
        )}
      </Centered>
    );
  }

  const meta = visible.find((p) => p.id === page) ?? visible[0];
  const label = WINDOWS.find((w) => w.id === win)!.label;

  return (
    <Shell page={page} go={go} user={user.email}>
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight text-ink sm:text-[26px]">{meta.title}</h1>
          <p className="mt-1 text-[13.5px] text-ink-3">{meta.description} <span className="whitespace-nowrap">Updated {when(stats.generatedAt)}.</span></p>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          {meta.range && (
            <div className="flex flex-1 rounded-lg border border-border bg-surface p-0.5 sm:flex-none" role="tablist" aria-label="Time range">
              {WINDOWS.map((w) => (
                <button key={w.id} type="button" role="tab" aria-selected={win === w.id} onClick={() => setWin(w.id)}
                  className={cn("flex-1 rounded-md px-3 py-1.5 text-[13px] font-medium whitespace-nowrap sm:flex-none", win === w.id ? "bg-ink text-bg" : "text-ink-3 hover:text-ink")}>{w.label}</button>
              ))}
            </div>
          )}
          <button type="button" onClick={() => void load()} disabled={loading} className="flex h-9 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-[13px] font-medium text-ink-2 hover:bg-surface-2">
            <RefreshCw className={cn("size-4", loading && "animate-spin")} /> <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {error && <p role="alert" className="mt-6 rounded-xl bg-danger/10 px-4 py-3 text-[14px] text-danger">{error.message}</p>}

      {page === "overview" && <OverviewPage stats={stats} win={win} label={label} refreshKey={refreshKey} go={go} />}
      {page === "revenue" && <PaymentsSection refreshKey={refreshKey} />}
      {page === "users" && <UsersPage stats={stats} refreshKey={refreshKey} />}
      {page === "desktop" && <DesktopPage stats={stats} win={win} label={label} />}
      {page === "survey" && <FeedbackTable refreshKey={refreshKey} />}
      {page === "links" && <SharesTable refreshKey={refreshKey} />}
    </Shell>
  );
}

function OverviewPage({ stats, win, label, refreshKey, go }: { stats: Stats; win: Win; label: string; refreshKey: number; go: (p: PageId) => void }) {
  const u = "data" in stats.users ? stats.users.data : null;
  const v = "data" in stats.visitors ? stats.visitors.data[win] : null;
  return (
    <>
      <Block title="Registered users">
        {"error" in stats.users ? <Missing text={stats.users.error} /> : (
          <StatGrid>
            <Stat icon={UserCheck} tone="accent" label="Total registered" value={u ? fmt(u.total) : "…"} hint="All time" />
            <Stat icon={UserPlus} tone="accent" label="New · last 24 hours" value={u ? fmt(u.new.d1) : "…"} hint={u ? `${fmt(u.total - u.new.d1)} registered before that` : undefined} />
            <Stat icon={UserPlus} label="New · 7 days" value={u ? fmt(u.new.d7) : "…"} hint={u ? `${fmt(u.new.d30)} in 30 days` : undefined} />
            <Stat icon={Users} label={`Active · ${label}`} value={u ? fmt(u.active[win]) : "…"} hint="Signed in or used the site while signed in" />
          </StatGrid>
        )}
      </Block>

      {BILLING_ON && <OverviewRevenue refreshKey={refreshKey} go={go} />}

      <Block title={`Visitors · ${label}`}>
        {"error" in stats.visitors ? <Missing text={stats.visitors.error} /> : (
          <StatGrid>
            <Stat icon={Users} label="Unique visitors" value={v ? fmt(v.visitors) : "…"} hint="Everyone who opened a page" />
            <Stat icon={UserX} label="Not registered" value={v ? fmt(v.guests) : "…"} hint={v && v.visitors ? `${Math.round((v.guests / v.visitors) * 100)}% of visitors` : "Used PDFella without signing in"} />
            <Stat icon={UserCheck} tone="accent" label="Signed-in visitors" value={v ? fmt(v.signedIn) : "…"} hint={v && v.visitors ? `${Math.round((v.signedIn / v.visitors) * 100)}% of visitors` : undefined} />
            <Stat icon={LayoutDashboard} label="Page views" value={v ? fmt(v.pageviews) : "…"} />
          </StatGrid>
        )}
      </Block>

      {u && <Block title="Sign-ups"><SignupChart daily={u.daily} /></Block>}

      <BreakdownSection days={win === "d1" ? 1 : win === "d30" ? 30 : 7} label={label} refreshKey={refreshKey} />
      <p className="mt-8 text-[12px] text-ink-3">Visitors come from PostHog. Without cookies a visitor gets a new anonymous ID each day, so 7- and 30-day counts include repeat visits on different days.</p>
    </>
  );
}

function OverviewRevenue({ refreshKey, go }: { refreshKey: number; go: (p: PageId) => void }) {
  const { data, error } = usePayments(refreshKey);
  return (
    <Block title="Revenue" actions={<button type="button" onClick={() => go("revenue")} className="text-[13px] font-medium text-accent hover:underline">All payments →</button>}>
      {error ? <Missing text={error} /> : data ? <RevenueStats data={data} /> : <div className="flex h-[118px] items-center justify-center rounded-xl border border-border bg-surface text-ink-3"><Loader2 className="size-5 animate-spin" aria-label="Loading revenue" /></div>}
    </Block>
  );
}

function UsersPage({ stats, refreshKey }: { stats: Stats; refreshKey: number }) {
  const u = "data" in stats.users ? stats.users.data : null;
  if ("error" in stats.users) return <div className="mt-6"><Missing text={stats.users.error} /></div>;
  return (
    <>
      <StatGrid className="mt-6">
        <Stat icon={UserCheck} tone="accent" label="Total registered" value={u ? fmt(u.total) : "…"} />
        <Stat icon={UserPlus} label="New · 24 hours" value={u ? fmt(u.new.d1) : "…"} />
        <Stat icon={UserPlus} label="New · 7 days" value={u ? fmt(u.new.d7) : "…"} />
        <Stat icon={UserPlus} label="New · 30 days" value={u ? fmt(u.new.d30) : "…"} />
      </StatGrid>
      <div className="mt-5"><UsersTable refreshKey={refreshKey} /></div>
    </>
  );
}

function DesktopPage({ stats, win, label }: { stats: Stats; win: Win; label: string }) {
  const dl = "data" in stats.downloads ? stats.downloads.data : null;
  const dk = "data" in stats.desktop ? stats.desktop.data[win] : null;
  return (
    <>
      <Block title="Downloads">
        <StatGrid>
          {"error" in stats.downloads ? <div className="col-span-2"><Missing text={stats.downloads.error} /></div> : (
            <>
              <Stat icon={Download} tone="accent" label="Downloads · all time" value={dl ? fmt(dl.total) : "…"} hint="GitHub before the CDN, plus pdfella.com since" />
              <Stat icon={AppleLogo} label="macOS" value={dl ? fmt(dl.mac) : "…"} hint={dl && dl.total ? `${Math.round((dl.mac / dl.total) * 100)}% of downloads` : undefined} />
              <Stat icon={WindowsLogo} label="Windows" value={dl ? fmt(dl.windows) : "…"} hint={dl && dl.total ? `${Math.round((dl.windows / dl.total) * 100)}% of downloads` : undefined} />
            </>
          )}
          {"error" in stats.desktop ? <Missing text={stats.desktop.error} /> : (
            <Stat icon={MonitorSmartphone} label={`App users · ${label}`} value={dk ? fmt(dk.users) : "…"} hint={dk ? `${fmt(dk.mac)} Mac · ${fmt(dk.windows)} Windows · ${fmt(dk.pageviews)} page views` : undefined} />
          )}
        </StatGrid>
      </Block>
      {dl && dl.releases.length > 0 && (
        <Block title="By version">
          <Panel>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13.5px]">
                <thead className="bg-surface-2/60"><tr><th className={th}>Version</th><th className={th}>Released</th><th className={cn(th, "text-right")}>macOS</th><th className={cn(th, "text-right")}>Windows</th></tr></thead>
                <tbody>
                  {dl.releases.map((r) => (
                    <tr key={r.tag} className="border-t border-border">
                      <td className={cn(td, "font-medium text-ink")}>{r.tag}</td>
                      <td className={cn(td, "whitespace-nowrap text-ink-2")}>{when(r.publishedAt)}</td>
                      <td className={cn(td, "text-right text-ink-2 tabular-nums")}>{fmt(r.mac)}</td>
                      <td className={cn(td, "text-right text-ink-2 tabular-nums")}>{fmt(r.windows)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </Block>
      )}
      <Block title="Who used the app">
        {"error" in stats.people ? <Missing text={stats.people.error} /> : <DesktopPeopleTable data={stats.people.data} />}
      </Block>
      <p className="mt-8 text-[12px] text-ink-3">App users come from PostHog. Downloads include test downloads made while setting the app up.</p>
    </>
  );
}

function Shell({ children, page, go, user }: { children: React.ReactNode; page: PageId; go: (p: PageId) => void; user: string | null | undefined }) {
  const nav = (mobile: boolean) => visible.map((p) => {
    const Icon = p.icon;
    const on = p.id === page;
    return (
      <button key={p.id} type="button" onClick={() => go(p.id)} aria-current={on ? "page" : undefined}
        className={cn(mobile
          ? "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium whitespace-nowrap"
          : "flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] font-medium transition-colors",
        on ? "bg-surface-2 text-ink" : "text-ink-3 hover:bg-surface-2/60 hover:text-ink")}>
        <Icon className={cn("size-4 shrink-0", on && "text-accent")} /> {p.label}
      </button>
    );
  });
  return (
    <div className="min-h-dvh bg-bg">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border bg-surface lg:flex" aria-label="Admin navigation">
        <div className="flex h-14 items-center gap-2.5 border-b border-border px-4">
          <LogoMark className="size-7 drop-shadow-none" />
          <span className="text-[15px] font-semibold text-ink">{brand.name}</span>
          <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[10.5px] font-semibold tracking-wide text-ink-3 uppercase">Admin</span>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">{nav(false)}</nav>
        <div className="flex items-center gap-2 border-t border-border p-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[13px] font-semibold text-accent">{(user ?? "?").charAt(0).toUpperCase()}</span>
          <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-2" title={user ?? undefined}>{user}</span>
          <button type="button" onClick={() => void signOutUser()} aria-label="Sign out" title="Sign out" className="flex size-8 items-center justify-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink"><LogOut className="size-4" /></button>
        </div>
      </aside>

      <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur lg:hidden">
        <div className="flex h-14 items-center gap-2.5 px-4">
          <LogoMark className="size-7 drop-shadow-none" />
          <span className="text-[15px] font-semibold text-ink">{brand.name}</span>
          <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[10.5px] font-semibold tracking-wide text-ink-3 uppercase">Admin</span>
          <button type="button" onClick={() => void signOutUser()} aria-label="Sign out" className="ml-auto flex size-9 items-center justify-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink"><LogOut className="size-4" /></button>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2" aria-label="Admin navigation">{nav(true)}</nav>
      </header>

      <main className="px-4 py-6 sm:px-6 lg:ml-60 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
