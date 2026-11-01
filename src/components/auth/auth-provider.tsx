"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { authEnabled, useAuth } from "@/lib/auth/store";
import { getFirebaseAuth, toAuthUser } from "@/lib/auth/firebase";
import { loadGsi } from "@/lib/auth/gsi";
import { SignInDialog, SKIPPED } from "./sign-in-dialog";

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
      unsub = onAuthStateChanged(auth, (u) => useAuth.getState().setUser(u ? toAuthUser(u) : null));
    }).catch(() => useAuth.getState().setUser(null));
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, []);

  const editor = pathname.startsWith("/editor");

  // Opening the editor: offer sign-in once per session (skippable).
  useEffect(() => {
    if (authEnabled && ready && !user && editor && !skipped()) useAuth.getState().openPrompt("editor");
  }, [ready, user, editor]);

  // Everywhere else: One Tap, so returning visitors sign in with a single tap.
  useOneTap(authEnabled && ready && !user && !editor && !pathname.startsWith("/api/admin"));

  return authEnabled ? <SignInDialog /> : null;
}
