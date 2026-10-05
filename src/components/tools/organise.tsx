"use client";

import { useCallback, useState } from "react";
import JSZip from "jszip";
import { ArrowDown, ArrowUp, X, RotateCw, RotateCcw, Copy, Trash2, FilePlus2, GripVertical, CheckSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Segmented, Field } from "@/components/ui/form";
import { mergePdfs, splitPdf, applyPagePlan, extractPages, type PagePlanItem } from "@/lib/pdf/ops";
import { parsePageRanges, cn, formatBytes } from "@/lib/utils";
import { track } from "@/lib/analytics";
import type { Tool } from "@/lib/tools";
import { unlockFiles, Intake, PageThumb, ResultCard, Working, ErrorCard, FileChip, usePdf, pdfBlob, baseName, toLoaded, type LoadedFile, type ToolResult } from "./shared";
import { Dropzone } from "@/components/upload/dropzone";

type Phase = { k: "idle" } | { k: "working"; label: string; p?: number } | { k: "done"; r: ToolResult } | { k: "error"; m: string };

function useRun(tool: Tool) {
  const [phase, setPhase] = useState<Phase>({ k: "idle" });
  const run = async (label: string, fn: (progress: (p: number) => void) => Promise<ToolResult>) => {
    setPhase({ k: "working", label });
    try {
      track("conversion_started", { tool: tool.slug });
      const r = await fn((p) => setPhase({ k: "working", label, p }));
      track("conversion_completed", { tool: tool.slug });
      setPhase({ k: "done", r });
    } catch (e) {
      console.error(e);
      track("error_occurred", { tool: tool.slug, code: "tool_failed" });
      setPhase({ k: "error", m: e instanceof Error && e.message.length < 160 ? e.message : "Please try again." });
    }
  };
  return { phase, setPhase, run };
}

// ───────────────────────────── Merge

function MergeItem({ file, index, count, move, remove }: { file: LoadedFile; index: number; count: number; move: (d: number) => void; remove: () => void }) {
  const { doc } = usePdf(file.bytes);
  return (
    <li className="flex items-center gap-3 rounded-xl border border-border bg-surface p-2.5">
      <GripVertical className="size-4 shrink-0 cursor-grab text-ink-3" />
      <span className="w-5 text-center text-xs font-semibold text-ink-3">{index + 1}</span>
      <div className="h-14 w-11 shrink-0">{doc && <PageThumb doc={doc} index={0} width={44} />}</div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{file.name}</p>
        <p className="text-xs text-ink-3">{doc ? `${doc.numPages} page${doc.numPages === 1 ? "" : "s"} · ` : ""}{formatBytes(file.size)}</p>
      </div>
      <Button variant="ghost" size="icon-sm" aria-label="Move up" disabled={index === 0} onClick={() => move(-1)}><ArrowUp /></Button>
      <Button variant="ghost" size="icon-sm" aria-label="Move down" disabled={index === count - 1} onClick={() => move(1)}><ArrowDown /></Button>
      <Button variant="ghost" size="icon-sm" aria-label={`Remove ${file.name}`} onClick={remove}><X /></Button>
    </li>
  );
}

export function MergeWorkspace({ tool }: { tool: Tool }) {
  const [files, setFiles] = useState<LoadedFile[]>([]);
  const [drag, setDrag] = useState<number | null>(null);
  const { phase, setPhase, run } = useRun(tool);
  const add = useCallback((f: LoadedFile[]) => setFiles((x) => [...x, ...f]), []);
  const reset = () => { setFiles([]); setPhase({ k: "idle" }); };

  if (phase.k === "working") return <Working label={phase.label} progress={phase.p} />;
  if (phase.k === "done") return <ResultCard result={phase.r} onReset={reset} tool={tool} />;
  if (phase.k === "error") return <ErrorCard message={phase.m} onReset={reset} onRetry={() => setPhase({ k: "idle" })} />;
  if (!files.length) return <Intake tool={tool} onFiles={add} multiple title="Drop PDFs to merge" />;

  const move = (i: number, d: number) => setFiles((x) => { const y = [...x]; const [it] = y.splice(i, 1); y.splice(i + d, 0, it); return y; });
  return (
    <div className="space-y-4 text-left">
      <ol className="space-y-2" aria-label="Files to merge (in order)">
        {files.map((f, i) => (
          <div key={f.id} draggable onDragStart={() => setDrag(i)} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (drag !== null && drag !== i) move(drag, i - drag); setDrag(null); }} className={cn(drag === i && "opacity-40")}>
            <MergeItem file={f} index={i} count={files.length} move={(d) => move(i, d)} remove={() => setFiles((x) => x.filter((y) => y.id !== f.id))} />
          </div>
        ))}
      </ol>
      <Dropzone accepts={tool.accepts} multiple size="compact" onFiles={async (fs) => add(await unlockFiles(fs.map(toLoaded)))} title="Add more PDFs" buttonLabel="Add files" tool={tool.slug} />
      <Button size="lg" className="w-full" disabled={files.length < 2} onClick={() => run("Merging", async () => {
        const bytes = await mergePdfs(files.map((f) => f.bytes));
        return { blob: pdfBlob(bytes), name: `${baseName(files[0].name)}-merged.pdf`, editable: true, summary: `${files.length} files merged · ${formatBytes(bytes.length)}` };
      })}>{files.length < 2 ? "Add at least two PDFs" : `Merge ${files.length} PDFs`}</Button>
    </div>
  );
}

