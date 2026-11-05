"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FileSpreadsheet, FileText, PenLine, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Select, Switch } from "@/components/ui/form";
import { toast } from "@/components/ui/toast";
import { autoMap, bulkFill, listFormFields, type FieldMapping, type FormField } from "@/lib/pdf/bulk-fill";
import { readSpreadsheet, SpreadsheetError, type Sheet } from "@/lib/spreadsheet";
import { handoff } from "@/lib/storage/local";
import { deleteTemplate, listTemplates, readTemplate, saveTemplate, type TemplateInfo } from "@/lib/templates";
import { formatBytes } from "@/lib/utils";
import { requirePlan } from "@/lib/plans";
import type { Tool } from "@/lib/tools";
import { FileChip, baseName, unlockFiles, toLoaded, type LoadedFile } from "./shared";
import { Dropzone } from "@/components/upload/dropzone";
import { useSingle } from "./transform";

// ───────────────────────────── Fill from a spreadsheet

const MAX_PROBLEMS_SHOWN = 20;

export function BulkFillWorkspace({ tool }: { tool: Tool }) {
  const { file, setFile, reset, run, gate } = useSingle(tool);
  const params = useSearchParams();
  const templateId = params.get("template");
  const loaded = useRef(false);

  // Arriving from "Fill from a spreadsheet" on the templates page.
  useEffect(() => {
    if (!templateId || loaded.current) return;
    loaded.current = true;
    void (async () => {
      const [info, bytes] = await Promise.all([listTemplates().then((l) => l.find((t) => t.id === templateId)), readTemplate(templateId)]);
      if (info && bytes) setFile({ id: info.id, name: info.name, bytes, type: "application/pdf", size: bytes.length });
    })();
  }, [templateId, setFile]);

  const g = gate();
  if (g) return g;
  return <BulkFillForm key={file!.id} file={file!} reset={reset} run={run} />;
}

