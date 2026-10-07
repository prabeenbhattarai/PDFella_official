"use client";

import { useEffect, useState } from "react";
import {
  AlignCenter, AlignLeft, AlignRight, Bold, Copy, Italic, Lock, Unlock, Trash2, Underline, ArrowUpToLine, ArrowDownToLine,
  ScanText, ShieldAlert, Eye, EyeOff, Info, RotateCcw, ClipboardList, Search, Wand2, CheckCircle2,
} from "lucide-react";
import { useEditor, findObject } from "@/lib/editor/store";
import type { EditorObject, TextEditObject, TextStyle } from "@/lib/editor/model";
import { fontDisplayName, styleDiff } from "@/lib/editor/detect-style";
import { FontPicker } from "./font-picker";
import { applyOriginalStyle, checkStyle } from "./style-choice";
import { isTextLike } from "@/lib/editor/model";
import { getDoc } from "@/lib/pdf/docCache";
import { useSearch } from "@/lib/editor/search";
import { Button } from "@/components/ui/button";
import { ColorPicker, Field, Input, Segmented, Select, Slider, Switch } from "@/components/ui/form";
import { cn, uid } from "@/lib/utils";
import { TOOL_DEFS, STAMPS, STAMP_COLORS } from "./tools";

const pct = (v: number) => `${Math.round(v * 100)}%`;

function Section({ title, children, icon: Icon }: { title: string; children: React.ReactNode; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <section className="space-y-3 border-b border-border px-4 py-4 last:border-0">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-ink-3 uppercase">{Icon && <Icon className="size-3.5" />}{title}</h3>
      {children}
    </section>
  );
}

function TextControls({ value, onChange, onCommit }: { value: TextStyle; onChange: (p: Partial<TextStyle>) => void; onCommit: () => void }) {
  const ch = (p: Partial<TextStyle>) => { onCommit(); onChange(p); };
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[1fr_76px] gap-2">
        <FontPicker value={value} onChange={ch} />
        <Input aria-label="Font size" type="number" min={4} max={200} step={0.5} value={value.size} onChange={(e) => ch({ size: Math.max(4, Math.min(200, parseFloat(e.target.value) || 12)) })} />
      </div>
      <div className="flex gap-1">
        {([["bold", Bold], ["italic", Italic], ["underline", Underline]] as const).map(([k, Icon]) => (
          <Button key={k} variant="ghost" size="icon-sm" aria-label={k} aria-pressed={value[k]} active={value[k]} onClick={() => ch({ [k]: !value[k] })}><Icon /></Button>
        ))}
        <div className="ml-auto w-28">
          <Segmented label="Alignment" value={value.align} onChange={(align) => ch({ align })} options={[{ value: "left", label: <AlignLeft />, title: "Align left" }, { value: "center", label: <AlignCenter />, title: "Centre" }, { value: "right", label: <AlignRight />, title: "Align right" }]} />
        </div>
      </div>
      <ColorPicker label="Text colour" value={value.color} onChange={(c) => ch({ color: c ?? "#000000" })} />
      <ColorPicker label="Background" value={value.background} onChange={(c) => ch({ background: c })} allowNone />
      <div className="grid grid-cols-2 gap-3">
        <Slider label="Line height" value={value.lineHeight} min={0.8} max={3} step={0.05} onCommit={onCommit} onChange={(lineHeight) => onChange({ lineHeight })} format={(v) => v.toFixed(2)} />
        <Slider label="Letter spacing" value={value.letterSpacing} min={-2} max={10} step={0.1} onCommit={onCommit} onChange={(letterSpacing) => onChange({ letterSpacing })} format={(v) => `${v.toFixed(1)}pt`} />
      </div>
    </div>
  );
}

