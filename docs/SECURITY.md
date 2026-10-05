# Security

## Threat model
Users upload sensitive documents (contracts, IDs, financial records). Primary risks: disclosure of documents, malicious files attacking the processing stack, abuse of compute, and misleading privacy claims.

## Controls

### Minimise what reaches the server
* Editing, signing, annotating, organising, forms, watermark, page numbers, header/footer, image ⇄ PDF, PDF → text, flatten and compression run **in the browser**.
* Uploads happen only for tools that need server software, and for two explicit opt-ins (cloud redaction, deeper compression). Nothing uploads silently.
* Typed/drawn signatures live only in tab memory.

### Protected PDFs
* Decryption happens in the browser with qpdf (WebAssembly). Open passwords are entered by the user, used once in memory and never stored or transmitted. Permission-only restrictions are removed automatically on files the user can already open.

### Transport & web app
* HSTS, strict CSP (`default-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`), `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` — see `next.config.ts`.
* No third-party scripts; analytics are opt-in via a provider hook and limited to event names + coarse buckets (`src/lib/analytics.ts`).
* State-changing API calls reject cross-origin `Origin` headers; there are no cookies, so classic CSRF doesn't apply. Capability tokens travel in the `Authorization` header.
* Links written into PDFs are restricted to `http(s):` and `mailto:`.
* React escapes all rendered text; JSON-LD is serialised with `<` escaped.

### Upload validation
* Client and server size limits (`src/lib/limits.ts`).
* **Content sniffing** (`src/lib/security/filetype.ts`): the server reads the first 4 KB of each uploaded object and rejects anything that isn't the expected type before processing. Extensions and MIME types are hints only.
* Signed upload URLs carry `x-goog-content-length-range`, so storage itself refuses oversized bodies.

### Storage
* Private bucket, uniform bucket-level access, public access prevention.
* Objects are reachable only via V4 signed URLs that expire after 15 minutes.
* Firebase client SDK access is denied by rules (`infra/*.rules`).
* Keys are namespaced `tmp/{jobId}/…`; job ids are 128-bit random.

### Processing isolation
* Worker runs as a non-root user (uid 10001), concurrency 1 per instance, CPU/memory/time limits, read-only filesystem except `/tmp` (compose: `read_only`, `cap_drop: ALL`, `no-new-privileges`).
* Cloud Run: no unauthenticated invocation (OIDC from the Cloud Tasks invoker SA), internal ingress, egress forced through a VPC without NAT — only Google APIs (via Private Google Access) are reachable.
* External tools run as subprocesses with timeouts; per-job temp directories are always removed.
* Malware scanning hook (`services/worker/worker/scan.py`) — enable with `CLAMD_HOST`.
* The worker holds no storage credentials.

### Retention & deletion (enforced, not just promised)
1. Inputs deleted as soon as the worker reports success.
2. Everything deleted when the client downloads the result (`DELETE /api/jobs/:id`).
3. Cleanup sweep every 10 minutes deletes jobs older than `JOB_TTL_MINUTES` (default 60).
4. GCS lifecycle rule deletes any `tmp/` object older than 1 day (backstop).
5. Firestore TTL deletes job and usage records.

### Logging
* No document contents, names, form values or parameters are logged. Worker logs: truncated job id, op, status, duration. The `httpx` logger is silenced because it would print signed URLs.

### Abuse prevention
* Per-client (hashed IP) burst and daily limits; optional Firebase App Check can be added in front of `/api/jobs`.
* Cloud Tasks queue caps concurrency and dispatch rate.

### Redaction correctness
* Client: affected pages are rebuilt as images in a fresh document; a GC pass ensures no original content stream, font or metadata of those pages is written. An invisible text layer is added only for text outside redaction boxes.
* Server: PyMuPDF `apply_redactions` + `save(garbage=4)`. Tests assert the redacted string is absent from the output bytes.

## Reporting
See `/security` on the site.
