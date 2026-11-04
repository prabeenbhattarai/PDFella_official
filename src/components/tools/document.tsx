"use client";

import { useEffect, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { cropPdf, readBookmarks, readDetails, writeBookmarks, writeDetails, type Bookmark, type FileDates, type FileDetails } from "@/lib/pdf/document-info";
import type { Tool } from "@/lib/tools";
import { FileChip, baseName, pdfBlob, usePdf, type LoadedFile, type ToolResult } from "./shared";
import { useSingle } from "./transform";
import { BookmarkList, CropPanel, bookmarksInvalid, fromRows, toRows, type BookmarkRow } from "./document-panels";

type Run = (label: string, fn: () => Promise<ToolResult>) => void;

// ───────────────────────────── Crop

export function CropWorkspace({ tool }: { tool: Tool }) {
  const { file, reset, run, gate } = useSingle(tool);
  const { doc, error } = usePdf(file?.bytes ?? null);
  const g = gate();
  if (g) return g;
  if (error) return <p role="alert" className="text-sm text-danger">{error}</p>;
  return (
    <div className="space-y-4">
      <FileChip file={file!} onRemove={reset} pages={doc?.numPages} />
      <CropPanel doc={doc} onApply={(margins, pages) => run("Cropping", async () => ({
        blob: pdfBlob(await cropPdf(file!.bytes, margins, pages)),
        name: `${baseName(file!.name)}-cropped.pdf`,
        editable: true,
      }))} />
    </div>
  );
}

// ───────────────────────────── Bookmarks

export function BookmarksWorkspace({ tool }: { tool: Tool }) {
  const { file, reset, run, gate } = useSingle(tool);
  const { doc, error } = usePdf(file?.bytes ?? null);
  const g = gate();
  if (g) return g;
  if (error) return <p role="alert" className="text-sm text-danger">{error}</p>;
  if (!doc) return <div className="h-40 animate-pulse rounded-2xl bg-surface-2" />;
  return <BookmarkEditor key={file!.id} file={file!} doc={doc} reset={reset} run={run} />;
}

function BookmarkEditor({ file, doc, reset, run }: { file: LoadedFile; doc: PDFDocumentProxy; reset: () => void; run: Run }) {
  const [rows, setRows] = useState<BookmarkRow[] | null>(null);
  useEffect(() => {
    let alive = true;
    readBookmarks(doc).catch(() => [] as Bookmark[]).then((list) => { if (alive) setRows(toRows(list)); });
    return () => { alive = false; };
  }, [doc]);
  if (!rows) return <div className="h-40 animate-pulse rounded-2xl bg-surface-2" />;
  return (
    <div className="space-y-4 text-left">
      <FileChip file={file} onRemove={reset} pages={doc.numPages} />
      <BookmarkList rows={rows} setRows={setRows} pageCount={doc.numPages} />
      <Button size="lg" className="w-full" disabled={bookmarksInvalid(rows)} onClick={() => run("Saving bookmarks", async () => ({
        blob: pdfBlob(await writeBookmarks(file.bytes, fromRows(rows))),
        name: `${baseName(file.name)}-bookmarks.pdf`,
        editable: true,
      }))}>Save bookmarks</Button>
    </div>
  );
}

// ───────────────────────────── File details

const DETAIL_FIELDS: { key: keyof FileDetails; label: string }[] = [
  { key: "title", label: "Title" },
  { key: "author", label: "Author" },
  { key: "subject", label: "Subject" },
  { key: "keywords", label: "Keywords" },
  { key: "creator", label: "Created with" },
  { key: "producer", label: "PDF made by" },
];
const NO_DETAILS: FileDetails = { title: "", author: "", subject: "", keywords: "", creator: "", producer: "" };
const shown = (d: Date | null) => (d ? d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "None");

export function DetailsWorkspace({ tool }: { tool: Tool }) {
  const { file, reset, run, gate } = useSingle(tool);
  const g = gate();
  if (g) return g;
  return <DetailsEditor key={file!.id} file={file!} reset={reset} run={run} />;
}

function DetailsEditor({ file, reset, run }: { file: LoadedFile; reset: () => void; run: Run }) {
  const [details, setDetails] = useState<FileDetails | null>(null);
  const [dates, setDates] = useState<FileDates>({ created: null, modified: null });
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    readDetails(file.bytes).then(({ created, modified, ...d }) => {
      if (!alive) return;
      setDetails(d);
      setDates({ created, modified });
    }).catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [file.bytes]);
  if (error) return <p role="alert" className="text-sm text-danger">We couldn&apos;t read this PDF. It may be damaged.</p>;
  if (!details) return <div className="h-40 animate-pulse rounded-2xl bg-surface-2" />;

  const removeDates = !dates.created && !dates.modified;
  return (
    <div className="space-y-4 text-left">
      <FileChip file={file} onRemove={reset} />
      <div className="grid gap-3 sm:grid-cols-2">
        {DETAIL_FIELDS.map(({ key, label }) => (
          <Field key={key} label={label}>
            {(id) => <Input id={id} value={details[key]} onChange={(e) => setDetails({ ...details, [key]: e.target.value })} />}
          </Field>
        ))}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-xl bg-surface-2 px-4 py-3 text-[13px]">
        <dt className="text-ink-3">Created</dt><dd className="text-ink-2" data-testid="detail-created">{shown(dates.created)}</dd>
        <dt className="text-ink-3">Last changed</dt><dd className="text-ink-2">{shown(dates.modified)}</dd>
      </dl>
      <Button variant="outline" onClick={() => { setDetails(NO_DETAILS); setDates({ created: null, modified: null }); }}><Trash2 /> Remove all details</Button>
      <Button size="lg" className="w-full" onClick={() => run("Saving details", async () => ({
        blob: pdfBlob(await writeDetails(file.bytes, details, { removeDates })),
        name: file.name,
        editable: true,
      }))}>Save details</Button>
    </div>
  );
}