function ObjectProps({ obj }: { obj: EditorObject }) {
  const s = useEditor.getState();
  const up = (p: Partial<EditorObject>) => s.updateObject(obj.id, p);
  const upC = (p: Partial<EditorObject>) => s.updateObject(obj.id, p, { commit: true });
  const commit = () => s.commit();
  const kindLabel: Partial<Record<EditorObject["kind"], string>> = { textEdit: "Edited text", text: "Text", ink: "Drawing", field: "Form field", note: "Comment", signature: "Signature", redact: "Redaction" };

  return (
    <>
      <Section title={kindLabel[obj.kind] ?? TOOL_DEFS[obj.kind as keyof typeof TOOL_DEFS]?.label ?? obj.kind}>
        {obj.kind === "textEdit" && <OriginalStyleCard obj={obj} />}
        {isTextLike(obj) && <TextControls value={obj} onChange={(p) => { up(p); if (obj.kind === "textEdit") queueMicrotask(() => void checkStyle(obj.id)); }} onCommit={commit} />}
        {obj.kind === "textEdit" && (
          <div className="space-y-3 rounded-lg bg-surface-2 p-3 text-[13px]">
            <p className="text-ink-3">Original: <span className="text-ink-2">“{obj.original.text}”</span></p>
            <p className="flex gap-1.5 text-xs text-ink-3"><Info className="mt-0.5 size-3.5 shrink-0" /> The original text is removed from the page itself, so anything underneath (watermarks, colours, images) stays visible, and your text is written in the font shown above.</p>
            <details className="text-xs text-ink-3">
              <summary className="cursor-pointer select-none">Fallback cover colour</summary>
              <p className="mt-2 mb-2">Only used if this PDF stores the text in a way that can’t be removed safely; the original is then covered with this colour.</p>
              <ColorPicker label="Cover colour" value={obj.cover} onChange={(c) => upC({ cover: c ?? "#ffffff" })} />
            </details>
          </div>
        )}
        {(obj.kind === "rect" || obj.kind === "ellipse" || obj.kind === "cloud" || obj.kind === "polygon") && (
          <>
            <ColorPicker label="Stroke" value={obj.stroke} onChange={(stroke) => upC({ stroke })} allowNone />
            <ColorPicker label="Fill" value={obj.fill} onChange={(fill) => upC({ fill })} allowNone />
            <Slider label="Stroke width" value={obj.strokeWidth} min={0.5} max={20} step={0.5} onCommit={commit} onChange={(strokeWidth) => up({ strokeWidth })} format={(v) => `${v}pt`} />
          </>
        )}
        {(obj.kind === "line" || obj.kind === "arrow" || obj.kind === "ink") && (
          <>
            <ColorPicker label="Colour" value={obj.stroke} onChange={(c) => upC({ stroke: c ?? "#000000" })} />
            <Slider label="Stroke width" value={obj.strokeWidth} min={0.5} max={20} step={0.5} onCommit={commit} onChange={(strokeWidth) => up({ strokeWidth })} format={(v) => `${v}pt`} />
            {obj.kind !== "ink" && <Switch label="Arrow head" checked={obj.kind === "arrow"} onChange={(v) => upC({ kind: v ? "arrow" : "line" } as Partial<EditorObject>)} />}
          </>
        )}
        {obj.kind === "whiteout" && <ColorPicker label="Cover colour" value={obj.color} onChange={(c) => upC({ color: c ?? "#ffffff" })} />}
        {(obj.kind === "highlight" || obj.kind === "underline" || obj.kind === "strike" || obj.kind === "check" || obj.kind === "cross" || obj.kind === "star" || obj.kind === "dot") && (
          <ColorPicker label="Colour" value={obj.color} onChange={(c) => upC({ color: c ?? "#000000" })} />
        )}
        {obj.kind === "redact" && (
          <>
            <ColorPicker label="Redaction fill" value={obj.fill} onChange={(c) => upC({ fill: c ?? "#000000" })} swatches={["#000000", "#ffffff", "#5b6170"]} />
            <p className="flex gap-1.5 text-xs text-ink-3"><ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-danger" /> Content under this box is permanently removed when you save.</p>
          </>
        )}
        {obj.kind === "stamp" && (
          <>
            <Field label="Stamp text">{(id) => <Input id={id} value={obj.label} maxLength={24} onFocus={commit} onChange={(e) => up({ label: e.target.value })} />}</Field>
            <div className="flex flex-wrap gap-1">{STAMPS.map((l) => <button key={l} onClick={() => upC({ label: l, color: STAMP_COLORS[l] })} className="rounded border px-1.5 py-0.5 text-[10px] font-bold" style={{ color: STAMP_COLORS[l], borderColor: STAMP_COLORS[l] }}>{l}</button>)}</div>
            <ColorPicker label="Colour" value={obj.color} onChange={(c) => upC({ color: c ?? "#d0312d" })} />
          </>
        )}
        {(obj.kind === "image" || obj.kind === "signature") && (
          <div className="space-y-3">
            <p className="text-xs font-medium text-ink-2">Crop</p>
            {(["left", "top", "right", "bottom"] as const).map((side) => {
              const c = obj.crop;
              const v = side === "left" ? c.x : side === "top" ? c.y : side === "right" ? 1 - c.x - c.w : 1 - c.y - c.h;
              return (
                <Slider key={side} label={side[0].toUpperCase() + side.slice(1)} value={v} min={0} max={0.9} step={0.01} format={pct} onCommit={commit}
                  onChange={(nv) => {
                    const n = { ...c };
                    if (side === "left") { const r = c.x + c.w; n.x = Math.min(nv, r - 0.05); n.w = r - n.x; }
                    if (side === "top") { const b = c.y + c.h; n.y = Math.min(nv, b - 0.05); n.h = b - n.y; }
                    if (side === "right") n.w = Math.max(0.05, 1 - c.x - nv);
                    if (side === "bottom") n.h = Math.max(0.05, 1 - c.y - nv);
                    // Keep the visible image scale constant while cropping.
                    const sx = n.w / c.w, sy = n.h / c.h;
                    const dx = side === "left" ? (n.x - c.x) / c.w * obj.w : 0;
                    const dy = side === "top" ? (n.y - c.y) / c.h * obj.h : 0;
                    up({ crop: n, w: obj.w * sx, h: obj.h * sy, x: obj.x + dx, y: obj.y + dy });
                  }} />
              );
            })}
            {(obj.crop.w < 1 || obj.crop.h < 1) && <Button variant="ghost" size="sm" onClick={() => upC({ crop: { x: 0, y: 0, w: 1, h: 1 }, w: obj.w / obj.crop.w, h: obj.h / obj.crop.h, x: obj.x - obj.crop.x / obj.crop.w * obj.w, y: obj.y - obj.crop.y / obj.crop.h * obj.h })}><RotateCcw /> Reset crop</Button>}
          </div>
        )}
        {obj.kind === "note" && (
          <>
            <Field label="Comment">{(id) => <textarea id={id} data-autofocus rows={4} value={obj.text} onFocus={commit} onChange={(e) => up({ text: e.target.value })} className="w-full rounded-lg border border-border-strong bg-surface p-2.5 text-sm focus:border-accent focus:outline-none" placeholder="Write a comment…" />}</Field>
            <Field label="Author">{(id) => <Input id={id} value={obj.author} onFocus={commit} onChange={(e) => up({ author: e.target.value })} placeholder="Your name" />}</Field>
            <ColorPicker label="Colour" value={obj.color} onChange={(c) => upC({ color: c ?? "#ffd84d" })} swatches={["#ffd84d", "#ff9d2e", "#7dd3fc", "#86efac", "#f9a8d4"]} />
          </>
        )}
        {obj.kind === "link" && (
          <Field label="Link address" hint={/^(https?:\/\/[^\s]+\.[^\s]+|mailto:\S+@\S+)$/i.test(obj.url) ? undefined : "Enter a full web address (https://…) or mailto: link."}>
            {(id) => <Input id={id} value={obj.url} onFocus={commit} onChange={(e) => up({ url: e.target.value.trim() })} placeholder="https://example.com" />}
          </Field>
        )}
        {obj.kind === "field" && (
          <>
            <p className="text-[13px] text-ink-2 capitalize">{obj.fieldType} field</p>
            <Field label={obj.fieldType === "radio" ? "Option value" : "Field name"}>{(id) => <Input id={id} value={obj.name} onFocus={commit} onChange={(e) => up({ name: e.target.value.replace(/[.]/g, "_") })} />}</Field>
            {obj.fieldType === "radio" && <Field label="Group" hint="Radio buttons in the same group are mutually exclusive.">{(id) => <Input id={id} value={obj.group ?? ""} onFocus={commit} onChange={(e) => up({ group: e.target.value })} />}</Field>}
            {obj.fieldType === "dropdown" && <Field label="Options" hint="One per line.">{(id) => <textarea id={id} rows={4} value={obj.options.join("\n")} onFocus={commit} onChange={(e) => up({ options: e.target.value.split("\n") })} className="w-full rounded-lg border border-border-strong bg-surface p-2.5 text-sm" />}</Field>}
            {obj.fieldType !== "radio" && <Switch label="Required" checked={obj.required} onChange={(required) => upC({ required })} />}
          </>
        )}
        {obj.kind !== "highlight" && obj.kind !== "redact" && obj.kind !== "field" && obj.kind !== "link" && (
          <Slider label="Opacity" value={obj.opacity} min={0.05} max={1} step={0.05} onCommit={commit} onChange={(opacity) => up({ opacity })} format={pct} />
        )}
        {obj.kind === "highlight" && <Slider label="Opacity" value={obj.opacity} min={0.15} max={1} step={0.05} onCommit={commit} onChange={(opacity) => up({ opacity })} format={pct} />}
        {!["line", "arrow", "note", "field", "link", "redact", "highlight", "underline", "strike", "whiteout"].includes(obj.kind) && (
          <Slider label="Rotation" value={obj.rotation > 180 ? obj.rotation - 360 : obj.rotation} min={-180} max={180} step={1} onCommit={commit} onChange={(r) => up({ rotation: (r + 360) % 360 })} format={(v) => `${Math.round(v)}°`} />
        )}
      </Section>
      <Section title="Arrange">
        <div className="flex flex-wrap gap-1">
          <Button variant="ghost" size="icon-sm" title="Duplicate (Ctrl+D)" aria-label="Duplicate" onClick={() => s.duplicateObjects([obj.id])}><Copy /></Button>
          <Button variant="ghost" size="icon-sm" title="Bring to front" aria-label="Bring to front" onClick={() => s.bringToFront(obj.id)}><ArrowUpToLine /></Button>
          <Button variant="ghost" size="icon-sm" title="Send to back" aria-label="Send to back" onClick={() => s.sendToBack(obj.id)}><ArrowDownToLine /></Button>
          <Button variant="ghost" size="icon-sm" title={obj.locked ? "Unlock" : "Lock position"} aria-label={obj.locked ? "Unlock" : "Lock"} onClick={() => upC({ locked: !obj.locked })}>{obj.locked ? <Unlock /> : <Lock />}</Button>
          <Button variant="ghost" size="icon-sm" title="Delete (Del)" aria-label="Delete" className="ml-auto hover:text-danger" onClick={() => s.removeObjects([obj.id])}><Trash2 /></Button>
        </div>
      </Section>
    </>
  );
}

