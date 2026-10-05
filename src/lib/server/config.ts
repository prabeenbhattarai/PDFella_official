import "server-only";
import { brand } from "../brand";

/**
 * Server configuration. Backends are chosen from the environment:
 *
 *   STORAGE_BACKEND = gcs | local        (default: local)
 *   JOBS_BACKEND    = firestore | memory (default: memory)
 *   QUEUE_BACKEND   = cloudtasks | direct (default: direct)
 *
 * Processing is "available" only when a worker URL is configured.
 */
function env(name: string, fallback?: string): string | undefined {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : v;
}

export const config = {
  appUrl: env("APP_URL", brand.url)!,
  workerUrl: env("WORKER_URL"),
  /** Shared HMAC secret for capability tokens, signed local URLs and worker callbacks. */
  secret: env("APP_SECRET", process.env.NODE_ENV === "production" ? undefined : "dev-insecure-secret-change-me"),
  cronSecret: env("CRON_SECRET"),
  storage: (env("STORAGE_BACKEND", "local") as "gcs" | "local"),
  jobs: (env("JOBS_BACKEND", "memory") as "firestore" | "memory"),
  queue: (env("QUEUE_BACKEND", "direct") as "cloudtasks" | "direct"),
  bucket: env("STORAGE_BUCKET"),
  localDataDir: env("LOCAL_DATA_DIR", ".data")!,
  gcp: {
    project: env("GCP_PROJECT"),
    location: env("CLOUD_TASKS_LOCATION", "europe-west1")!,
    queue: env("CLOUD_TASKS_QUEUE", "pdf-jobs")!,
    invokerServiceAccount: env("WORKER_INVOKER_SA"),
  },
  /** How long a job (and its files) may live before the cleanup sweep removes it. */
  jobTtlMs: Number(env("JOB_TTL_MINUTES", "60")) * 60_000,
  signedUrlTtlSec: 15 * 60,
};

export function processingAvailable() {
  return Boolean(config.workerUrl && config.secret);
}

export function requireSecret(): string {
  if (!config.secret) throw new Error("APP_SECRET must be set in production");
  return config.secret;
}
