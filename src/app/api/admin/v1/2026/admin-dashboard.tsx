"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, LogOut, RefreshCw, ShieldAlert, UserCheck, UserPlus, Users, UserX } from "lucide-react";
import { cn } from "@/lib/utils";
import { brand } from "@/lib/brand";
import { LogoMark } from "@/components/ui/logo";
import { authEnabled, useAuth } from "@/lib/auth/store";
import { currentIdToken, signInWithGoogle, signOutUser } from "@/lib/auth/firebase";
import type { UserStats, VisitorStats } from "@/lib/server/admin";

/** The only account that may sign in here. The server checks this too (ADMIN_EMAILS). */
const OWNER = (process.env.NEXT_PUBLIC_ADMIN_EMAIL || "prabeenbhattarai7450@gmail.com").toLowerCase();

type Part<T> = { data: T } | { error: string };
interface Stats { admin: string; generatedAt: string; users: Part<UserStats>; visitors: Part<VisitorStats> }
type Win = "d1" | "d7" | "d30";
const WINDOWS: { id: Win; label: string }[] = [{ id: "d1", label: "24 hours" }, { id: "d7", label: "7 days" }, { id: "d30", label: "30 days" }];

const fmt = (n: number) => n.toLocaleString();
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—");

function Card({ icon: Icon, label, value, hint, tone = "default" }: { icon: typeof Users; label: string; value: string; hint?: string; tone?: "default" | "accent" }) {
  return (
    <div className={cn("rounded-2xl border p-5", tone === "accent" ? "border-accent/30 bg-accent-soft" : "border-border bg-surface")}>
      <div className="flex items-center gap-2 text-[13px] font-medium text-ink-3"><Icon className={cn("size-4", tone === "accent" && "text-accent")} aria-hidden /> {label}</div>
      <p className="mt-3 text-[32px] leading-none font-semibold tracking-tight text-ink tabular-nums">{value}</p>
      {hint && <p className="mt-2 text-[12.5px] text-ink-3">{hint}</p>}
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
  const [win, setWin] = useState<Win>("d7");
  const [rejected, setRejected] = useState<string | null>(null);
  const isOwner = user?.email?.toLowerCase() === OWNER;

  const load = useCallback(async () => {
    setLoading(true);
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
      void signOutUser();
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

  return (
    <Shell user={user.email}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight text-ink">Overview</h1>
          <p className="mt-1 text-[13px] text-ink-3">{stats ? `Updated ${when(stats.generatedAt)}` : "Loading…"}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl border border-border bg-surface p-1" role="tablist" aria-label="Time range">
            {WINDOWS.map((w) => (
              <button key={w.id} role="tab" aria-selected={win === w.id} onClick={() => setWin(w.id)}
                className={cn("rounded-lg px-3 py-1.5 text-[13px] font-medium", win === w.id ? "bg-ink text-bg" : "text-ink-3 hover:text-ink")}>{w.label}</button>
            ))}
          </div>
          <button type="button" onClick={() => void load()} disabled={loading} aria-label="Refresh" className="flex size-10 items-center justify-center rounded-xl border border-border bg-surface text-ink-2 hover:bg-surface-2">
            <RefreshCw className={cn("size-4", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {error && error.status !== 403 && <p role="alert" className="mt-6 rounded-xl bg-danger/10 px-4 py-3 text-[14px] text-danger">{error.message}</p>}

      <h2 className="mt-8 text-[13px] font-semibold tracking-wide text-ink-3 uppercase">Visitors · {WINDOWS.find((w) => w.id === win)!.label}</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats && "error" in stats.visitors ? <div className="sm:col-span-2 lg:col-span-4"><Missing text={stats.visitors.error} /></div> : (
          <>
            <Card icon={Users} label="Unique visitors" value={v ? fmt(v.visitors) : "…"} hint="Everyone who opened a page" />
            <Card icon={UserX} label="Not registered" value={v ? fmt(v.guests) : "…"} hint={v && v.visitors ? `${Math.round((v.guests / v.visitors) * 100)}% of visitors` : "Used PDFella without signing in"} />
            <Card icon={UserCheck} label="Signed-in visitors" value={v ? fmt(v.signedIn) : "…"} hint={v && v.visitors ? `${Math.round((v.signedIn / v.visitors) * 100)}% of visitors` : undefined} tone="accent" />
            <Card icon={Users} label="Page views" value={v ? fmt(v.pageviews) : "…"} />
          </>
        )}
      </div>

      <h2 className="mt-10 text-[13px] font-semibold tracking-wide text-ink-3 uppercase">Registered users</h2>
      {stats && "error" in stats.users ? <div className="mt-3"><Missing text={stats.users.error} /></div> : (
        <>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card icon={UserCheck} label="Total registered" value={u ? fmt(u.total) : "…"} hint="All time" tone="accent" />
            <Card icon={UserPlus} label={`New · ${WINDOWS.find((w) => w.id === win)!.label}`} value={u ? fmt(u.new[win]) : "…"} />
            <Card icon={Users} label={`Active · ${WINDOWS.find((w) => w.id === win)!.label}`} value={u ? fmt(u.active[win]) : "…"} hint="Signed in or used the site while signed in" />
            <Card icon={UserPlus} label="New · 30 days" value={u ? fmt(u.new.d30) : "…"} />
          </div>
          {u && <div className="mt-3"><SignupChart daily={u.daily} /></div>}
          {u && (
            <div className="mt-3 overflow-hidden rounded-2xl border border-border bg-surface">
              <p className="border-b border-border px-5 py-3 text-[13px] font-medium text-ink-3">Latest sign-ups</p>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[14px]">
                  <thead className="text-[12px] text-ink-3"><tr><th className="px-5 py-2 font-medium">User</th><th className="px-5 py-2 font-medium">Joined</th><th className="px-5 py-2 font-medium">Last sign-in</th></tr></thead>
                  <tbody>
                    {u.recent.length === 0 && <tr><td colSpan={3} className="px-5 py-6 text-center text-ink-3">No one has signed up yet.</td></tr>}
                    {u.recent.map((r) => (
                      <tr key={`${r.email}-${r.createdAt}`} className="border-t border-border">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            {/* eslint-disable-next-line @next/next/no-img-element -- remote Google avatar */}
                            {r.photo ? <img src={r.photo} alt="" referrerPolicy="no-referrer" className="size-8 rounded-full" /> : <span className="flex size-8 items-center justify-center rounded-full bg-surface-2 text-[13px] font-semibold">{(r.name ?? r.email ?? "?").charAt(0).toUpperCase()}</span>}
                            <div className="min-w-0"><p className="truncate font-medium text-ink">{r.name ?? "—"}</p><p className="truncate text-[12.5px] text-ink-3">{r.email}</p></div>
                          </div>
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap text-ink-2">{when(r.createdAt)}</td>
                        <td className="px-5 py-3 whitespace-nowrap text-ink-2">{when(r.lastSignInAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
      <p className="mt-8 text-[12px] text-ink-3">Visitors come from PostHog. Without cookies a visitor gets a new anonymous ID each day, so 7- and 30-day counts include repeat visits on different days.</p>
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