const MATCH_TEXT = {
  embedded: "Exact font, reused from this PDF",
  metric: "Same design and letter widths",
  similar: "Not in this PDF. Closest match used",
};

/** What the original text looked like, how faithfully we reproduce it, and a one-click restore. */
function OriginalStyleCard({ obj }: { obj: TextEditObject }) {
  if (!obj.originalStyle) return null;
  const o = obj.originalStyle;
  const differs = styleDiff(obj).length > 0;
  const kind = obj.fontMatch?.kind ?? "similar";
  return (
    <div className="space-y-2 rounded-lg border border-border p-3 text-[13px]" data-original-style>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold tracking-wide text-ink-3 uppercase">Original style</p>
        {differs ? (
          <Button size="sm" variant="outline" className="h-7 px-2 text-[12px]" onClick={() => applyOriginalStyle(obj)}><Wand2 /> Match original</Button>
        ) : (
          <span className="flex items-center gap-1 text-[12px] font-medium text-ok"><CheckCircle2 className="size-3.5" /> Matching</span>
        )}
      </div>
      <p className="text-ink-2">
        <span className="font-medium text-ink">{obj.fontMatch?.name ?? fontDisplayName(o.font, obj)}</span> · {o.size} pt
        <span className="ml-1.5 inline-block size-3 translate-y-0.5 rounded-sm border border-black/15" style={{ background: o.color }} title={o.color} />
      </p>
      <p className={cn("text-xs", kind === "similar" ? "text-warn" : "text-ink-3")}>
        {MATCH_TEXT[kind]}{kind !== "embedded" && <> ({fontDisplayName(o.font, obj)})</>}
      </p>
    </div>
  );
}

