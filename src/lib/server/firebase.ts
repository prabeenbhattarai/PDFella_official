import "server-only";
import { getApps, initializeApp, applicationDefault, type App } from "firebase-admin/app";
import { config } from "./config";

/** Firebase Admin uses Application Default Credentials (Workload Identity on Cloud Run / Vercel OIDC). */
export function adminApp(): App {
  return getApps()[0] ?? initializeApp({ credential: applicationDefault(), projectId: config.gcp.project, storageBucket: config.bucket });
}
