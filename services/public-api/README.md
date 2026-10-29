# PDFella public API

A separate service for partners, independent of the website's own `/api` routes.
It exposes the browser-based tools (merge, split, rotate, watermark, page numbers,
protect, unlock, text extraction …) as a REST API authenticated with API keys.

- **One definition:** endpoints, params, limits and error codes live in
  [`src/lib/api/spec.ts`](../../src/lib/api/spec.ts). The service validates against it,
  `/v1/openapi.json` is generated from it, and the website's `/developers` page renders it.
- **One engine:** every endpoint calls the same `src/lib/pdf` functions as the website
  tool, so fixing or improving a tool updates the API on its next deploy.
- **Compatibility:** within `/v1`, only add endpoints and optional params. Anything
  breaking goes into `/v2`.

## Run locally

```bash
npm run api:keys -- create "Local test"   # prints a key once
npm run api:dev                            # http://localhost:8787
curl localhost:8787/v1/merge -H "Authorization: Bearer <key>" -F files=@a.pdf -F files=@b.pdf -o merged.pdf
npm run api:test
```

## Keys

```bash
npm run api:keys -- create "Acme Inc" [--rate 120]   # full key shown once; only its SHA-256 is stored
npm run api:keys -- list
npm run api:keys -- usage <id>
npm run api:keys -- revoke <id>
```

Locally keys live in `.data/api-keys.json`. In production set `API_KEYS_BACKEND=firestore`
(collections `api_keys`, `api_usage`) and run the same commands with Google credentials
(`gcloud auth application-default login`, `GCP_PROJECT=…`).

## Deploy (Cloud Run)

```bash
docker build -f services/public-api/Dockerfile -t pdfella-api .     # from the repo root
gcloud run deploy pdfella-api --source . --region europe-west1 ...  # or push the image and deploy it
```

Env: `API_KEYS_BACKEND=firestore`, `GCP_PROJECT`, optional `BUILD_ID` (shown in `X-PDFella-Build`).
The service account needs Firestore read/write. Map `api.pdfella.com` to the service.