function BulkFillForm({ file, reset, run }: { file: LoadedFile; reset: () => void; run: ReturnType<typeof useSingle>["run"] }) {
  const [fields, setFields] = useState<FormField[] | null>(null);
  const [readError, setReadError] = useState(false);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [sheetName, setSheetName] = useState("");
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [mapping, setMapping] = useState<FieldMapping>({});
  const [nameColumn, setNameColumn] = useState<number | null>(null);
  const [flatten, setFlatten] = useState(false);

  useEffect(() => {
    let alive = true;
    listFormFields(file.bytes).then((f) => { if (alive) setFields(f); }).catch(() => { if (alive) setReadError(true); });
    return () => { alive = false; };
  }, [file.bytes]);

  if (readError) return <p role="alert" className="text-sm text-danger">We couldn&apos;t read this PDF. It may be damaged.</p>;
  if (!fields) return <div className="h-40 animate-pulse rounded-2xl bg-surface-2" />;
  if (!fields.length) {
    return (
      <div className="space-y-4 text-left">
        <FileChip file={file} onRemove={reset} />
        <p role="alert" className="rounded-xl bg-surface-2 px-4 py-3 text-sm text-ink-2">
          This PDF has no fillable fields. Add them first with <Link className="font-medium text-accent underline" href="/create-pdf-form">Create PDF Form</Link>, then come back.
        </p>
      </div>
    );
  }

  const onSheet = async (picked: File | undefined) => {
    if (!picked) return;
    setSheetError(null);
    try {
      const s = await readSpreadsheet({ name: picked.name, bytes: new Uint8Array(await picked.arrayBuffer()) });
      setSheet(s);
      setSheetName(picked.name);
      setMapping(autoMap(fields, s.headers));
      setNameColumn(null);
    } catch (e) {
      setSheet(null);
      setSheetError(e instanceof SpreadsheetError ? e.message : "We couldn't read this spreadsheet.");
    }
  };
  const mapped = Object.values(mapping).filter((c) => c !== null).length;
  const columnOptions = sheet?.headers.map((h, i) => ({ value: String(i), label: h })) ?? [];

  return (
    <div className="space-y-4 text-left">
      <FileChip file={file} onRemove={reset} />
      <p className="text-sm text-ink-3">This form has {fields.length} fillable field{fields.length === 1 ? "" : "s"}. Choose a spreadsheet with one row for each copy you need, and a header row naming the columns.</p>
      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-border-strong bg-surface px-4 py-3 text-sm hover:border-accent">
        <FileSpreadsheet className="size-5 shrink-0 text-accent" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{sheet ? `${sheetName} · ${sheet.rows.length} row${sheet.rows.length === 1 ? "" : "s"}` : "Choose a CSV or Excel file"}</span>
        <Upload className="size-4 shrink-0 text-ink-3" aria-hidden />
        <input type="file" className="sr-only" accept=".csv,.tsv,.txt,.xlsx" data-testid="sheet-input" onChange={(e) => { void onSheet(e.target.files?.[0]); e.target.value = ""; }} />
      </label>
      {sheetError && <p role="alert" className="text-sm text-danger">{sheetError}</p>}

      {sheet && (
        <>
          <div className="rounded-xl border border-border bg-surface">
            <p className="border-b border-border px-4 py-2.5 text-[13px] font-semibold">Which column fills each field?</p>
            <ul className="divide-y divide-border">
              {fields.map((f) => {
                const col = mapping[f.name];
                return (
                  <li key={f.name} className="grid items-center gap-2 px-4 py-2.5 sm:grid-cols-[1fr_1fr_1fr]">
                    <span className="min-w-0 truncate text-[13.5px] font-medium" title={f.name}>{f.name}</span>
                    <Select aria-label={`Column for ${f.name}`} value={col === null || col === undefined ? "" : String(col)} onChange={(e) => setMapping({ ...mapping, [f.name]: e.target.value === "" ? null : Number(e.target.value) })}>
                      <option value="">Leave empty</option>
                      {columnOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </Select>
                    <span className="min-w-0 truncate text-[12.5px] text-ink-3" title="Value from the first row">{col !== null && col !== undefined ? sheet.rows[0][col] || "(empty)" : ""}</span>
                  </li>
                );
              })}
            </ul>
          </div>
          <Field label="Name each file from" hint="Leave as numbered to get file-1.pdf, file-2.pdf and so on.">
            {(id) => (
              <Select id={id} value={nameColumn === null ? "" : String(nameColumn)} onChange={(e) => setNameColumn(e.target.value === "" ? null : Number(e.target.value))}>
                <option value="">Numbered</option>
                {columnOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            )}
          </Field>
          <Switch label="Flatten, so the copies can't be edited" checked={flatten} onChange={setFlatten} />
          <Button size="lg" className="w-full" disabled={mapped === 0} onClick={() => requirePlan("bulk-fill") && run("Filling your forms", async (progress) => {
            const r = await bulkFill({ bytes: file.bytes, name: file.name, sheet, mapping, nameColumn, flatten }, (done, total) => progress((done / total) * 100));
            if (!r.created) throw new Error(r.problems[0] ?? "No copies could be created.");
            return {
              blob: r.zip,
              name: `${baseName(file.name)}-filled.zip`,
              summary: (
                <>
                  {r.created} PDF{r.created === 1 ? "" : "s"} created.
                  {r.problems.length > 0 && (
                    <span className="mt-2 block rounded-lg bg-warn/10 px-3 py-2 text-ink-2" data-testid="bulk-problems">
                      {r.problems.length} problem{r.problems.length === 1 ? "" : "s"} to check:
                      {r.problems.slice(0, MAX_PROBLEMS_SHOWN).map((p) => <span key={p} className="block text-[12.5px]">{p}</span>)}
                      {r.problems.length > MAX_PROBLEMS_SHOWN && <span className="block text-[12.5px]">and {r.problems.length - MAX_PROBLEMS_SHOWN} more.</span>}
                    </span>
                  )}
                </>
              ),
            };
          })}>Create {sheet.rows.length} PDF{sheet.rows.length === 1 ? "" : "s"}</Button>
          {mapped === 0 && <p className="text-[13px] text-ink-3">Match at least one field to a column to continue.</p>}
        </>
      )}
    </div>
  );
}

// ───────────────────────────── Templates

export function TemplatesWorkspace({ tool }: { tool: Tool }) {
  const router = useRouter();
  const [list, setList] = useState<TemplateInfo[] | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  useEffect(() => { void listTemplates().then(setList); }, []);

  const add = async (files: LoadedFile[]) => {
    if (!requirePlan("templates")) return;
    for (const f of await unlockFiles(files)) {
      const saved = await saveTemplate(f.name, f.bytes);
      if (!saved) { toast.error("Couldn't save the template", "Your browser's storage may be full or blocked."); return; }
    }
    setList(await listTemplates());
  };
  const fillOnce = async (t: TemplateInfo) => {
    setOpening(t.id);
    const bytes = await readTemplate(t.id);
    if (!bytes) { setOpening(null); toast.error("Couldn't open that template"); return; }
    await handoff.put([{ name: t.name, type: "application/pdf", bytes }]);
    router.push("/editor");
  };
  const remove = async (t: TemplateInfo) => {
    if (!confirm(`Delete the template “${t.name}”?`)) return;
    await deleteTemplate(t.id);
    setList(await listTemplates());
  };

  return (
    <div className="space-y-4 text-left">
      <Dropzone accepts={tool.accepts} multiple onFiles={(fs) => void add(fs.map(toLoaded))} title="Add a PDF as a template" buttonLabel="Choose file" tool={tool.slug} />
      <p className="text-[13px] text-ink-3">Templates are saved in this browser on this device. They aren&apos;t uploaded, so clearing your browser data removes them. You can also save any document from the editor&apos;s ⋯ menu.</p>
      {list && list.length > 0 && (
        <ul className="space-y-2" aria-label="Your templates">
          {list.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface px-3.5 py-2.5" data-testid="template-row">
              <FileText className="size-5 shrink-0 text-accent" aria-hidden />
              <div className="min-w-[120px] flex-1">
                <p className="truncate text-sm font-medium">{t.name}</p>
                <p className="text-xs text-ink-3">{formatBytes(t.size)} · saved {new Date(t.savedAt).toLocaleDateString()}</p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Button size="sm" variant="outline" disabled={opening === t.id} onClick={() => void fillOnce(t)}><PenLine /> Fill once</Button>
                <Button size="sm" variant="outline" onClick={() => router.push(`/fill-pdf-from-spreadsheet?template=${encodeURIComponent(t.id)}`)}><FileSpreadsheet /> From spreadsheet</Button>
                <Button size="icon-sm" variant="ghost" aria-label={`Delete ${t.name}`} onClick={() => void remove(t)}><Trash2 /></Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
