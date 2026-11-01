import { create } from "zustand";

/**
 * Who is signed in, and the "sign in to unlock" prompt. Firebase itself is
 * loaded lazily by components/auth/auth-provider.tsx; this store has no
 * Firebase import so the editor can check it without pulling the SDK in.
 */
export interface AuthUser { uid: string; name: string | null; email: string | null; photo: string | null }

/** What the visitor was trying to do when we asked them to sign in. */
export type LockedFeature = "editor" | "signature" | "stamp" | "pages" | "fonts";

export const authEnabled = !!process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

interface AuthState {
  user: AuthUser | null;
  /** False until Firebase has restored (or ruled out) a previous session. */
  ready: boolean;
  prompt: { feature: LockedFeature; onUnlock?: () => void } | null;
  setUser(user: AuthUser | null): void;
  openPrompt(feature: LockedFeature, onUnlock?: () => void): void;
  closePrompt(): void;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  ready: !authEnabled,
  prompt: null,
  setUser: (user) => set((s) => {
    // Finish what the visitor was doing when they signed in from the prompt.
    if (user && s.prompt?.onUnlock) queueMicrotask(s.prompt.onUnlock);
    return { user, ready: true, prompt: user ? null : s.prompt };
  }),
  openPrompt: (feature, onUnlock) => set({ prompt: { feature, onUnlock } }),
  closePrompt: () => set({ prompt: null }),
}));

/**
 * Gate for features that need an account. Returns true when the visitor may
 * go ahead; otherwise shows the sign-in prompt (running `onUnlock` once they
 * sign in) and returns false. Everything is unlocked when sign-in isn't configured.
 */
export function requireAuth(feature: LockedFeature, onUnlock?: () => void): boolean {
  if (!authEnabled) return true;
  const { user, ready, openPrompt } = useAuth.getState();
  if (user) return true;
  if (ready) {
    openPrompt(feature, onUnlock);
    return false;
  }
  // The session is still being restored (e.g. the editor opened with ?tool=signature): decide once it is.
  const unsub = useAuth.subscribe((s) => {
    if (!s.ready) return;
    unsub();
    if (s.user) onUnlock?.();
    else s.openPrompt(feature, onUnlock);
  });
  return false;
}
