"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, X, Sparkles, Gauge, Gem } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ColorPicker, Field, Input, Segmented, Select, Slider, Switch } from "@/components/ui/form";
import { Dropzone } from "@/components/upload/dropzone";
import {
  addWatermark, addHeaderFooter, imagesToPdf, pdfToImages, pdfToText, flattenPdf, compressPdf, compressPresets, fillTemplate,
  type Position, type WatermarkOptions,
} from "@/lib/pdf/ops";
import { isProcessingAvailable, runJob } from "@/lib/processing/client";
import { parsePageRanges, formatBytes, cn } from "@/lib/utils";
import { track } from "@/lib/analytics";
import type { Tool } from "@/lib/tools";
import { readImage } from "@/components/editor/actions";
import { Intake, PageThumb, ResultCard, Working, ErrorCard, FileChip, usePdf, pdfBlob, baseName, toLoaded, type LoadedFile, type ToolResult } from "./shared";

type Phase = { k: "idle" } | { k: "working"; label: string; p?: number } | { k: "done"; r: ToolResult } | { k: "error"; m: string };

function useSingle(tool: Tool) {
  const [file, setFile] = useState<LoadedFile | null>(null);
  const [phase, setPhase] = useState<Phase>({ k: "idle" });
  const onFiles = useCallback((f: LoadedFile[]) => setFile(f[0]), []);
  const reset = () => { setFile(null); setPhase({ k: "idle" }); };
  const run = async (label: string, fn: (p: (n: number) => void) => Promise<ToolResult>) => {
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
  const gate = () => {
    if (phase.k === "working") return <Working label={phase.label} progress={phase.p} />;
    if (phase.k === "done") return <ResultCard result={phase.r} onReset={reset} tool={tool} />;
    if (phase.k === "error") return <ErrorCard message={phase.m} onReset={reset} onRetry={() => setPhase({ k: "idle" })} />;
    if (!file) return <Intake tool={tool} onFiles={onFiles} />;
    return null;
  };
  return { file, reset, run, gate };
}

function pagesFrom(input: string, count: number): number[] | "all" {
  if (!input.trim()) return "all";
  return parsePageRanges(input, count);
}

const POSITIONS: Position[] = ["top-left", "top-center", "top-right", "middle-left", "center", "middle-right", "bottom-left", "bottom-center", "bottom-right"];

function PositionGrid({ value, onChange, allowed = POSITIONS }: { value: string; onChange: (p: Position) => void; allowed?: Position[] }) {
  return (
    <div className="grid w-28 grid-cols-3 gap-1 rounded-lg border border-border bg-surface-2 p-1.5" role="radiogroup" aria-label="Position">
      {POSITIONS.map((p) => (
        <button key={p} role="radio" aria-checked={value === p} aria-label={p.replace("-", " ")} disabled={!allowed.includes(p)} onClick={() => onChange(p)}
          className={cn("h-7 rounded-md transition disabled:opacity-20", value === p ? "bg-accent" : "bg-surface hover:bg-surface-3")} />
      ))}
    </div>
  );
}

// ───────────────────────────── Watermark

export function WatermarkWorkspace({ tool }: { tool: Tool }) {
  const { file, reset, run, gate } = useSingle(tool);
  const { doc } = usePdf(file?.bytes ?? null);
  const [o, setO] = useState<WatermarkOptions>({ kind: "text", text: "CONFIDENTIAL", font: "Helvetica", bold: true, size: 60, color: "#d0312d", opacity: 0.25, rotation: 45, position: "center", pages: "all", layer: "over", imageScale: 0.4 });
  const [range, setRange] = useState("");
  const set = (p: Partial<WatermarkOptions>) => setO((x) => ({ ...x, ...p }));
  const g = gate();
  if (g) return g;
  const count = doc?.numPages ?? 0;
  return (
    <div className="grid gap-6 text-left md:grid-cols-[1fr_260px]">
      <div className="space-y-4">
        <FileChip file={file!} pages={count} onRemove={reset} />
        <Segmented label="Watermark type" value={o.kind} onChange={(kind) => set({ kind })} options={[{ value: "text", label: "Text" }, { value: "image", label: "Image" }]} />
        {o.kind === "text" ? (
          <>
            <Field label="Text">{(id) => <Input id={id} value={o.text} onChange={(e) => set({ text: e.target.value })} maxLength={80} />}</Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Font">{(id) => <Select id={id} value={o.font} onChange={(e) => set({ font: e.target.value as WatermarkOptions["font"] })}><option>Helvetica</option><option>Times</option><option>Courier</option></Select>}</Field>
              <Slider label="Size" value={o.size} min={10} max={160} onChange={(size) => set({ size })} format={(v) => `${v}pt`} />
            </div>
            <Switch label="Bold" checked={!!o.bold} onChange={(bold) => set({ bold })} />
            <ColorPicker label="Colour" value={o.color} onChange={(c) => set({ color: c ?? "#000000" })} />
          </>
        ) : (
          <div className="space-y-3">
            <label className="flex h-24 cursor-pointer items-center justify-center rounded-xl border border-dashed border-border-strong bg-surface-2 text-sm text-ink-3 hover:border-accent">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {o.image ? <img src={o.image} alt="Watermark" className="max-h-20" /> : "Choose a PNG or JPG logo"}
              <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={async (e) => { const f = e.target.files?.[0]; if (f) set({ image: (await readImage(f)).url }); }} />
            </label>
            <Slider label="Scale" value={o.imageScale ?? 0.4} min={0.05} max={2} step={0.05} onChange={(imageScale) => set({ imageScale })} format={(v) => `${Math.round(v * 100)}%`} />
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Slider label="Opacity" value={o.opacity} min={0.05} max={1} step={0.05} onChange={(opacity) => set({ opacity })} format={(v) => `${Math.round(v * 100)}%`} />
          <Slider label="Rotation" value={o.rotation} min={-90} max={90} onChange={(rotation) => set({ rotation })} format={(v) => `${v}°`} />
        </div>
        <div className="flex flex-wrap items-start gap-6">
          <div className="space-y-1.5"><p className="text-xs font-medium text-ink-2">Position</p><PositionGrid value={o.position} onChange={(position) => set({ position })} /></div>
          <div className="flex-1 space-y-3 pt-5">
            <Switch label="Tile across page" checked={o.position === "tile"} onChange={(v) => set({ position: v ? "tile" : "center" })} />
            <Switch label="Place behind content" checked={o.layer === "under"} onChange={(v) => set({ layer: v ? "under" : "over" })} />
          </div>
        </div>
        <Field label="Pages" hint="Leave empty for all pages, or e.g. “1-3, 5”.">{(id) => <Input id={id} value={range} onChange={(e) => setRange(e.target.value)} placeholder="All pages" />}</Field>
        <Button size="lg" className="w-full" disabled={o.kind === "text" ? !o.text?.trim() : !o.image} onClick={() => run("Adding watermark", async () => {
          const bytes = await addWatermark(file!.bytes, { ...o, pages: pagesFrom(range, count) });
          return { blob: pdfBlob(bytes), name: `${baseName(file!.name)}-watermarked.pdf`, editable: true };
        })}>Add watermark</Button>
      </div>
      <div className="hidden md:block">
        <p className="mb-2 text-xs font-medium text-ink-2">Preview</p>
        {doc && (
          <div className="relative overflow-hidden">
            <PageThumb doc={doc} index={0} width={260} />
            <div className="pointer-events-none absolute inset-0 flex" style={{ alignItems: o.position.startsWith("top") ? "flex-start" : o.position.startsWith("bottom") ? "flex-end" : "center", justifyContent: o.position.endsWith("left") ? "flex-start" : o.position.endsWith("right") ? "flex-end" : "center", padding: 14 }}>
              {o.kind === "text"
                ? <span style={{ transform: `rotate(${-o.rotation}deg)`, color: o.color, opacity: o.opacity, fontSize: o.size * 0.42, fontWeight: o.bold ? 700 : 400, fontFamily: o.font === "Times" ? "Times New Roman, serif" : o.font === "Courier" ? "Courier New, monospace" : "Helvetica, Arial, sans-serif", whiteSpace: "nowrap" }}>{o.text}</span>
                // eslint-disable-next-line @next/next/no-img-element
                : o.image && <img src={o.image} alt="" style={{ opacity: o.opacity, transform: `rotate(${-o.rotation}deg)`, width: `${(o.imageScale ?? 0.4) * 60}%` }} />}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ───────────────────────────── Page numbers & header/footer

export function PageNumbersWorkspace({ tool }: { tool: Tool }) {
  const { file, reset, run, gate } = useSingle(tool);
  const { doc } = usePdf(file?.bytes ?? null);
  const [pos, setPos] = useState<Position>("bottom-center");
  const [format, setFormat] = useState("{page}");
  const [start, setStart] = useState(1);
  const [size, setSize] = useState(10);
  const [margin, setMargin] = useState(28);
  const [range, setRange] = useState("");
  const g = gate();
  if (g) return g;
  const count = doc?.numPages ?? 0;
  const slot = pos.endsWith("left") ? "left" : pos.endsWith("right") ? "right" : "center";
  return (
    <div className="space-y-4 text-left">
      <FileChip file={file!} pages={count} onRemove={reset} />
      <div className="flex flex-wrap gap-6">
        <div className="space-y-1.5"><p className="text-xs font-medium text-ink-2">Position</p><PositionGrid value={pos} onChange={setPos} allowed={["top-left", "top-center", "top-right", "bottom-left", "bottom-center", "bottom-right"]} /></div>
        <div className="min-w-56 flex-1 space-y-3">
          <Field label="Format">{(id) => (
            <Select id={id} value={format} onChange={(e) => setFormat(e.target.value)}>
              <option value="{page}">1</option>
              <option value="Page {page}">Page 1</option>
              <option value="Page {page} of {pages}">Page 1 of {count || "N"}</option>
              <option value="{page} / {pages}">1 / {count || "N"}</option>
              <option value="- {page} -">- 1 -</option>
            </Select>
          )}</Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start at">{(id) => <Input id={id} type="number" min={0} value={start} onChange={(e) => setStart(parseInt(e.target.value, 10) || 1)} />}</Field>
            <Field label="Pages" hint="Empty = all">{(id) => <Input id={id} value={range} onChange={(e) => setRange(e.target.value)} placeholder="All" />}</Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Slider label="Font size" value={size} min={6} max={24} onChange={setSize} format={(v) => `${v}pt`} />
            <Slider label="Margin" value={margin} min={8} max={72} onChange={setMargin} format={(v) => `${v}pt`} />
          </div>
          <p className="text-xs text-ink-3">Preview: “{fillTemplate(format, start, count + start - 1, file!.name)}”</p>
        </div>
      </div>
      <Button size="lg" className="w-full" onClick={() => run("Numbering pages", async () => {
        const bytes = await addHeaderFooter(file!.bytes, { [slot]: format, where: pos.startsWith("top") ? "header" : "footer", size, color: "#15171c", margin, startAt: start, pages: pagesFrom(range, count), docName: baseName(file!.name) });
        return { blob: pdfBlob(bytes), name: `${baseName(file!.name)}-numbered.pdf`, editable: true };
      })}>Add page numbers</Button>
    </div>
  );
}

export function HeaderFooterWorkspace({ tool }: { tool: Tool }) {
  const { file, reset, run, gate } = useSingle(tool);
  const { doc } = usePdf(file?.bytes ?? null);
  const [h, setH] = useState({ left: "{name}", center: "", right: "{date}" });
  const [f, setF] = useState({ left: "", center: "Page {page} of {pages}", right: "" });
  const [size, setSize] = useState(9);
  const [range, setRange] = useState("");
  const g = gate();
  if (g) return g;
  const count = doc?.numPages ?? 0;
  const Row = ({ label, v, set }: { label: string; v: typeof h; set: (x: typeof h) => void }) => (
    <fieldset className="space-y-1.5">
      <legend className="text-xs font-medium text-ink-2">{label}</legend>
      <div className="grid grid-cols-3 gap-2">
        {(["left", "center", "right"] as const).map((k) => <Input key={k} aria-label={`${label} ${k}`} placeholder={k} value={v[k]} onChange={(e) => set({ ...v, [k]: e.target.value })} />)}
      </div>
    </fieldset>
  );
  return (
    <div className="space-y-4 text-left">
      <FileChip file={file!} pages={count} onRemove={reset} />
      {Row({ label: "Header", v: h, set: setH })}
      {Row({ label: "Footer", v: f, set: setF })}
      <p className="text-xs text-ink-3">Tokens: <code>{"{page}"}</code> <code>{"{pages}"}</code> <code>{"{date}"}</code> <code>{"{name}"}</code></p>
      <div className="grid grid-cols-2 gap-3">
        <Slider label="Font size" value={size} min={6} max={18} onChange={setSize} format={(v) => `${v}pt`} />
        <Field label="Pages" hint="Empty = all">{(id) => <Input id={id} value={range} onChange={(e) => setRange(e.target.value)} placeholder="All" />}</Field>
      </div>
      <Button size="lg" className="w-full" disabled={![...Object.values(h), ...Object.values(f)].some((x) => x.trim())} onClick={() => run("Adding header & footer", async () => {
        const pages = pagesFrom(range, count);
        const common = { size, color: "#5b6170", margin: 24, startAt: 1, pages, docName: baseName(file!.name) };
        let bytes = file!.bytes;
        if (Object.values(h).some((x) => x.trim())) bytes = await addHeaderFooter(bytes, { ...h, where: "header", ...common });
        if (Object.values(f).some((x) => x.trim())) bytes = await addHeaderFooter(bytes, { ...f, where: "footer", ...common });
        return { blob: pdfBlob(bytes), name: `${baseName(file!.name)}-header-footer.pdf`, editable: true };
      })}>Apply</Button>
    </div>
  );
}

// ───────────────────────────── Images → PDF

export function ImagesToPdfWorkspace({ tool }: { tool: Tool }) {
  const [files, setFiles] = useState<(LoadedFile & { url: string })[]>([]);
  const [pageSize, setPageSize] = useState<"fit" | "a4" | "letter">("a4");
  const [orientation, setOrientation] = useState<"auto" | "portrait" | "landscape">("auto");
  const [margin, setMargin] = useState(24);
  const [phase, setPhase] = useState<Phase>({ k: "idle" });
  const add = useCallback((fs: LoadedFile[]) => setFiles((x) => [...x, ...fs.map((f) => ({ ...f, url: URL.createObjectURL(new Blob([f.bytes as BlobPart], { type: f.type })) }))]), []);
  const reset = () => { setFiles([]); setPhase({ k: "idle" }); };
  if (phase.k === "working") return <Working label={phase.label} progress={phase.p} />;
  if (phase.k === "done") return <ResultCard result={phase.r} onReset={reset} tool={tool} />;
  if (phase.k === "error") return <ErrorCard message={phase.m} onReset={reset} />;
  if (!files.length) return <Intake tool={tool} onFiles={add} multiple title="Drop images here" />;
  const move = (i: number, d: number) => setFiles((x) => { const y = [...x]; const [it] = y.splice(i, 1); y.splice(i + d, 0, it); return y; });
  return (
    <div className="space-y-4 text-left">
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3">
        {files.map((f, i) => (
          <li key={f.id} className="group relative rounded-xl border border-border bg-surface p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={f.url} alt={f.name} className="h-28 w-full rounded object-contain" />
            <p className="mt-1 truncate text-[11px] text-ink-3">{i + 1}. {f.name}</p>
            <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
              <button aria-label="Move earlier" disabled={i === 0} onClick={() => move(i, -1)} className="rounded bg-surface p-1 shadow disabled:opacity-30"><ArrowUp className="size-3" /></button>
              <button aria-label="Move later" disabled={i === files.length - 1} onClick={() => move(i, 1)} className="rounded bg-surface p-1 shadow disabled:opacity-30"><ArrowDown className="size-3" /></button>
              <button aria-label={`Remove ${f.name}`} onClick={() => setFiles((x) => x.filter((y) => y.id !== f.id))} className="rounded bg-surface p-1 shadow"><X className="size-3" /></button>
            </div>
          </li>
        ))}
      </ul>
      <Dropzone accepts={tool.accepts} multiple size="compact" onFiles={(fs) => add(fs.map(toLoaded))} title="Add more images" buttonLabel="Add images" tool={tool.slug} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Page size">{(id) => <Select id={id} value={pageSize} onChange={(e) => setPageSize(e.target.value as typeof pageSize)}><option value="a4">A4</option><option value="letter">US Letter</option><option value="fit">Same as image</option></Select>}</Field>
        <Field label="Orientation">{(id) => <Select id={id} value={orientation} disabled={pageSize === "fit"} onChange={(e) => setOrientation(e.target.value as typeof orientation)}><option value="auto">Automatic</option><option value="portrait">Portrait</option><option value="landscape">Landscape</option></Select>}</Field>
        <Slider label="Margin" value={margin} min={0} max={72} onChange={setMargin} format={(v) => `${v}pt`} />
      </div>
      <Button size="lg" className="w-full" onClick={async () => {
        setPhase({ k: "working", label: "Creating PDF" });
        try {
          track("conversion_started", { tool: tool.slug, count: files.length });
          const bytes = await imagesToPdf(files.map((f) => ({ bytes: f.bytes, type: f.type })), { pageSize, orientation, margin });
          track("conversion_completed", { tool: tool.slug });
          setPhase({ k: "done", r: { blob: pdfBlob(bytes), name: `${baseName(files[0].name)}.pdf`, editable: true, summary: `${files.length} pages · ${formatBytes(bytes.length)}` } });
        } catch {
          setPhase({ k: "error", m: "One of the images couldn't be read." });
        }
      }}>Convert {files.length} image{files.length > 1 ? "s" : ""} to PDF</Button>
    </div>
  );
}

// ───────────────────────────── PDF → images / text, flatten

export function PdfToImagesWorkspace({ tool, format }: { tool: Tool; format: "jpg" | "png" }) {
  const { file, reset, run, gate } = useSingle(tool);
  const { doc } = usePdf(file?.bytes ?? null);
  const [dpi, setDpi] = useState(150);
  const [range, setRange] = useState("");
  const g = gate();
  if (g) return g;
  const count = doc?.numPages ?? 0;
  return (
    <div className="space-y-4 text-left">
      <FileChip file={file!} pages={count} onRemove={reset} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Resolution">{(id) => <Select id={id} value={dpi} onChange={(e) => setDpi(parseInt(e.target.value, 10))}><option value={72}>72 DPI · screen</option><option value={150}>150 DPI · standard</option><option value={220}>220 DPI · high</option><option value={300}>300 DPI · print</option></Select>}</Field>
        <Field label="Pages" hint="Empty = all pages">{(id) => <Input id={id} value={range} onChange={(e) => setRange(e.target.value)} placeholder="All" />}</Field>
      </div>
      <Button size="lg" className="w-full" disabled={!count} onClick={() => run(`Converting to ${format.toUpperCase()}`, async (p) => {
        const out = await pdfToImages(file!.bytes, format, dpi, pagesFrom(range, count), baseName(file!.name), (d, t) => p(Math.round((d / t) * 100)));
        return { blob: out.blob, name: out.name, summary: `${formatBytes(out.blob.size)}${out.name.endsWith(".zip") ? " · ZIP archive" : ""}` };
      })}>Convert to {format.toUpperCase()}</Button>
    </div>
  );
}

export function PdfToTextWorkspace({ tool }: { tool: Tool }) {
  const { file, reset, run, gate } = useSingle(tool);
  const g = gate();
  if (g) return g;
  return (
    <div className="space-y-4 text-left">
      <FileChip file={file!} onRemove={reset} />
      <Button size="lg" className="w-full" onClick={() => run("Extracting text", async () => {
        const text = await pdfToText(file!.bytes);
        const empty = text.replace(/─+ Page \d+ ─+/g, "").trim().length === 0;
        return { blob: new Blob([text], { type: "text/plain;charset=utf-8" }), name: `${baseName(file!.name)}.txt`, summary: empty ? "No text found. This looks like a scanned PDF, so try OCR first." : `${text.length.toLocaleString()} characters` };
      })}>Extract text</Button>
    </div>
  );
}

export function FlattenWorkspace({ tool }: { tool: Tool }) {
  const { file, reset, run, gate } = useSingle(tool);
  const g = gate();
  if (g) return g;
  return (
    <div className="space-y-4 text-left">
      <FileChip file={file!} onRemove={reset} />
      <p className="text-sm text-ink-3">Form fields will be converted into regular page content. Their current values are kept, but they can no longer be edited.</p>
      <Button size="lg" className="w-full" onClick={() => run("Flattening", async () => {
        const bytes = await flattenPdf(file!.bytes);
        return { blob: pdfBlob(bytes), name: `${baseName(file!.name)}-flattened.pdf`, editable: true };
      })}>Flatten PDF</Button>
    </div>
  );
}

// ───────────────────────────── Compress

export function CompressWorkspace({ tool }: { tool: Tool }) {
  const { file, reset, run, gate } = useSingle(tool);
  const [preset, setPreset] = useState<keyof typeof compressPresets>("recommended");
  const [cloud, setCloud] = useState(false);
  const [cloudAvailable, setCloudAvailable] = useState(false);
  useEffect(() => { isProcessingAvailable().then(setCloudAvailable); }, []);
  const g = gate();
  if (g) return g;
  const options = [
    { id: "recommended" as const, icon: Sparkles, title: "Recommended", body: "Balanced quality and size." },
    { id: "high" as const, icon: Gauge, title: "High compression", body: "Smallest file, lower image quality." },
    { id: "quality" as const, icon: Gem, title: "High quality", body: "Preserve visual quality." },
  ];
  return (
    <div className="space-y-4 text-left">
      <FileChip file={file!} onRemove={reset} />
      <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Compression level">
        {options.map(({ id, icon: Icon, title, body }) => (
          <button key={id} role="radio" aria-checked={preset === id} onClick={() => setPreset(id)} className={cn("rounded-xl border p-4 text-left transition", preset === id ? "border-accent bg-accent-soft ring-1 ring-accent" : "border-border bg-surface hover:border-border-strong")}>
            <Icon className="mb-2 size-5 text-accent" />
            <p className="text-sm font-semibold">{title}</p>
            <p className="text-xs text-ink-3">{body}</p>
          </button>
        ))}
      </div>
      {cloudAvailable && <Switch label="Deeper compression on our secure server (uploads the file temporarily)" checked={cloud} onChange={setCloud} />}
      <Button size="lg" className="w-full" onClick={() => run("Compressing", async (p) => {
        const original = file!.bytes.length;
        let bytes: Uint8Array = await compressPdf(file!.bytes, compressPresets[preset], (d, t) => p(t ? Math.round((d / t) * 90) : 50));
        // Only if the user opted in: also try the server's deeper optimisation and keep the smaller result.
        if (cloud && cloudAvailable) {
          try {
            const { blob } = await runJob("compress", [{ name: file!.name, blob: pdfBlob(file!.bytes) }], { params: { preset } });
            const server = new Uint8Array(await blob.arrayBuffer());
            if (server.length < bytes.length) bytes = server;
          } catch { /* browser result is still valid */ }
        }
        if (bytes.length >= original) bytes = file!.bytes;
        const saved = Math.max(0, Math.round((1 - bytes.length / original) * 100));
        return {
          blob: pdfBlob(bytes), name: `${baseName(file!.name)}-compressed.pdf`, editable: true,
          summary: saved > 0
            ? <><b className="text-ink">{formatBytes(original)} → {formatBytes(bytes.length)}</b> · {saved}% smaller</>
            : "This PDF is already well optimised, so we couldn't make it meaningfully smaller.",
        };
      })}>Compress PDF</Button>
    </div>
  );
}

// ───────────────────────────── PDF → Word (browser)

export function PdfToWordWorkspace({ tool }: { tool: Tool }) {
  const [file, setFile] = useState<LoadedFile | null>(null);
  const [phase, setPhase] = useState<{ k: "idle" } | { k: "working"; label: string; p: number; detail?: string } | { k: "done"; r: ToolResult } | { k: "error"; m: string }>({ k: "idle" });
  const onFiles = useCallback((f: LoadedFile[]) => setFile(f[0]), []);
  const reset = () => { setFile(null); setPhase({ k: "idle" }); };

  const convert = useCallback(async (f: LoadedFile) => {
    const started = performance.now();
    setPhase({ k: "working", label: "Opening PDF", p: 1 });
    try {
      track("conversion_started", { tool: tool.slug });
      const { openPdf } = await import("@/lib/pdf/pdfjs");
      const { pdfToDocx } = await import("@/lib/convert/pdf-to-docx");
      const pdf = await openPdf(f.bytes);
      const res = await pdfToDocx(pdf, {
        title: baseName(f.name),
        onProgress: (pr) => setPhase({ k: "working", label: pr.stage, p: pr.percent, detail: `${pr.page} of ${pr.pages} pages` }),
      });
      await pdf.destroy();
      const secs = ((performance.now() - started) / 1000).toFixed(1);
      track("conversion_completed", { tool: tool.slug, pages: res.pages });
      setPhase({ k: "done", r: {
        blob: res.blob, name: `${baseName(f.name)}.docx`,
        summary: res.words === 0
          ? "No text found. This looks like a scanned PDF, so run OCR PDF first, then convert."
          : `${res.pages} page${res.pages > 1 ? "s" : ""} · ${res.words.toLocaleString()} words${res.images ? ` · ${res.images} image${res.images > 1 ? "s" : ""}` : ""} · converted in ${secs}s`,
      } });
    } catch (e) {
      console.error(e);
      track("error_occurred", { tool: tool.slug, code: "convert_failed" });
      setPhase({ k: "error", m: "We couldn't convert this PDF. It may be damaged." });
    }
  }, [tool.slug]);

  // Start as soon as a file arrives — no extra click needed.
  useEffect(() => { if (file && phase.k === "idle") convert(file); }, [file, phase.k, convert]);

  if (phase.k === "working") return <Working label={phase.label} progress={phase.p} detail={phase.detail} />;
  if (phase.k === "done") return <ResultCard result={phase.r} onReset={reset} tool={tool} />;
  if (phase.k === "error") return <ErrorCard message={phase.m} onReset={reset} onRetry={() => file && convert(file)} />;
  return <Intake tool={tool} onFiles={onFiles} />;
}