function ToolDefaults() {
  const tool = useEditor((s) => s.tool);
  const style = useEditor((s) => s.style);
  const { setStyle, setTextStyle } = useEditor.getState();
  const def = TOOL_DEFS[tool];
  const shape = ["rect", "ellipse", "polygon", "cloud"].includes(tool);
  const stroke = ["line", "arrow", "ink", "underline", "strike"].includes(tool) || shape;
  const noop = () => {};
  return (
    <Section title={def.label}>
      <p className="text-[13px] leading-snug text-ink-3">{def.hint}</p>
      {tool === "text" && <TextControls value={style.text} onChange={setTextStyle} onCommit={noop} />}
      {stroke && <ColorPicker label={shape ? "Stroke" : "Colour"} value={style.stroke} onChange={(c) => setStyle({ stroke: c ?? "#000000" })} />}
      {shape && <ColorPicker label="Fill" value={style.fill} onChange={(fill) => setStyle({ fill })} allowNone />}
      {(stroke && !["underline", "strike"].includes(tool)) && <Slider label="Stroke width" value={style.strokeWidth} min={0.5} max={20} step={0.5} onChange={(strokeWidth) => setStyle({ strokeWidth })} format={(v) => `${v}pt`} />}
      {(["ink", "line", "arrow"].includes(tool) || shape) && <Slider label="Opacity" value={style.opacity} min={0.05} max={1} step={0.05} onChange={(opacity) => setStyle({ opacity })} format={pct} />}
      {tool === "highlight" && <ColorPicker label="Highlight colour" value={style.highlight} onChange={(c) => setStyle({ highlight: c ?? "#ffe14d" })} swatches={["#ffe14d", "#7dd3fc", "#86efac", "#f9a8d4", "#fdba74", "#c4b5fd"]} />}
      {tool === "whiteout" && <ColorPicker label="Cover colour" value={style.whiteout} onChange={(c) => setStyle({ whiteout: c ?? "#ffffff" })} />}
      {tool === "stamp" && (
        <div className="grid grid-cols-2 gap-1.5">
          {STAMPS.map((l) => (
            <button key={l} onClick={() => setStyle({ stamp: l })} className={cn("rounded-md border-2 py-1.5 text-[11px] font-black tracking-wider", style.stamp === l ? "ring-2 ring-accent ring-offset-1 ring-offset-surface" : "")} style={{ color: STAMP_COLORS[l], borderColor: STAMP_COLORS[l] }}>{l}</button>
          ))}
        </div>
      )}
      {tool === "field" && (
        <Select aria-label="Field type" value={style.fieldType} onChange={(e) => setStyle({ fieldType: e.target.value as typeof style.fieldType })}>
          <option value="text">Text field</option>
          <option value="checkbox">Checkbox</option>
          <option value="radio">Radio button</option>
          <option value="dropdown">Dropdown</option>
          <option value="date">Date field</option>
          <option value="signature">Signature field</option>
        </Select>
      )}
      {tool === "redact" && <RedactInfo />}
    </Section>
  );
}

