import "server-only";
import { getApps, initializeApp, applicationDefault, cert, type App } from "firebase-admin/app";
import { config } from "./config";
import { serviceAccount } from "./firebase-auth";

/**
 * Firebase Admin signs in with FIREBASE_SERVICE_ACCOUNT when it's set (Vercel), and
 * otherwise with Application Default Credentials (Workload Identity on Cloud Run).
 */
export function adminApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const sa = serviceAccount();
    return initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }), projectId: config.gcp.project ?? sa.project_id, storageBucket: config.bucket });
  }
  return initializeApp({ credential: applicationDefault(), projectId: config.gcp.project, storageBucket: config.bucket });
}
