"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Loader2, LogOut, MonitorSmartphone, RefreshCw, ShieldAlert, UserCheck, UserPlus, Users, UserX } from "lucide-react";
import { AppleLogo, WindowsLogo } from "@/components/marketing/desktop-platforms";
import { cn } from "@/lib/utils";
import { brand } from "@/lib/brand";
import { LogoMark } from "@/components/ui/logo";
import { authEnabled, useAuth } from "@/lib/auth/store";
import { currentIdToken, signInWithGoogle, signOutUser } from "@/lib/auth/firebase";
import { UsersTable } from "./users-table";
import { SharesTable } from "./shares-table";
import { BreakdownSection } from "./breakdown";
import type { DesktopPeople, DesktopUsage, DownloadStats, UserStats, VisitorStats } from "@/lib/server/admin";

/** The only account that may sign in here. The server checks this too (ADMIN_EMAILS). */
const OWNER = (process.env.NEXT_PUBLIC_ADMIN_EMAIL || "prabeenbhattarai7450@gmail.com").toLowerCase();

type Part<T> = { data: T } | { error: string };
interface Stats { admin: string; generatedAt: string; users: Part<UserStats>; visitors: Part<VisitorStats>; downloads: Part<DownloadStats>; desktop: Part<DesktopUsage>; people: Part<DesktopPeople> }
type Win = "d1" | "d7" | "d30";
const WINDOWS: { id: Win; label: string }[] = [{ id: "d1", label: "24 hours" }, { id: "d7", label: "7 days" }, { id: "d30", label: "30 days" }];

const fmt = (n: number) => n.toLocaleString();
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—");

function Card({ icon: Icon, label, value, hint, tone = "default" }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; hint?: string; tone?: "default" | "accent" }) {
  return (
    <div className={cn("min-w-0 rounded-2xl border p-4 sm:p-5", tone === "accent" ? "border-accent/30 bg-accent-soft" : "border-border bg-surface")}>
      <div className="flex items-center gap-2 text-[12.5px] font-medium text-ink-3 sm:text-[13px]"><Icon className={cn("size-4", tone === "accent" && "text-accent")} aria-hidden /> {label}</div>
      <p className="mt-3 text-[26px] leading-none font-semibold tracking-tight text-ink tabular-nums sm:text-[32px]">{value}</p>
      {hint && <p className="mt-2 text-[12.5px] text-ink-3">{hint}</p>}
    </div>
  );
}

const OS_LABEL: Record<string, string> = { mac: "macOS", windows: "Windows" };