function RedactInfo() {
  const preview = useEditor((s) => s.redactPreview);
  return (
    <div className="space-y-3">
      <p className="flex gap-1.5 rounded-lg bg-danger-soft p-2.5 text-xs text-danger"><ShieldAlert className="mt-0.5 size-3.5 shrink-0" /> Redaction is permanent. Marked content is removed from the saved file, not just hidden.</p>
      <Button variant="outline" size="sm" className="w-full" onClick={() => useEditor.getState().setRedactPreview(!preview)}>{preview ? <EyeOff /> : <Eye />} {preview ? "Show marks" : "Preview redactions"}</Button>
      <Button variant="ghost" size="sm" className="w-full" onClick={() => useSearch.getState().setOpen(true)}><Search /> Find text to redact</Button>
    </div>
  );
}

type FormField = { name: string; type: string; value: string | boolean; options: { value: string; label: string }[]; exportValue?: string; readOnly: boolean };

function FormPanel() {
  const sources = useEditor((s) => s.sources);
  const values = useEditor((s) => s.formValues);
  const [fields, setFields] = useState<FormField[] | null>(null);
  useEffect(() => {
    const src = Object.values(sources).find((x) => x.hasForm);
    if (!src) { setFields([]); return; }
    getDoc(src.id).then(async (doc) => {
      const all = (await doc.getFieldObjects()) ?? {};
      const out: FormField[] = [];
      for (const [name, entries] of Object.entries(all)) {
        // pdf.js lists the parent field (type "") before its widgets; use the widgets.
        const widgets = (entries as Record<string, unknown>[]).filter((x) => x.type);
        const w = widgets[0];
        if (!w) continue;
        const type = String(w.type);
        if (type === "button" && !widgets.some((x) => x.exportValues)) continue;
        if (type === "signature" || type === "") continue;
        const items = (w.items as { exportValue: string; displayValue: string }[] | undefined) ?? [];
        out.push({
          name, type, readOnly: Boolean(w.readOnly),
          value: (type === "checkbox" ? w.value !== "Off" && !!w.value : String(w.value ?? "")) as string | boolean,
          options: type === "radiobutton" ? widgets.map((x) => ({ value: String(x.buttonValue ?? x.exportValues), label: String(x.buttonValue ?? x.exportValues) })) : items.map((i) => ({ value: i.exportValue, label: i.displayValue })),
        });
      }
      setFields(out);
    }).catch(() => setFields([]));
  }, [sources]);
  if (!fields?.length) return null;
  const set = useEditor.getState().setFormValue;
  return (
    <Section title={`Form fields · ${fields.length}`} icon={ClipboardList}>
      <p className="text-xs text-ink-3">This document has fillable fields. Values are written into the PDF when you save.</p>
      <div className="space-y-3">
        {fields.map((f) => {
          const v = values[f.name] ?? f.value;
          if (f.type === "checkbox") return <Switch key={f.name} label={f.name} checked={Boolean(v)} onChange={(c) => set(f.name, c)} />;
          if (f.type === "combobox" || f.type === "listbox" || f.type === "radiobutton") {
            return <Field key={f.name} label={f.name}>{(id) => <Select id={id} value={String(v)} disabled={f.readOnly} onChange={(e) => set(f.name, e.target.value)}><option value="">—</option>{f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>}</Field>;
          }
          return <Field key={f.name} label={f.name}>{(id) => <Input id={id} value={String(v)} disabled={f.readOnly} onChange={(e) => set(f.name, e.target.value)} />}</Field>;
        })}
      </div>
    </Section>
  );
}

function DocumentPanel({ onOcr }: { onOcr: () => void }) {
  const sources = useEditor((s) => s.sources);
  const pages = useEditor((s) => s.pages);
  const objects = useEditor((s) => s.objects);
  const all = Object.values(objects).flat();
  const redactions = all.filter((o) => o.kind === "redact").length;
  const scanned = Object.values(sources).some((x) => x.scanned);
  return (
    <>
      {scanned && (
        <Section title="Scanned document" icon={ScanText}>
          <p className="text-[13px] text-ink-2">This looks like a scanned document, so its text can&apos;t be searched or edited yet.</p>
          <Button size="sm" onClick={onOcr} className="w-full"><ScanText /> Run OCR to make it searchable</Button>
        </Section>
      )}
      <FormPanel />
      {redactions > 0 && (
        <Section title="Redactions" icon={ShieldAlert}>
          <p className="text-[13px] text-ink-2">{redactions} area{redactions > 1 ? "s" : ""} marked. They&apos;ll be permanently removed when you save.</p>
          <RedactInfo />
        </Section>
      )}
      <Section title="Document">
        <dl className="grid grid-cols-2 gap-y-1.5 text-[13px]">
          <dt className="text-ink-3">Pages</dt><dd className="text-right tabular-nums">{pages.length}</dd>
          <dt className="text-ink-3">Edits</dt><dd className="text-right tabular-nums">{all.length}</dd>
          <dt className="text-ink-3">Files</dt><dd className="text-right tabular-nums">{Object.keys(sources).length}</dd>
        </dl>
        <p className="text-xs leading-relaxed text-ink-3">Pick a tool on the left, or select an object to style it. Everything stays on your device until you download.</p>
      </Section>
    </>
  );
}

export function PropertiesPanel({ onOcr }: { onOcr: () => void }) {
  const selection = useEditor((s) => s.selection);
  const objects = useEditor((s) => s.objects);
  const tool = useEditor((s) => s.tool);
  const single = selection.length === 1 ? findObject(objects, selection[0])?.obj : undefined;

  if (single) return <ObjectProps key={single.id} obj={single} />;
  if (selection.length > 1) {
    return (
      <Section title={`${selection.length} objects selected`}>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => useEditor.getState().duplicateObjects(selection)}><Copy /> Duplicate</Button>
          <Button variant="outline" size="sm" className="text-danger" onClick={() => useEditor.getState().removeObjects(selection)}><Trash2 /> Delete</Button>
        </div>
      </Section>
    );
  }
  return (
    <>
      {tool !== "select" && tool !== "hand" && <ToolDefaults />}
      <DocumentPanel onOcr={onOcr} />
    </>
  );
}

export const newId = uid;