// ───────────────────────────── Split

export function SplitWorkspace({ tool }: { tool: Tool }) {
  const [file, setFile] = useState<LoadedFile | null>(null);
  const { doc, error } = usePdf(file?.bytes ?? null);
  const [mode, setMode] = useState<"ranges" | "every" | "oddEven">("ranges");
  const [ranges, setRanges] = useState("1-2, 3-");
  const [every, setEvery] = useState(1);
  const { phase, setPhase, run } = useRun(tool);
  const onFiles = useCallback((f: LoadedFile[]) => setFile(f[0]), []);
  const reset = () => { setFile(null); setPhase({ k: "idle" }); };

  if (phase.k === "working") return <Working label={phase.label} progress={phase.p} />;
  if (phase.k === "done") return <ResultCard result={phase.r} onReset={reset} tool={tool} />;
  if (phase.k === "error") return <ErrorCard message={phase.m} onReset={reset} onRetry={() => setPhase({ k: "idle" })} />;
  if (!file) return <Intake tool={tool} onFiles={onFiles} />;
  if (error) return <ErrorCard message={error} onReset={reset} />;

  const count = doc?.numPages ?? 0;
  let preview = "";
  let invalid: string | null = null;
  try {
    if (mode === "ranges") {
      const groups = ranges.split(";").length > 1 ? ranges.split(";") : ranges.split(",");
      const parsed = groups.map((g) => parsePageRanges(g, count)).filter((g) => g.length);
      preview = `${parsed.length} file${parsed.length === 1 ? "" : "s"}`;
      if (!parsed.length) invalid = "Enter at least one page range.";
    } else if (mode === "every") preview = `${Math.ceil(count / Math.max(1, every))} files`;
    else preview = "2 files (odd and even pages)";
  } catch (e) { invalid = (e as Error).message; }

  const go = () => run("Splitting", async () => {
    const m = mode === "ranges"
      ? { type: "ranges" as const, groups: (ranges.split(";").length > 1 ? ranges.split(";") : ranges.split(",")).map((g) => parsePageRanges(g, count)) }
      : mode === "every" ? { type: "every" as const, n: Math.max(1, every) } : { type: "oddEven" as const };
    const parts = await splitPdf(file.bytes, m, count);
    if (parts.length === 1) return { blob: pdfBlob(parts[0].bytes), name: `${baseName(file.name)}-${parts[0].name}.pdf`, editable: true };
    const zip = new JSZip();
    parts.forEach((p) => zip.file(`${baseName(file.name)}-${p.name}.pdf`, p.bytes));
    return { blob: await zip.generateAsync({ type: "blob" }), name: `${baseName(file.name)}-split.zip`, summary: `${parts.length} PDFs in a ZIP archive` };
  });

  return (
    <div className="space-y-4 text-left">
      <FileChip file={file} pages={count} onRemove={reset} />
      <Segmented label="Split mode" value={mode} onChange={setMode} options={[{ value: "ranges", label: "By range" }, { value: "every", label: "Fixed size" }, { value: "oddEven", label: "Odd / even" }]} />
      {mode === "ranges" && (
        <Field label="Page ranges" hint="Each comma-separated range becomes its own file, e.g. “1-3, 4, 5-”. Use ; to group several ranges into one file: “1-2,5; 3-4”.">
          {(id) => <Input id={id} value={ranges} onChange={(e) => setRanges(e.target.value)} />}
        </Field>
      )}
      {mode === "every" && (
        <Field label="Pages per file" hint="1 = every page as its own PDF.">{(id) => <Input id={id} type="number" min={1} max={count || 1} value={every} onChange={(e) => setEvery(parseInt(e.target.value, 10) || 1)} />}</Field>
      )}
      <p className={cn("text-sm", invalid ? "text-danger" : "text-ink-3")}>{invalid ?? `Result: ${preview}`}</p>
      <Button size="lg" className="w-full" disabled={!!invalid || !count} onClick={go}>Split PDF</Button>
    </div>
  );
}

