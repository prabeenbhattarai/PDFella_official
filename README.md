# PDFella — online PDF editor & document tools

> "PDFella" is a temporary name. Change it in `src/lib/brand.ts`.

An all-in-one PDF workspace: edit existing text, add text/images/shapes, highlight, draw, sign, redact, organise pages, fill and create forms, merge, split, compress, convert, OCR and protect — without an account.

**Local-first:** editing, signing, organising, watermarking, page numbers, image conversion, compression and password protect/unlock run entirely in the browser. Password-protected PDFs are unlocked automatically when opened (asking once for the password if the file needs one). Only tools that need server software (OCR, Office conversion, encryption, repair, optional cloud redaction/compression) upload a file, and those files are deleted automatically.

## Quick start

```bash
npm install          # also copies the pdf.js worker into /public
npm run dev          # http://localhost:3000
```

That's enough for every browser-based tool. To enable the cloud tools locally, run the Python worker:

```bash
cd services/worker && python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt && cd ../..
cp .env.example .env.local   # set APP_SECRET and WORKER_URL=http://127.0.0.1:8080
npm run worker:dev
```

OCR, Office → PDF and Ghostscript compression also need system tools (`ocrmypdf`, `tesseract`, `soffice`, `gs`). The easiest way to get all of them is Docker:

```bash
docker compose up worker     # and set APP_URL=http://host.docker.internal:3000 in .env.local
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` · `npm run typecheck` | ESLint · TypeScript |
| `npm test` | Unit tests (Vitest) — geometry, sniffing, content-stream editing, PDF ops, exporter |
| `npm run test:e2e` | Playwright end-to-end tests (Chromium, Firefox, WebKit, mobile). `E2E_PROD=1` tests a production build |
| `npm run worker:dev` · `npm run worker:test` | Run / test the Python worker |
| `npm run fixtures` | Regenerate test PDFs in `tests/fixtures` |

## Project layout

```
src/
  app/
    (marketing)/          landing page, /[tool] SEO pages (38, statically generated), /pdf-converter hub, privacy, security, terms
    editor/               the PDF editor (client-only)
    api/                  health, jobs (create/start/status/delete/callback), cleanup, blob (local dev storage)
    sitemap.ts robots.ts
  components/
    ui/                   design system (button, dialog, toast, form controls, logo, theme)
    marketing/            header, footer, hero upload, tool grid, FAQ
    upload/               dropzone (drag & drop, validation, progress)
    editor/               top bar, tool rail, thumbnails, canvas, page layer, object renderer, panels, dialogs
    tools/                workspaces for each non-editor tool
  lib/
    editor/               document model, store (history), loading/autosave, search
    pdf/                  pdf.js loader & cache, rendering, export, content-stream editing, ops, geometry
    processing/           browser client for the job API
    server/               config, tokens, storage / jobs / queue / rate-limit backends, op definitions
    security/             content sniffing
    tools.ts brand.ts limits.ts analytics.ts
services/worker/          Python FastAPI worker (PyMuPDF, pikepdf, OCRmyPDF, LibreOffice, pdf2docx) + Dockerfile + tests
infra/                    GCP setup & worker deploy scripts, storage lifecycle/CORS, Firestore TTL & rules
tests/                    unit/ (Vitest), e2e/ (Playwright), fixtures/
docs/                     ARCHITECTURE · API · SECURITY · STORAGE · DEPLOYMENT
```

## Documentation

* [Architecture & technology choices](docs/ARCHITECTURE.md)
* [API](docs/API.md)
* [Security](docs/SECURITY.md)
* [Storage & database structure](docs/STORAGE.md)
* [Deployment](docs/DEPLOYMENT.md)
* [SEO, AEO & GEO](docs/SEO.md)

## Adding a tool

1. Add an entry to `src/lib/tools.ts` (slug, copy, accepted types, workspace, FAQ). The SEO page, sitemap entry, tool grid card and navigation appear automatically.
2. Browser tool: implement the operation in `src/lib/pdf/ops.ts` and a workspace in `src/components/tools/`.
   Server tool: add the op to `src/lib/server/ops.ts` (accepted types, output, parameter whitelist) and `services/worker/worker/ops.py`.
