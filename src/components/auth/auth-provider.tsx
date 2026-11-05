"use client";

import { useEffect } from "react";
import type { User } from "firebase/auth";
import { usePathname } from "next/navigation";
import { authEnabled, useAuth } from "@/lib/auth/store";
import { currentIdToken, getFirebaseAuth, toAuthUser } from "@/lib/auth/firebase";
import { loadGsi } from "@/lib/auth/gsi";
import { SignInDialog, SKIPPED } from "./sign-in-dialog";
import { SignOutOverlay } from "./sign-out-overlay";
import { UpgradeDialog } from "@/components/plans/upgrade-dialog";
import { claimTier, usePlan } from "@/lib/plans";

const PLAN_RECHECK_MS = 15_000;

/**
 * A fresh token, so a plan bought or changed elsewhere shows up straight away. If the
 * network fails, the token we already have decides, so a blip never locks out someone who paid.
 */
async function syncPlan(u: User) {
  const result = await u.getIdTokenResult(true).catch(() => u.getIdTokenResult(false)).catch(() => null);
  const { tier, loaded, setTier } = usePlan.getState();
  if (result) setTier(claimTier(result.claims.plan));
  else if (!loaded) setTier(tier);
}

const skipped = () => { try { return sessionStorage.getItem(SKIPPED) === "1"; } catch { return false; } };

/** Google One Tap: Google's own card offering the accounts already signed in to this browser. */
function useOneTap(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    loadGsi().then((google) => {
      if (!cancelled && !useAuth.getState().prompt) google?.accounts.id.prompt();
    });
    return () => {
      cancelled = true;
      void loadGsi().then((google) => google?.accounts.id.cancel());
    };
  }, [enabled]);
}

/** Restores the session, offers Google One Tap and asks editor visitors to sign in once per session. */
export function AuthProvider() {
  const pathname = usePathname();
  const user = useAuth((s) => s.user);
  const ready = useAuth((s) => s.ready);

  useEffect(() => {
    if (!authEnabled) return;
    let unsub: (() => void) | undefined;
    let cancelled = false;
    Promise.all([getFirebaseAuth(), import("firebase/auth")]).then(([auth, { onAuthStateChanged }]) => {
      if (cancelled) return;
      unsub = onAuthStateChanged(auth, (u) => {
        useAuth.getState().setUser(u ? toAuthUser(u) : null);
        if (u) void syncPlan(u);
        else usePlan.getState().setTier("free");
      });
    }).catch(() => useAuth.getState().setUser(null));
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, []);

  // Back on this tab: someone who just paid in another tab or the browser gets their plan here too.
  useEffect(() => {
    if (!authEnabled) return;
    let last = Date.now();
    const recheck = () => {
      if (document.visibilityState !== "visible" || Date.now() - last < PLAN_RECHECK_MS) return;
      last = Date.now();
      void getFirebaseAuth().then((auth) => { if (auth.currentUser) void syncPlan(auth.currentUser); });
    };
    document.addEventListener("visibilitychange", recheck);
    window.addEventListener("focus", recheck);
    return () => {
      document.removeEventListener("visibilitychange", recheck);
      window.removeEventListener("focus", recheck);
    };
  }, []);

  // Once per session: record this account's country (and desktop app use) for the admin panel.
  const uid = user?.uid;
  useEffect(() => {
    if (!uid) return;
    try { if (sessionStorage.getItem("pdfella:seen") === uid) return; sessionStorage.setItem("pdfella:seen", uid); } catch { /* storage blocked */ }
    void currentIdToken().then((token) => token ? fetch("/api/auth/seen", { method: "POST", headers: { Authorization: `Bearer ${token}` } }) : null).catch(() => {});
  }, [uid]);

  const editor = pathname.startsWith("/editor");

  // Opening the editor: offer sign-in once per session (skippable).
  useEffect(() => {
    if (authEnabled && ready && !user && editor && !skipped()) useAuth.getState().openPrompt("editor");
  }, [ready, user, editor]);

  // Everywhere else: One Tap, so returning visitors sign in with a single tap.
  useOneTap(authEnabled && ready && !user && !editor && !pathname.startsWith("/api/admin"));

  return <>{authEnabled && <><SignInDialog /><SignOutOverlay /></>}<UpgradeDialog /></>;
}
