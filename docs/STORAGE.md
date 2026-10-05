# Storage & database structure

## Browser (IndexedDB, database `pdfella`, store `kv`)
| Key | Contents | Lifetime |
|---|---|---|
| `handoff` | `{ files: [{ name, type, bytes }], at }` — files dropped on a marketing page, picked up by `/editor` or a tool | read-once, ignored after 10 min |
| `autosave` | `{ v, savedAt, docName, sources[{id,name,bytes,pageCount}], pages, objects, assets }` | until restored/discarded/new document; expires after 7 days |

Theme preference is in `localStorage.theme`.

## Object storage (GCS / Firebase Storage)
```
gs://<bucket>/
  tmp/<jobId>/in-0.<ext>      uploaded input (deleted on success)
  tmp/<jobId>/out.<ext>       result (deleted on download or expiry)
```
Lifecycle: `infra/gcs-lifecycle.json` deletes `tmp/` objects after 1 day.

## Firestore
### `jobs/{jobId}`
```ts
{
  id: string; op: ServerOp;
  status: "UPLOADING" | "PROCESSING" | "READY" | "ERROR" | "EXPIRED";
  inputs: { key: string; size: number; contentType: string; ext: string }[];
  output?: { key: string; ext: string; size?: number };
  progress?: number;
  error?: { code: string; message: string };
  createdAt: number; updatedAt: number; expiresAt: number;
  expiresAtTs: Timestamp;      // TTL field (expiresAt + 24h)
  ownerId?: string | null;     // reserved for accounts
}
```
No file names, contents or parameters (passwords travel only in the task payload).

### `usage/{clientHash}_{windowSec}_{window}`
`{ count: number, expiresAtTs: Timestamp }` — rate-limit counters keyed by a salted hash of the client IP. TTL-deleted.

## Future (accounts)
Planned collections: `users/{uid}`, `users/{uid}/documents/{docId}` (with explicit consent), `customers/{uid}` (Stripe). Jobs already carry `ownerId`; `limitsFor(plan)` is the single place plan limits are read.
