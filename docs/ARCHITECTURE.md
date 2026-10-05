# PDFella — Architecture

> "PDFella" is a temporary product name (a pdfella is a gathering of folded sheets — the unit a book is bound from). Swap it in `src/lib/brand.ts`.

## 1. Requirement analysis

The brief splits into three workloads with very different technical profiles:

| Workload | Examples | Where it runs | Why |
|---|---|---|---|
| **Interactive editing** | text, whiteout, highlight, draw, shapes, images, signatures, page organisation, forms fill, watermark, page numbers | **Browser** | Latency-sensitive; the file never has to leave the device, which is the strongest privacy story we can tell. pdf-lib can write real PDF objects client-side. |
| **Structural PDF ops** | merge, split, extract, rotate, protect/unlock, flatten, true redaction, repair, compress | **Browser where possible, worker service where not** | Merge/split/rotate/extract are cheap in pdf-lib. True redaction, encryption, compression (image resampling), repair need PyMuPDF / qpdf / Ghostscript. |
| **Heavy conversion** | PDF↔DOCX/XLSX/PPTX, OCR, Office→PDF | **Server (container)** | Needs LibreOffice, Tesseract/OCRmyPDF, pdf2docx. Long-running, memory-hungry, must be sandboxed. Never in Vercel functions. |

Hard truths we design around (and state honestly in the UI):

* **Editing existing text** in a PDF is only "true" when the original glyphs are removed. Strategy: detect text runs with PDF.js (position, size, font name, colour sampled from the render), let the user edit in place, and on export **delete the original text-showing operators from the page content stream in the browser** (`src/lib/pdf/content-edit.ts` — a tokenizer plus a minimal text-state interpreter that only removes operators whose start position is known exactly). The replacement is typeset in the closest standard font. When removal isn't provably safe (text inside Form XObjects, operators whose position depends on glyph widths), it falls back to *cover + re-typeset*. Re-using the original embedded font is not attempted: subset fonts usually lack the new glyphs. A server-side alternative (`edit-text` op, PyMuPDF `apply_redactions` without fill) exists for documents where the client can't remove the text.
* **Redaction** must delete content. pdf-lib cannot reliably rewrite content streams, so permanent redaction goes through the PyMuPDF service. When the service is unreachable, the client fallback **rasterises the affected pages** (renders to image, rebuilds the page from the image) — the text is genuinely gone, at the cost of selectability on those pages. We never ship "black box over live text" as a redaction.
* **PDF → Word/Excel/PowerPoint** is lossy. We say so on the tool page and on the result screen.

## 2. Technology choices

### Frontend
| Choice | Why | Rejected |
|---|---|---|
| **Next.js 15 (App Router) + React 19 + TypeScript** | SSG for ~40 SEO tool pages, client components for the editor, route handlers for thin API glue. | Vite SPA — loses SSG/SEO. |
| **Tailwind CSS v4** + hand-built primitives in the shadcn/ui style | shadcn is copy-in source, not a dependency; we own the components and the design tokens. | MUI/Chakra — heavier, harder to make look original. |
| **lucide-react** | Consistent 1.5px-stroke icon set, tree-shakable, ISC licence. | |
| **Zustand** | Editor state is a large mutable document model with history; Zustand gives selector-based subscriptions without context re-render storms. | Redux (ceremony), Context (re-renders). |

### PDF engines (evaluated)
| Library | Rendering | Writing | Text editing | Licence | Decision |
|---|---|---|---|---|---|
| **PDF.js** (pdfjs-dist) | Excellent, worker-based | No | Extracts text runs with transforms/fonts | Apache-2.0 | **Use** for rendering, text-layer, search, thumbnails. |
| **pdf-lib** | No | Yes: draw text/images/vectors, copy pages, forms, metadata | Can't edit existing content streams | MIT | **Use** for client-side export, organise, forms, watermark, page numbers, merge/split. |
| Fabric.js / Konva | Canvas scene graph | No | No | MIT | **Not used.** Overlay objects are plain absolutely-positioned DOM/SVG in PDF-point space — accessible, crisp at any zoom, and maps 1:1 to pdf-lib draw calls. A canvas scene graph would add a second coordinate system to keep in sync. |
| **PyMuPDF** | Yes | Yes, incl. true redaction, content removal, compression, repair | Yes (redact+reinsert) | AGPL / commercial | **Use server-side** (isolated service, so AGPL obligations are confined; buy the Artifex licence before closed-source distribution). |
| qpdf | — | Encryption, linearisation, repair | — | Apache-2.0 | **Use server-side** for protect/unlock/repair. |
| Ghostscript | — | Compression/downsampling | — | AGPL / commercial | Optional compress backend. |
| PSPDFKit/Nutrient, Apryse | All | All | True reflow editing | Commercial ($$$) | **Paid SDK option** — behind the same `EditorEngine` seam if true reflow editing becomes a requirement. |

