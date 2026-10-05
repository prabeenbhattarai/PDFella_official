"use client";

import { useEffect, useRef, useState } from "react";
import { Upload, Eraser } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Segmented, ColorPicker } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import { readImage } from "./actions";

export const SIGNATURE_FONTS = [
  { name: "Script", css: "var(--font-sig-1)" },
  { name: "Elegant", css: "var(--font-sig-2)" },
  { name: "Casual", css: "var(--font-sig-3)" },
  { name: "Formal", css: "var(--font-sig-4)" },
];
const INK = ["#15171c", "#1f3a8a", "#0c4a6e", "#7f1d1d"];

/** Trim transparent margins so placed signatures have tight bounds. */
function trimCanvas(src: HTMLCanvasElement): { url: string; width: number; height: number } | null {
  const g = src.getContext("2d")!;
  const { width, height } = src;
  const data = g.getImageData(0, 0, width, height).data;
  let x0 = width, y0 = height, x1 = 0, y1 = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (data[(y * width + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 <= x0 || y1 <= y0) return null;
  const pad = 6;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(width, x1 + pad); y1 = Math.min(height, y1 + pad);
  const out = document.createElement("canvas");
  out.width = x1 - x0; out.height = y1 - y0;
  out.getContext("2d")!.drawImage(src, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return { url: out.toDataURL("image/png"), width: out.width / 3, height: out.height / 3 };
}

export function SignatureDialog({ open, onClose, onCreate, title = "Create your signature" }: { open: boolean; onClose: () => void; onCreate: (s: { url: string; width: number; height: number }) => void; title?: string }) {
  const [mode, setMode] = useState<"type" | "draw" | "upload">("type");
  const [name, setName] = useState("");
  const [font, setFont] = useState(0);
  const [ink, setInk] = useState<string | null>(INK[0]);
  const [hasDrawing, setHasDrawing] = useState(false);
  const [upload, setUpload] = useState<{ url: string; width: number; height: number } | null>(null);
  const [removeBg, setRemoveBg] = useState(true);
  const pad = useRef<HTMLCanvasElement>(null);
  const drawing = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!open || mode !== "draw" || !pad.current) return;
    const c = pad.current;
    const r = c.getBoundingClientRect();
    c.width = r.width * 3; c.height = r.height * 3;
    setHasDrawing(false);
  }, [open, mode]);

  const pos = (e: React.PointerEvent) => {
    const r = pad.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) * 3, y: (e.clientY - r.top) * 3, p: e.pressure || 0.5 };
  };
  const down = (e: React.PointerEvent) => { pad.current!.setPointerCapture(e.pointerId); drawing.current = pos(e); };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const p = pos(e);
    const g = pad.current!.getContext("2d")!;
    g.strokeStyle = ink ?? INK[0];
    g.lineCap = "round"; g.lineJoin = "round";
    g.lineWidth = 5 + (e.pointerType === "pen" ? p.p * 6 : 2);
    g.beginPath(); g.moveTo(drawing.current.x, drawing.current.y); g.lineTo(p.x, p.y); g.stroke();
    drawing.current = p;
    setHasDrawing(true);
  };
  const clear = () => { const c = pad.current!; c.getContext("2d")!.clearRect(0, 0, c.width, c.height); setHasDrawing(false); };

  const onUpload = async (f: File | undefined) => {
    if (!f) return;
    const img = await readImage(f);
    setUpload(img);
  };

  /** Make near-white pixels transparent (scanned signatures on paper). */
  const knockOut = async (src: { url: string; width: number; height: number }) => {
    const img = new Image();
    img.src = src.url;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext("2d")!;
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height);
    for (let i = 0; i < d.data.length; i += 4) {
      const l = (d.data[i] + d.data[i + 1] + d.data[i + 2]) / 3;
      if (l > 200) d.data[i + 3] = Math.max(0, 255 - (l - 200) * 4.6);
    }
    g.putImageData(d, 0, 0);
    return { url: c.toDataURL("image/png"), width: src.width, height: src.height };
  };

  const create = async () => {
    if (mode === "type") {
      const c = document.createElement("canvas");
      c.width = 1800; c.height = 400;
      const g = c.getContext("2d")!;
      const root = document.documentElement;
      const css = getComputedStyle(root).getPropertyValue(SIGNATURE_FONTS[font].css.slice(4, -1)) || "cursive";
      await document.fonts.load(`150px ${css}`).catch(() => {});
      g.font = `150px ${css}`;
      g.fillStyle = ink ?? INK[0];
      g.textBaseline = "middle";
      g.fillText(name, 40, 210, 1720);
      const t = trimCanvas(c);
      if (t) onCreate(t);
    } else if (mode === "draw" && pad.current) {
      const t = trimCanvas(pad.current);
      if (t) onCreate(t);
    } else if (upload) {
      onCreate(removeBg ? await knockOut(upload) : upload);
    }
    onClose();
  };

  const can = mode === "type" ? name.trim().length > 0 : mode === "draw" ? hasDrawing : !!upload;

  return (
    <Dialog open={open} onClose={onClose} title={title} description="Your signature stays in this browser tab. It is never uploaded." size="lg"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={create} disabled={!can}>Use signature</Button></>}>
      <div className="space-y-4">
        <Segmented label="Signature method" value={mode} onChange={setMode} options={[{ value: "type", label: "Type" }, { value: "draw", label: "Draw" }, { value: "upload", label: "Upload" }]} />
        {mode === "type" && (
          <div className="space-y-3">
            <Input data-autofocus placeholder="Type your name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Your name" maxLength={60} />
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Signature style">
              {SIGNATURE_FONTS.map((f, i) => (
                <button key={f.name} role="radio" aria-checked={font === i} onClick={() => setFont(i)} className={cn("flex h-20 items-center justify-center overflow-hidden rounded-xl border bg-white px-3 text-3xl text-neutral-900 dark:bg-[#f4f4f1]", font === i ? "border-accent ring-2 ring-accent/30" : "border-border")} style={{ fontFamily: f.css, color: ink ?? undefined }}>
                  <span className="truncate">{name || "Your Name"}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {mode === "draw" && (
          <div className="space-y-2">
            <div className="relative">
              <canvas ref={pad} onPointerDown={down} onPointerMove={move} onPointerUp={() => (drawing.current = null)} className="h-48 w-full touch-none rounded-xl border border-dashed border-border-strong bg-white dark:bg-[#f4f4f1]" aria-label="Signature drawing area" />
              <div className="pointer-events-none absolute right-6 bottom-10 left-6 border-b border-neutral-300" />
              {!hasDrawing && <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-neutral-400">Sign here with your mouse, pen or finger</p>}
            </div>
            <Button variant="ghost" size="sm" onClick={clear}><Eraser /> Clear</Button>
          </div>
        )}
        {mode === "upload" && (
          <div className="space-y-3">
            <label className="flex h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border-strong bg-surface-2 text-sm text-ink-3 hover:border-accent">
              {upload ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={upload.url} alt="Uploaded signature" className="max-h-32 max-w-[80%] object-contain" />
              ) : (<><Upload className="size-5" /> Choose a PNG or JPG of your signature</>)}
              <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => onUpload(e.target.files?.[0])} />
            </label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={removeBg} onChange={(e) => setRemoveBg(e.target.checked)} className="accent-[var(--accent)]" /> Remove white background</label>
          </div>
        )}
        {mode !== "upload" && <ColorPicker label="Ink colour" value={ink} onChange={setInk} swatches={INK} />}
      </div>
    </Dialog>
  );
}
