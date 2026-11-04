"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { useEditor } from "@/lib/editor/store";
import { usePdf } from "@/components/tools/shared";
import { BookmarkList, CropPanel, bookmarksInvalid, fromRows, toRows, type BookmarkRow } from "@/components/tools/document-panels";
import { buildPdf, cropDocument, currentBookmarks, friendlyError, saveBookmarks } from "./actions";

export function CropDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} size="lg" title="Crop pages" description="Your edits so far become part of the pages, so they can't be moved afterwards. Undo brings them back.">
      <CropBody onClose={onClose} />
    </Dialog>
  );
}

function CropBody({ onClose }: { onClose: () => void }) {
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [working, setWorking] = useState(false);
  const { doc, error } = usePdf(bytes);
  const startPage = useEditor.getState().currentPage;

  // The preview shows the document as it looks now, edits included.
  useEffect(() => {
    let alive = true;
    buildPdf().then((b) => { if (alive) setBytes(b); }).catch((e) => {
      toast.error("Couldn't prepare the crop", friendlyError(e));
      onClose();
    });
    return () => { alive = false; };
  }, [onClose]);

  if (error) return <p role="alert" className="text-sm text-danger">{error}</p>;
  if (working) return <div className="py-16 text-center text-sm text-ink-3" aria-live="polite">Cropping…</div>;
  return (
    <CropPanel doc={doc} startPage={startPage} previewWidth={300} onApply={(margins, pages) => {
      setWorking(true);
      cropDocument(bytes!, margins, pages).then(() => {
        toast.success("Pages cropped", "Use Undo if you want the previous version back.");
        onClose();
      }).catch((e) => {
        setWorking(false);
        toast.error("Couldn't crop the pages", friendlyError(e));
      });
    }} />
  );
}

export function BookmarksDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [rows, setRows] = useState<BookmarkRow[] | null>(null);
  useEffect(() => {
    if (!open) { setRows(null); return; }
    let alive = true;
    void currentBookmarks().then((list) => { if (alive) setRows(toRows(list)); });
    return () => { alive = false; };
  }, [open]);
  const pages = useEditor((s) => s.pages.length);
  const currentPage = useEditor((s) => s.currentPage);
  return (
    <Dialog open={open} onClose={onClose} size="lg" title="Edit bookmarks" description="Bookmarks form the clickable table of contents in PDF readers. They're saved when you download the document."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button disabled={!rows || bookmarksInvalid(rows)} onClick={() => { saveBookmarks(fromRows(rows!)); onClose(); }}>Save bookmarks</Button></>}>
      {rows ? <BookmarkList rows={rows} setRows={setRows} pageCount={pages} defaultPage={currentPage} /> : <div className="h-32 animate-pulse rounded-2xl bg-surface-2" />}
    </Dialog>
  );
}