### Backend
* **Next.js route handlers** (Node, TypeScript) for: upload intake + validation, job creation, signed URL issuance, status polling. Thin and fast — fits Vercel limits.
* **`services/worker`** — Python 3.12 FastAPI container (Cloud Run): PyMuPDF, qpdf, OCRmyPDF/Tesseract, LibreOffice headless, pdf2docx. Pulls jobs, writes results to object storage. Runs as non-root, no network egress except storage, per-job temp dir, CPU/memory/time limits.
* **Queue**: Cloud Tasks (GCP-native, at-least-once, rate-limited dispatch to Cloud Run). BullMQ+Redis is the alternative for non-GCP deployments; both sit behind `JobQueue`.

### Storage & data (Firebase, only where it earns its place)
* **Firebase Storage (GCS)** — temporary objects under `tmp/{jobId}/…`. Bucket is private; access only through V4 signed URLs (15-minute TTL). A GCS **lifecycle rule deletes objects after 1 day** — the deletion guarantee lives in infrastructure, not in a cron that can fail silently. A cleanup endpoint additionally deletes on job expiry (1 hour).
* **Firestore** — `jobs/{jobId}` documents (status, tool, sizes, expiresAt, no content) with a Firestore **TTL policy on `expiresAt`**. `usage/{anonId_day}` counters for rate limiting.
* **Firebase Auth** — *not* required. Anonymous jobs are authorised by an unguessable job id + an HMAC capability token. Accounts slot in later via `ownerId`.
* **App Check** — optional, on the upload endpoint to deter scripted abuse.
* **Analytics** — event names only (`tool_opened`, `file_uploaded`, …) with no file names or content; sent through `lib/analytics.ts` so the provider is swappable.

When Firebase env vars are absent, the app runs in **local mode**: all editing/organising tools work fully in-browser; server-only tools show an honest "requires the processing service" state.

## 3. Processing strategy (per tool)

| Tool | Client (pdf-lib/PDF.js) | Server (worker) |
|---|---|---|
| Edit/annotate/sign/images/shapes/whiteout | ✅ primary | — |
| Edit existing text | ✅ glyph removal from content stream; cover+retypeset fallback | optional PyMuPDF removal |
| Redact | ✅ default: rebuild affected pages as images + invisible text layer for unredacted text | opt-in: PyMuPDF `apply_redactions` (keeps vectors) |
| Merge / split / extract / rotate / delete / reorder / duplicate / insert | ✅ | — |
| Watermark / page numbers / headers & footers | ✅ | — |
| Fill forms / create form fields / flatten | ✅ | — |
| Images → PDF, PDF → JPG/PNG, PDF → TXT | ✅ | — |
| Compress | ✅ re-encode JPEG / 8-bit Flate images, prune orphans, object streams | opt-in: Ghostscript / PyMuPDF |
| Protect / unlock / repair | ✅ qpdf compiled to WebAssembly | available (pikepdf) |
| OCR | — | ✅ OCRmyPDF (Tesseract) — provider interface for Vision/Textract |
| PDF → DOCX | — | ✅ pdf2docx |
| PDF → XLSX / PPTX | — | ✅ pdfplumber tables / per-page slide images + text |
| DOCX/PPTX/XLSX → PDF | — | ✅ LibreOffice headless |

## 4. Editor document model

The heart of the product. Lives in `src/lib/editor/model.ts`.

```
EditorDocument
├── sources: Map<sourceId, Uint8Array>      // original PDF bytes (one per imported file)
├── pages: PageRef[]                          // ordered; organise ops only touch this array
│     { id, sourceId, sourceIndex | null(blank), rotation, width, height }
└── objects: Map<pageId, EditorObject[]>      // overlay layers, PDF-point coordinates, origin top-left
      kind ∈ text | textEdit | whiteout | highlight | underline | strike | ink | line | arrow
             | rect | ellipse | image | signature | stamp | note | link | redact | field
```

Layers are explicit (requirement §52): **original content** (sources) → **text edits** (`textEdit`, record original run + strategy) → **overlays** (whiteout, shapes, ink, images, signatures, stamps) → **annotations** (notes/links exported as real PDF annotations) → **form fields** (real AcroForm widgets) → **redactions** (applied last, destructive).

History is snapshot-based over `{pages, objects}` (sources are immutable and shared), capped at 100 entries — simple, correct, and cheap because objects are small.

Export (`src/lib/pdf/export.ts`): copy pages from sources in order → apply rotation → draw overlays with pdf-lib in PDF-space (y-flip, rotation-aware) → add annotations/fields → redact (server or rasterise) → `save()`.

## 5. Security model
* Magic-byte sniffing (`lib/security/filetype.ts`) — extension is never trusted. PDF must start with `%PDF-`; DOCX/XLSX/PPTX are validated as ZIP + `[Content_Types].xml`.
* Size limits per plan (`lib/limits.ts`), enforced client-side for UX and server-side for real.
* Rate limiting: token bucket keyed by hashed IP (Firestore counters in prod, in-memory in dev).
* Strict CSP, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `frame-ancestors 'none'` via `next.config.ts` headers.
* Worker: non-root, read-only rootfs, no egress, per-job timeout, PyMuPDF opened with repair disabled for hostile input then retried in a subprocess; ClamAV hook in `scan.py` (pluggable).
* No document content is ever logged; logs carry job id, tool, sizes, durations.
* See `docs/SECURITY.md`.

