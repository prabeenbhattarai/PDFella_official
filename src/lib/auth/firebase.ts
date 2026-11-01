/**
 * Firebase Authentication (Google sign-in), loaded on demand so pages that
 * never touch auth don't download the SDK up front.
 */
import type { Auth, User } from "firebase/auth";
import type { AuthUser } from "./store";
import { isDesktopApp, startDesktopSignIn } from "./desktop";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let authPromise: Promise<Auth> | null = null;

export function getFirebaseAuth(): Promise<Auth> {
  authPromise ??= Promise.all([import("firebase/app"), import("firebase/auth")]).then(([app, auth]) => {
    const instance = app.getApps()[0] ?? app.initializeApp(config);
    return auth.getAuth(instance);
  });
  return authPromise;
}

export const toAuthUser = (u: User): AuthUser => ({ uid: u.uid, name: u.displayName, email: u.email, photo: u.photoURL });

/** The "Continue with Google" button: Google's account chooser in a popup. */
export async function signInWithGoogle(loginHint?: string) {
  // The desktop app can't show Google sign-in; it hands over to the system browser.
  if (isDesktopApp()) return startDesktopSignIn();
  const [auth, { GoogleAuthProvider, signInWithPopup }] = await Promise.all([getFirebaseAuth(), import("firebase/auth")]);
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account", ...(loginHint ? { login_hint: loginHint } : {}) });
  await signInWithPopup(auth, provider);
}

/** Google One Tap hands us an ID token for the account the visitor picked. */
export async function signInWithGoogleIdToken(idToken: string) {
  const [auth, { GoogleAuthProvider, signInWithCredential }] = await Promise.all([getFirebaseAuth(), import("firebase/auth")]);
  await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
}

export async function signOutUser() {
  const [auth, { signOut }] = await Promise.all([getFirebaseAuth(), import("firebase/auth")]);
  await signOut(auth);
}

/** The signed-in user's Firebase ID token, for calling our own APIs. */
export async function currentIdToken(): Promise<string | null> {
  const auth = await getFirebaseAuth();
  return auth.currentUser ? auth.currentUser.getIdToken() : null;
}

/** Desktop hand-over: sign in with the custom token the browser passed back. */
export async function signInWithFirebaseCustomToken(token: string) {
  const [auth, { signInWithCustomToken }] = await Promise.all([getFirebaseAuth(), import("firebase/auth")]);
  await signInWithCustomToken(auth, token);
}