// ───────────────────────────── Page grid (rotate / delete / extract / organise)

interface GridPage { key: string; sourceIndex: number | null; rotation: number }

export function PagesWorkspace({ tool, op }: { tool: Tool; op: "rotate" | "delete" | "extract" | "organise" }) {
  const [file, setFile] = useState<LoadedFile | null>(null);
  const { doc, error } = usePdf(file?.bytes ?? null);
  const [pages, setPages] = useState<GridPage[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drag, setDrag] = useState<number | null>(null);
  const [range, setRange] = useState("");
  const { phase, setPhase, run } = useRun(tool);
  const onFiles = useCallback((f: LoadedFile[]) => { setFile(f[0]); setPages([]); setSelected(new Set()); }, []);
  const reset = () => { setFile(null); setPages([]); setSelected(new Set()); setPhase({ k: "idle" }); };

  if (doc && !pages.length) setPages(Array.from({ length: doc.numPages }, (_, i) => ({ key: `p${i}`, sourceIndex: i, rotation: 0 })));

  if (phase.k === "working") return <Working label={phase.label} progress={phase.p} />;
  if (phase.k === "done") return <ResultCard result={phase.r} onReset={reset} tool={tool} />;
  if (phase.k === "error") return <ErrorCard message={phase.m} onReset={reset} onRetry={() => setPhase({ k: "idle" })} />;
  if (!file) return <Intake tool={tool} onFiles={onFiles} />;
  if (error) return <ErrorCard message={error} onReset={reset} />;

  const toggle = (k: string) => setSelected((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const rotate = (keys: string[], d: number) => setPages((ps) => ps.map((p) => (keys.includes(p.key) ? { ...p, rotation: (p.rotation + d + 360) % 360 } : p)));
  const applyRange = () => {
    try {
      const idx = new Set(parsePageRanges(range, pages.length));
      setSelected(new Set(pages.filter((_, i) => idx.has(i)).map((p) => p.key)));
    } catch { /* invalid range ignored */ }
  };
  const move = (from: number, to: number) => setPages((ps) => { const y = [...ps]; const [it] = y.splice(from, 1); y.splice(to, 0, it); return y; });

  const sel = [...selected];
  const name = baseName(file.name);
  const action = {
    rotate: { label: "Apply rotation", disabled: pages.every((p) => p.rotation === 0) },
    delete: { label: sel.length ? `Delete ${sel.length} page${sel.length > 1 ? "s" : ""}` : "Select pages to delete", disabled: !sel.length || sel.length >= pages.length },
    extract: { label: sel.length ? `Extract ${sel.length} page${sel.length > 1 ? "s" : ""}` : "Select pages to extract", disabled: !sel.length },
    organise: { label: "Save new order", disabled: false },
  }[op];

  const go = () => run("Saving", async () => {
    if (op === "extract") {
      const idx = pages.filter((p) => selected.has(p.key) && p.sourceIndex !== null).map((p) => p.sourceIndex!) ;
      const bytes = await extractPages(file.bytes, idx);
      return { blob: pdfBlob(bytes), name: `${name}-extracted.pdf`, editable: true, summary: `${idx.length} pages` };
    }
    const plan: PagePlanItem[] = pages.filter((p) => op !== "delete" || !selected.has(p.key)).map((p) => ({ sourceIndex: p.sourceIndex, rotation: p.rotation }));
    const bytes = await applyPagePlan(file.bytes, plan);
    return { blob: pdfBlob(bytes), name: `${name}-${op === "rotate" ? "rotated" : op === "delete" ? "edited" : "organised"}.pdf`, editable: true, summary: `${plan.length} pages · ${formatBytes(bytes.length)}` };
  });

  return (
    <div className="space-y-4 text-left">
      <FileChip file={file} pages={pages.length} onRemove={reset} />
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-2">
        {op === "rotate" && <>
          <Button variant="ghost" size="sm" onClick={() => rotate(sel.length ? sel : pages.map((p) => p.key), -90)}><RotateCcw /> {sel.length ? "Selected" : "All"} left</Button>
          <Button variant="ghost" size="sm" onClick={() => rotate(sel.length ? sel : pages.map((p) => p.key), 90)}><RotateCw /> {sel.length ? "Selected" : "All"} right</Button>
        </>}
        {op === "organise" && <>
          <Button variant="ghost" size="sm" disabled={!sel.length} onClick={() => setPages((ps) => ps.flatMap((p) => (selected.has(p.key) ? [p, { ...p, key: `${p.key}-c${Date.now()}` }] : [p])))}><Copy /> Duplicate</Button>
          <Button variant="ghost" size="sm" disabled={!sel.length || sel.length >= pages.length} onClick={() => { setPages((ps) => ps.filter((p) => !selected.has(p.key))); setSelected(new Set()); }}><Trash2 /> Delete</Button>
          <Button variant="ghost" size="sm" onClick={() => setPages((ps) => [...ps, { key: `b${Date.now()}`, sourceIndex: null, rotation: 0 }])}><FilePlus2 /> Blank page</Button>
          <Button variant="ghost" size="sm" disabled={!sel.length} onClick={() => rotate(sel, 90)}><RotateCw /> Rotate</Button>
        </>}
        {(op === "delete" || op === "extract") && (
          <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); applyRange(); }}>
            <Input value={range} onChange={(e) => setRange(e.target.value)} placeholder="e.g. 1-3, 7" className="h-8 w-40" aria-label="Select pages by range" />
            <Button type="submit" variant="ghost" size="sm"><CheckSquare /> Select</Button>
          </form>
        )}
        <span className="ml-auto pr-2 text-xs text-ink-3">{sel.length ? `${sel.length} selected · ` : ""}{op === "organise" ? "Drag pages to reorder" : "Click pages to select"}</span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-3 rounded-2xl bg-surface-2 p-4" role="listbox" aria-multiselectable aria-label="Pages">
        {doc && pages.map((p, i) => {
          const isSel = selected.has(p.key);
          return (
            <div
              key={p.key}
              role="option"
              aria-selected={isSel}
              tabIndex={0}
              draggable={op === "organise"}
              onDragStart={() => setDrag(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => { if (drag !== null) move(drag, i); setDrag(null); }}
              onClick={() => toggle(p.key)}
              onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggle(p.key); } if (op === "organise" && e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) move(i, Math.max(0, Math.min(pages.length - 1, i + (e.key === "ArrowLeft" ? -1 : 1)))); }}
              className={cn("group relative flex cursor-pointer flex-col items-center gap-1.5 rounded-xl p-2 outline-none transition focus-visible:ring-2 focus-visible:ring-accent", isSel ? "bg-accent-soft ring-2 ring-accent" : "hover:bg-surface", drag === i && "opacity-40", op === "delete" && isSel && "bg-danger-soft ring-danger")}
            >
              <div className={cn("relative", op === "delete" && isSel && "opacity-40")}>
                {p.sourceIndex === null ? <div className="flex h-[168px] w-[118px] items-center justify-center rounded-sm bg-white text-xs text-neutral-400 ring-1 ring-border">Blank</div> : <PageThumb doc={doc} index={p.sourceIndex} rotation={p.rotation} width={118} />}
                {op === "delete" && isSel && <X className="absolute inset-0 m-auto size-10 text-danger" />}
              </div>
              <span className="text-xs tabular-nums text-ink-3">{i + 1}</span>
              {op === "rotate" && (
                <div className="absolute top-3 right-3 flex gap-0.5 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
                  <button aria-label={`Rotate page ${i + 1} left`} onClick={(e) => { e.stopPropagation(); rotate([p.key], -90); }} className="rounded-md bg-surface p-1 shadow"><RotateCcw className="size-3.5" /></button>
                  <button aria-label={`Rotate page ${i + 1} right`} onClick={(e) => { e.stopPropagation(); rotate([p.key], 90); }} className="rounded-md bg-surface p-1 shadow"><RotateCw className="size-3.5" /></button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <Button size="lg" className="w-full" disabled={action.disabled} onClick={go}>{action.label}</Button>
    </div>
  );
}

