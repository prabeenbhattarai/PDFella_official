/**
 * Browser client for server-side processing (OCR, Office conversion, true
 * redaction, encryption…). Flow: create job → PUT file to signed URL → start →
 * poll → download result from signed URL. See docs/API.md.
 */
import type { ServerOp } from "../tools";

export interface JobStatus {
  jobId: string;
  status: "UPLOADING" | "PROCESSING" | "READY" | "ERROR" | "EXPIRED";
  progress?: number;
  resultUrl?: string;
  resultName?: string;
  error?: { code: string; message: string };
}

export class ProcessingUnavailableError extends Error {
  constructor() {
    super("The document processing service is not available.");
  }
}

export class ProcessingError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

let available: { at: number; value: Promise<boolean> } | null = null;

/** True when the API reports a reachable processing backend (re-checked every 20s). */
export function isProcessingAvailable(): Promise<boolean> {
  if (!available || Date.now() - available.at > 20_000) {
    available = {
      at: Date.now(),
      value: fetch("/api/health", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => Boolean(j?.processing))
        .catch(() => false),
    };
  }
  return available.value;
}

export interface RunJobOptions {
  params?: Record<string, unknown>;
  onProgress?: (phase: "uploading" | "processing" | "downloading", pct: number) => void;
  signal?: AbortSignal;
}

function putWithProgress(url: string, body: Blob, onProgress?: (pct: number) => void, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", body.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new ProcessingError("upload_failed", "Upload failed")));
    xhr.onerror = () => reject(new ProcessingError("network", "Network error during upload"));
    signal?.addEventListener("abort", () => xhr.abort());
    xhr.send(body);
  });
}

export async function runJob(op: ServerOp, files: { name: string; blob: Blob }[], opts: RunJobOptions = {}): Promise<{ blob: Blob; name: string }> {
  if (!(await isProcessingAvailable())) throw new ProcessingUnavailableError();
  const create = await fetch("/api/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op, files: files.map((f) => ({ name: f.name, size: f.blob.size, type: f.blob.type })) }),
    signal: opts.signal,
  });
  if (!create.ok) {
    const j = await create.json().catch(() => ({}));
    throw new ProcessingError(j.code ?? "create_failed", j.message ?? "Could not start processing");
  }
  const { jobId, token, uploads } = (await create.json()) as { jobId: string; token: string; uploads: { url: string }[] };
  const auth = { Authorization: `Bearer ${token}` };

  for (let i = 0; i < files.length; i++) {
    await putWithProgress(uploads[i].url, files[i].blob, (p) => opts.onProgress?.("uploading", Math.round(((i + p / 100) / files.length) * 100)), opts.signal);
  }
  // Parameters (which may include a password) are sent only when starting; they are never stored in the job record.
  const start = await fetch(`/api/jobs/${jobId}/start`, { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ params: opts.params ?? {} }), signal: opts.signal });
  if (!start.ok) {
    const j = await start.json().catch(() => ({}));
    throw new ProcessingError(j.code ?? "start_failed", j.message ?? "Could not start processing");
  }

  let delay = 600;
  const deadline = Date.now() + 15 * 60_000;
  for (;;) {
    if (Date.now() > deadline) throw new ProcessingError("timeout", "Processing took too long. Please try again.");
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 1.4, 3000);
    const r = await fetch(`/api/jobs/${jobId}`, { headers: auth, cache: "no-store", signal: opts.signal });
    if (!r.ok) throw new ProcessingError("status_failed", "Lost track of the processing job");
    const s = (await r.json()) as JobStatus;
    if (s.status === "PROCESSING") opts.onProgress?.("processing", s.progress ?? 0);
    if (s.status === "ERROR") {
      if (s.error?.code === "unavailable") throw new ProcessingUnavailableError();
      throw new ProcessingError(s.error?.code ?? "failed", s.error?.message ?? "Processing failed");
    }
    if (s.status === "EXPIRED") throw new ProcessingError("expired", "This job expired. Please try again.");
    if (s.status === "READY" && s.resultUrl) {
      opts.onProgress?.("downloading", 0);
      const res = await fetch(s.resultUrl, { signal: opts.signal });
      if (!res.ok) throw new ProcessingError("download_failed", "Could not download the result");
      const blob = await res.blob();
      // Best effort: tell the server we're done so the files are deleted now rather than at expiry.
      fetch(`/api/jobs/${jobId}`, { method: "DELETE", headers: auth }).catch(() => {});
      return { blob, name: s.resultName ?? "result" };
    }
  }
}
