/**
 * Google Identity Services (accounts.google.com/gsi/client): One Tap and the
 * personalised "Continue as …" button. Both hand back a Google ID token, which
 * signs in to Firebase. Loaded once, on demand.
 */
import { signInWithGoogleIdToken } from "./firebase";
import { isDesktopApp } from "./desktop";

export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

export interface GoogleId {
  accounts: { id: {
    initialize(o: Record<string, unknown>): void;
    prompt(): void;
    cancel(): void;
    renderButton(el: HTMLElement, o: Record<string, unknown>): void;
  } };
}

let loading: Promise<GoogleId | null> | null = null;
let onError: ((e: unknown) => void) | null = null;

/** Where to report a failed sign-in from a Google-rendered control (the dialog sets this while open). */
export function setGsiErrorHandler(fn: ((e: unknown) => void) | null) {
  onError = fn;
}

export function loadGsi(): Promise<GoogleId | null> {
  // No One Tap or Google button in the desktop app: Google blocks them in web views.
  if (!GOOGLE_CLIENT_ID || isDesktopApp()) return Promise.resolve(null);
  loading ??= new Promise<GoogleId | null>((resolve) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => {
      const google = (window as unknown as { google?: GoogleId }).google ?? null;
      google?.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: ({ credential }: { credential: string }) => {
          signInWithGoogleIdToken(credential).catch((e) => onError?.(e));
        },
        auto_select: false,
        cancel_on_tap_outside: true,
        context: "signin",
        itp_support: true,
        use_fedcm_for_prompt: true,
      });
      resolve(google);
    };
    s.onerror = () => {
      loading = null;
      resolve(null);
    };
    document.head.appendChild(s);
  });
  return loading;
}
