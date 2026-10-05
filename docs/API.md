# API

All endpoints are Next.js route handlers under `/api`. Responses are JSON with `Cache-Control: no-store`. Errors are always `{ "code": string, "message": string }` with generic messages — never document data.

Anonymous clients are authorised per job by a **capability token** (HMAC of the job id) returned when the job is created. No cookies are used.

## Flow

```
POST /api/jobs                → { jobId, token, uploads: [{url}] }
PUT  uploads[i].url  (file)     # directly to private storage (V4 signed URL, 15 min, size-capped)
POST /api/jobs/:id/start      → 202   { params } in body (e.g. password) — never stored
GET  /api/jobs/:id            → { status, progress, resultUrl? }    poll
GET  resultUrl                  # signed download, 15 min
DELETE /api/jobs/:id          → 204   delete everything now
```

## Endpoints

### `GET /api/health`
`{ ok: true, processing: boolean }` — `processing` is true when a worker is configured. The UI uses it to decide whether cloud tools can run.

### `POST /api/jobs`
Body:
```json
{ "op": "ocr", "files": [{ "name": "scan.pdf", "size": 834221, "type": "application/pdf" }] }
```
* `op` ∈ `ocr, pdf-to-docx, pdf-to-xlsx, pdf-to-pptx, pdf-to-html, office-to-pdf, protect, unlock, repair, compress, redact, edit-text`
* File count, size (plan limit) and rate limits (10/min burst, daily quota) are enforced.

`201`:
```json
{ "jobId": "4YL-ALh61I9IXL5U9-S-wQ", "token": "…", "uploads": [{ "url": "https://storage.googleapis.com/…" }], "expiresAt": 1791158455459 }
```
Errors: `400 bad_op | bad_files`, `403 forbidden` (cross-origin), `413 too_large`, `429 rate_limited`, `503 processing_unavailable`.

### `POST /api/jobs/:id/start`
Headers: `Authorization: Bearer <token>`. Body: `{ "params": { … } }` — validated against a per-op whitelist:

| op | params |
|---|---|
| `ocr` | `language` (Tesseract codes, e.g. `eng`, `eng+deu`) |
| `pdf-to-docx` | `ocr: boolean`, `language` |
| `protect` | `password` (≤128), `allowPrint`, `allowCopy` |
| `unlock` | `password` |
| `compress` | `preset`: `recommended` \| `high` \| `quality` |
| `redact`, `edit-text` | `regions: [{ pageIndex, rect: [x, y, w, h] (PDF points, bottom-left origin), fill: "#rrggbb" }]` |

Before enqueueing, the server checks each upload exists, isn't larger than declared, and **sniffs its first bytes** to confirm the real file type. Mismatches are deleted and rejected with `415 bad_type`.

### `GET /api/jobs/:id`
`{ jobId, status, progress?, resultUrl?, resultName?, error? }` where `status` ∈ `UPLOADING | PROCESSING | READY | ERROR | EXPIRED`. Error codes: `wrong_password, not_encrypted, encrypted, damaged, unsupported, timeout, malware, failed`.

### `DELETE /api/jobs/:id`
Deletes all files and the job record. The browser client calls this right after downloading a result.

### `POST /api/jobs/:id/callback` (worker → API)
Header `X-Worker-Auth: HMAC("callback", jobId)`. Body `{ status: "PROGRESS", progress }`, `{ status: "READY" }` or `{ status: "ERROR", error: { code } }`. On `READY`, input files are deleted immediately.

### `GET|POST /api/cleanup` (scheduler → API)
Header `Authorization: Bearer $CRON_SECRET`. Deletes expired jobs and their files. Scheduled every 10 minutes (`vercel.json` or Cloud Scheduler).

### `PUT|GET /api/blob/*` (development only)
Signed, expiring stand-in for GCS when `STORAGE_BACKEND=local`. Returns 404 when cloud storage is configured.

## Worker contract (`POST {WORKER_URL}/process`)

```json
{
  "jobId": "…", "op": "redact", "params": { "regions": [] },
  "inputs": [{ "url": "<signed GET>", "ext": "pdf" }],
  "output": { "url": "<signed PUT>", "contentType": "application/pdf", "ext": "pdf" },
  "callback": { "url": "https://app/api/jobs/…/callback", "token": "…" }
}
```
The worker never receives storage credentials — only signed URLs scoped to one job. It always returns 200 (outcomes are reported via callback) so Cloud Tasks doesn't retry finished work.