## 6. Folder structure
```
src/
  app/
    (marketing)/          landing, privacy, [tool] SEO pages
    editor/               the editor (client)
    tools/[tool]/         tool workspaces (merge, split, compress, …)
    api/                  upload, jobs, cleanup, health
    sitemap.ts robots.ts
  components/
    ui/                   design-system primitives
    marketing/            landing sections
    upload/               dropzone
    editor/               toolbar, sidebar, canvas, property panel, dialogs
    tools/                tool workspaces
  lib/
    editor/               model, store, history, coordinates
    pdf/                  pdfjs loader, render, export, organise, forms, stamp ops
    security/  storage/   analytics.ts  tools.ts  brand.ts  limits.ts
  hooks/
services/worker/          Python FastAPI processing service + Dockerfile
tests/                    vitest unit + Playwright e2e
docs/                     architecture, API, security, storage
```

## 7. API design (summary — see `docs/API.md`)
```
POST /api/jobs                 → { jobId, token, uploadUrl }   create job, signed upload URL
POST /api/jobs/:id/start       → 202                            enqueue processing
GET  /api/jobs/:id             → { status, progress, resultUrl?, error? }
DELETE /api/jobs/:id           → 204                            user-initiated deletion
POST /api/cleanup              (Cloud Scheduler, OIDC)          sweep expired jobs
GET  /api/health
```
Job states: `UPLOADING → PROCESSING → READY → EXPORTED | ERROR | EXPIRED`.

## 8. Monetisation & accounts (prepared, not built)
`lib/limits.ts` defines `plans = { free, pro, business }`; every limit check takes a `plan` argument (currently always `free`). Jobs carry optional `ownerId`. Stripe would add `customers/{uid}` and a webhook route; nothing in the anonymous path depends on it.

## 9. Open-source vs paid vs external options

| Capability | Implemented (free / open source) | Paid SDK option | External API option |
|---|---|---|---|
| Rendering, text extraction, search | PDF.js (Apache-2.0) | Nutrient (PSPDFKit) Web, Apryse WebViewer | — |
| Overlay editing, forms, organise, export | pdf-lib (MIT) + own content-stream editor | Nutrient / Apryse (true reflow text editing, font subsetting with new glyphs) | — |
| True redaction | Browser rasterisation (default) / PyMuPDF | Apryse redaction module | Adobe PDF Services |
| OCR | OCRmyPDF + Tesseract | ABBYY FineReader Engine | Google Cloud Vision, AWS Textract, Azure Document Intelligence |
| PDF → Word | pdf2docx | Aspose.PDF, Apryse Structured Output | Adobe PDF Services, ConvertAPI |
| Office → PDF | LibreOffice headless | Aspose.Words/Cells/Slides | Adobe PDF Services, CloudConvert |
| Encryption, decryption, repair | qpdf → WebAssembly in the browser (Apache-2.0); pikepdf on the server | — | — |
| Compression | browser image re-encoding; Ghostscript / PyMuPDF | — | — |

Each server operation is a function in `services/worker/worker/ops.py` with a uniform signature, so swapping an implementation for a commercial SDK or an external API is a local change. OCR providers in particular plug in behind the `ocr` op.

**Licensing note.** PyMuPDF and Ghostscript are AGPL. They run only inside the separately deployed worker service; offering the service over a network can still trigger AGPL obligations, so obtain Artifex commercial licences (or replace these components) before a closed-source commercial launch.

## 10. Known limitations (honest list)
* Replacement text uses standard fonts (Helvetica/Times/Courier families), not the document's embedded font.
* Characters outside Windows-1252 in *new* text are drawn as a high-resolution image (correct appearance, not selectable).
* Client-side redaction turns affected pages into images (with an invisible searchable layer for unredacted text); cloud redaction keeps vectors.
* Existing form fields are filled from the side panel rather than directly on the page.
* PDF → Word/Excel/PowerPoint are best-effort and say so in the UI.

## 11. Protected PDFs
Every entry point (editor open/insert, every tool intake) runs `ensureUnlocked()` (`src/lib/pdf/unlock.ts`), which uses qpdf compiled to WebAssembly (`src/lib/pdf/qpdf.ts`, `public/qpdf.wasm`):
* PDFs that only restrict printing/copying/editing (owner password only) are decrypted silently — the user can already open them, and the restrictions would otherwise block editing and export.
* PDFs that require a password to open show a single password prompt; the password is used only in the browser and never stored or sent.
* After unlocking, the document is an ordinary unencrypted PDF everywhere in the app. Use Protect PDF to add a password back.

## 12. Editing text by double-click
With the Select tool, hovering PDF text shows a dashed outline; double-clicking opens the whole line for editing with the clicked word selected (`src/lib/editor/text-lines.ts` groups runs on the same baseline, so sentences stored one word per operator edit as a unit, without merging separate columns). On export every run of the line is removed from the content stream.