function DesktopPeopleTable({ data }: { data: DesktopPeople }) {
  const known = data.people.filter((p) => p.known).length;
  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
        <p className="text-[13px] font-medium text-ink-3">Who used the app · last 30 days</p>
        <p className="text-[12.5px] text-ink-3">{known} signed in · {data.people.length - known} unknown</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[14px]">
          <thead className="text-[12px] text-ink-3"><tr><th className="px-5 py-2 font-medium">User</th><th className="px-5 py-2 font-medium">System</th><th className="px-5 py-2 font-medium">Last used</th><th className="px-5 py-2 font-medium">First used</th><th className="px-5 py-2 text-right font-medium">Activity</th></tr></thead>
          <tbody>
            {data.people.length === 0 && <tr><td colSpan={5} className="px-5 py-6 text-center text-ink-3">No one has used the desktop app in the last 30 days.</td></tr>}
            {data.people.map((p, i) => (
              <tr key={`${p.email ?? "unknown"}-${p.lastSeen}-${i}`} className="border-t border-border">
                <td className="px-5 py-3">
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
                <td className="px-5 py-3 whitespace-nowrap text-ink-2">{p.os ? OS_LABEL[p.os] ?? p.os : "—"}{p.version ? <span className="text-ink-3"> · v{p.version}</span> : null}</td>
                <td className="px-5 py-3 whitespace-nowrap text-ink-2">{when(p.lastSeen)}</td>
                <td className="px-5 py-3 whitespace-nowrap text-ink-2">{when(p.firstSeen)}</td>
                <td className="px-5 py-3 text-right whitespace-nowrap text-ink-2 tabular-nums">{fmt(p.count)} {p.known ? (p.count === 1 ? "open" : "opens") : (p.count === 1 ? "page" : "pages")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.notes.map((n) => <p key={n} className="border-t border-border px-5 py-2.5 text-[12.5px] text-ink-3">{n}</p>)}
    </div>
  );
}

function Missing({ text }: { text: string }) {
  return <p className="rounded-2xl border border-dashed border-border-strong bg-surface p-5 text-[14px] text-ink-3">{text}</p>;
}

function SignupChart({ daily }: { daily: UserStats["daily"] }) {
  const max = Math.max(1, ...daily.map((d) => d.signups));
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <p className="text-[13px] font-medium text-ink-3">Sign-ups, last 30 days</p>
      <div className="mt-4 flex h-32 items-end gap-[3px]" role="img" aria-label={`Sign-ups per day: ${daily.map((d) => `${d.date} ${d.signups}`).join(", ")}`}>
        {daily.map((d) => (
          <div key={d.date} className="group relative flex-1">
            <div className="rounded-t bg-accent/80 transition-colors group-hover:bg-accent" style={{ height: `${Math.max(2, (d.signups / max) * 128)}px` }} />
            <span className="pointer-events-none absolute bottom-full left-1/2 mb-1 hidden -translate-x-1/2 rounded bg-ink px-1.5 py-0.5 text-[11px] whitespace-nowrap text-bg group-hover:block">{d.date.slice(5)}: {d.signups}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-ink-3"><span>{daily[0]?.date.slice(5)}</span><span>today</span></div>
    </div>
  );
}

export function AdminDashboard() {
  const user = useAuth((s) => s.user);
  const ready = useAuth((s) => s.ready);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  // Bumped by Refresh so the users table reloads with the overview.
  const [refreshKey, setRefreshKey] = useState(0);
  const [win, setWin] = useState<Win>("d7");
  const [rejected, setRejected] = useState<string | null>(null);
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

  if (!authEnabled) return <Shell><Missing text="Sign-in isn't configured (NEXT_PUBLIC_FIREBASE_* variables)." /></Shell>;
  if (!ready) return <Shell><Loader2 className="mx-auto mt-24 size-6 animate-spin text-ink-3" /></Shell>;

  if (!user) {
    return (
      <Shell>
        <div className="mx-auto mt-16 max-w-sm rounded-3xl border border-border bg-surface p-8 text-center shadow-sm">
          <LogoMark className="mx-auto size-12" />
          <h1 className="mt-5 text-[22px] font-semibold tracking-tight text-ink">{brand.name} admin</h1>
          <p className="mt-2 text-[14px] text-ink-3">Only the owner&apos;s Google account can sign in here.</p>
          {rejected && <p role="alert" className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-[13px] text-danger">{rejected} isn&apos;t allowed. It has been signed out.</p>}
          <button type="button" disabled={busy} onClick={async () => { setBusy(true); setRejected(null); try { await signInWithGoogle(OWNER); } catch { /* closed */ } finally { setBusy(false); } }}
            className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-border-strong bg-white text-[15px] font-semibold text-[#1f1f1f] hover:bg-[#f8f9fa] disabled:opacity-70">
            {busy ? <Loader2 className="size-5 animate-spin" /> : null} Sign in with Google
          </button>
        </div>
      </Shell>
    );
  }

  if (!isOwner) return <Shell><Loader2 className="mx-auto mt-24 size-6 animate-spin text-ink-3" /></Shell>;

  if (error?.status === 403) {
    return (
      <Shell user={user.email}>
        <div className="mx-auto mt-16 max-w-sm rounded-3xl border border-border bg-surface p-8 text-center">
          <ShieldAlert className="mx-auto size-10 text-danger" />
          <h1 className="mt-4 text-[20px] font-semibold text-ink">Access denied</h1>
          <p className="mt-2 text-[14px] text-ink-3">{error.message}</p>
          <button type="button" onClick={() => void signOutUser()} className="mt-6 h-11 w-full rounded-xl border border-border text-[14px] font-medium text-ink-2 hover:bg-surface-2">Sign out</button>
        </div>
      </Shell>
    );
  }

  // Nothing below renders until the server has confirmed this account is an admin.
  if (!stats) {
    return (
      <Shell user={user.email}>
        {error ? (
          <div className="mx-auto mt-16 max-w-sm rounded-3xl border border-border bg-surface p-8 text-center">
            <ShieldAlert className="mx-auto size-10 text-danger" />
            <h1 className="mt-4 text-[20px] font-semibold text-ink">{error.status === 401 ? "Please sign in again" : "Couldn't load the admin panel"}</h1>
            <p className="mt-2 text-[14px] text-ink-3">{error.message}</p>
            <div className="mt-6 flex gap-2">
              <button type="button" onClick={() => void load()} className="h-11 flex-1 rounded-xl bg-ink text-[14px] font-medium text-bg hover:opacity-90">Try again</button>
              <button type="button" onClick={() => void signOutUser()} className="h-11 flex-1 rounded-xl border border-border text-[14px] font-medium text-ink-2 hover:bg-surface-2">Sign out</button>
            </div>
          </div>
        ) : (
          <div className="mt-24 flex flex-col items-center gap-3 text-[14px] text-ink-3"><Loader2 className="size-6 animate-spin" /> Checking access…</div>
        )}
      </Shell>
    );
  }

  const v = "data" in stats.visitors ? stats.visitors.data[win] : null;
  const u = "data" in stats.users ? stats.users.data : null;
  const dl = "data" in stats.downloads ? stats.downloads.data : null;
  const dk = "data" in stats.desktop ? stats.desktop.data[win] : null;
  const label = WINDOWS.find((w) => w.id === win)!.label;

  return (
    <Shell user={user.email}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight text-ink">Overview</h1>
          <p className="mt-1 text-[13px] text-ink-3">{stats ? `Updated ${when(stats.generatedAt)}` : "Loading…"}</p>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <div className="flex flex-1 rounded-xl border border-border bg-surface p-1 sm:flex-none" role="tablist" aria-label="Time range">
            {WINDOWS.map((w) => (
              <button key={w.id} role="tab" aria-selected={win === w.id} onClick={() => setWin(w.id)}
                className={cn("flex-1 rounded-lg px-3 py-1.5 text-[13px] font-medium whitespace-nowrap sm:flex-none", win === w.id ? "bg-ink text-bg" : "text-ink-3 hover:text-ink")}>{w.label}</button>
            ))}
          </div>
          <button type="button" onClick={() => void load()} disabled={loading} aria-label="Refresh" className="flex size-10 items-center justify-center rounded-xl border border-border bg-surface text-ink-2 hover:bg-surface-2">
            <RefreshCw className={cn("size-4", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {error && error.status !== 403 && <p role="alert" className="mt-6 rounded-xl bg-danger/10 px-4 py-3 text-[14px] text-danger">{error.message}</p>}

      <h2 className="mt-8 text-[13px] font-semibold tracking-wide text-ink-3 uppercase">Registered users</h2>
      {stats && "error" in stats.users ? <div className="mt-3"><Missing text={stats.users.error} /></div> : (
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card icon={UserCheck} label="Total registered" value={u ? fmt(u.total) : "…"} hint="All time" tone="accent" />
          <Card icon={UserPlus} label="New · last 24 hours" value={u ? fmt(u.new.d1) : "…"} hint={u ? `${fmt(u.total - u.new.d1)} registered before that` : undefined} tone="accent" />
          <Card icon={UserPlus} label="New · 7 days" value={u ? fmt(u.new.d7) : "…"} hint={u ? `${fmt(u.new.d30)} in 30 days` : undefined} />
          <Card icon={Users} label={`Active · ${label}`} value={u ? fmt(u.active[win]) : "…"} hint="Signed in or used the site while signed in" />
        </div>
      )}

      <h2 className="mt-10 text-[13px] font-semibold tracking-wide text-ink-3 uppercase">Visitors · {WINDOWS.find((w) => w.id === win)!.label}</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats && "error" in stats.visitors ? <div className="col-span-2 lg:col-span-4"><Missing text={stats.visitors.error} /></div> : (
          <>
            <Card icon={Users} label="Unique visitors" value={v ? fmt(v.visitors) : "…"} hint="Everyone who opened a page" />
            <Card icon={UserX} label="Not registered" value={v ? fmt(v.guests) : "…"} hint={v && v.visitors ? `${Math.round((v.guests / v.visitors) * 100)}% of visitors` : "Used PDFella without signing in"} />
            <Card icon={UserCheck} label="Signed-in visitors" value={v ? fmt(v.signedIn) : "…"} hint={v && v.visitors ? `${Math.round((v.signedIn / v.visitors) * 100)}% of visitors` : undefined} tone="accent" />
            <Card icon={Users} label="Page views" value={v ? fmt(v.pageviews) : "…"} />
          </>
        )}
      </div>

      <BreakdownSection days={win === "d1" ? 1 : win === "d30" ? 30 : 7} label={label} refreshKey={refreshKey} />

      <h2 className="mt-10 text-[13px] font-semibold tracking-wide text-ink-3 uppercase">Desktop app</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {"error" in stats.downloads ? <div className="col-span-2"><Missing text={stats.downloads.error} /></div> : (
          <>
            <Card icon={Download} label="Downloads · all time" value={dl ? fmt(dl.total) : "…"} hint="Installer downloads from the download page" tone="accent" />
            <Card icon={AppleLogo} label="macOS downloads" value={dl ? fmt(dl.mac) : "…"} hint={dl && dl.total ? `${Math.round((dl.mac / dl.total) * 100)}% of downloads` : undefined} />
            <Card icon={WindowsLogo} label="Windows downloads" value={dl ? fmt(dl.windows) : "…"} hint={dl && dl.total ? `${Math.round((dl.windows / dl.total) * 100)}% of downloads` : undefined} />
          </>
        )}
        {"error" in stats.desktop ? <Missing text={stats.desktop.error} /> : (
          <Card icon={MonitorSmartphone} label={`App users · ${label}`} value={dk ? fmt(dk.users) : "…"} hint={dk ? `${fmt(dk.mac)} Mac · ${fmt(dk.windows)} Windows · ${fmt(dk.pageviews)} page views` : undefined} />
        )}
      </div>
      {dl && dl.releases.length > 0 && (
        <div className="mt-3 overflow-hidden rounded-2xl border border-border bg-surface">
          <p className="border-b border-border px-5 py-3 text-[13px] font-medium text-ink-3">Downloads by version</p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[14px]">
              <thead className="text-[12px] text-ink-3"><tr><th className="px-5 py-2 font-medium">Version</th><th className="px-5 py-2 font-medium">Released</th><th className="px-5 py-2 text-right font-medium">macOS</th><th className="px-5 py-2 text-right font-medium">Windows</th></tr></thead>
              <tbody>
                {dl.releases.map((r) => (
                  <tr key={r.tag} className="border-t border-border">
                    <td className="px-5 py-2.5 font-medium text-ink">{r.tag}</td>
                    <td className="px-5 py-2.5 whitespace-nowrap text-ink-2">{when(r.publishedAt)}</td>
                    <td className="px-5 py-2.5 text-right text-ink-2 tabular-nums">{fmt(r.mac)}</td>
                    <td className="px-5 py-2.5 text-right text-ink-2 tabular-nums">{fmt(r.windows)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {"error" in stats.people ? <div className="mt-3"><Missing text={stats.people.error} /></div> : <DesktopPeopleTable data={stats.people.data} />}

      <h2 className="mt-10 text-[13px] font-semibold tracking-wide text-ink-3 uppercase">Sign-ups</h2>
      {stats && "error" in stats.users ? <div className="mt-3"><Missing text={stats.users.error} /></div> : (
        <>
          {u && <div className="mt-3"><SignupChart daily={u.daily} /></div>}
          <UsersTable refreshKey={refreshKey} />
        </>
      )}
      <SharesTable refreshKey={refreshKey} />
      <p className="mt-8 text-[12px] text-ink-3">Visitors and app users come from PostHog. Without cookies a visitor gets a new anonymous ID each day, so 7- and 30-day counts include repeat visits on different days. Downloads come from GitHub and include the test downloads made while setting the app up.</p>
    </Shell>
  );
}

function Shell({ children, user }: { children: React.ReactNode; user?: string | null }) {
  return (
    <div className="min-h-dvh bg-bg">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <LogoMark className="size-7 drop-shadow-none" />
          <span className="text-[15px] font-semibold text-ink">{brand.name}</span>
          <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">Admin</span>
          {user && (
            <div className="ml-auto flex items-center gap-3">
              <span className="hidden text-[13px] text-ink-3 sm:inline">{user}</span>
              <button type="button" onClick={() => void signOutUser()} aria-label="Sign out" className="flex size-9 items-center justify-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink"><LogOut className="size-4" /></button>
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
