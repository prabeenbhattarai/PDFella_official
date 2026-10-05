"use client";

import { useCallback, useState } from "react";
import { Lock, LockOpen, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Switch } from "@/components/ui/form";
import { encryptPdf, repairPdf, isEncrypted } from "@/lib/pdf/qpdf";
import { ensureUnlocked, PasswordCancelledError } from "@/lib/pdf/unlock";
import { formatBytes } from "@/lib/utils";
import { track } from "@/lib/analytics";
import type { Tool } from "@/lib/tools";
import { Intake, ResultCard, Working, ErrorCard, FileChip, pdfBlob, baseName, type LoadedFile, type ToolResult } from "./shared";

type Phase = { k: "idle" } | { k: "working"; label: string } | { k: "done"; r: ToolResult } | { k: "error"; m: string };

export function UnlockWorkspace({ tool }: { tool: Tool }) {
  const [phase, setPhase] = useState<Phase>({ k: "idle" });
  const reset = () => setPhase({ k: "idle" });
  // Receive the raw file so we can tell the user what was removed.
  const onFiles = useCallback(async (files: LoadedFile[]) => {
    const f = files[0];
    if (!isEncrypted(f.bytes)) {
      setPhase({ k: "done", r: { blob: pdfBlob(f.bytes), name: f.name, editable: true, summary: "This PDF isn't protected. It's ready to use as it is." } });
      return;
    }
    setPhase({ k: "working", label: "Unlocking" });
    try {
      const { bytes } = await ensureUnlocked(f.name, f.bytes);
      track("conversion_completed", { tool: tool.slug });
      setPhase({ k: "done", r: { blob: pdfBlob(bytes), name: `${baseName(f.name)}-unlocked.pdf`, editable: true, summary: <span className="inline-flex items-center gap-1"><LockOpen className="size-3.5" /> Password and restrictions removed · {formatBytes(bytes.length)}</span> } });
    } catch (e) {
      setPhase(e instanceof PasswordCancelledError ? { k: "idle" } : { k: "error", m: "This PDF uses protection we couldn't remove, or the file is damaged." });
    }
  }, [tool.slug]);
  if (phase.k === "working") return <Working label={phase.label} />;
  if (phase.k === "done") return <ResultCard result={phase.r} onReset={reset} tool={tool} />;
  if (phase.k === "error") return <ErrorCard message={phase.m} onReset={reset} />;
  return <Intake tool={tool} onFiles={onFiles} raw />;
}

export function ProtectWorkspace({ tool }: { tool: Tool }) {
  const [file, setFile] = useState<LoadedFile | null>(null);
  const [phase, setPhase] = useState<Phase>({ k: "idle" });
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [allowPrint, setAllowPrint] = useState(true);
  const [allowCopy, setAllowCopy] = useState(false);
  const [allowEdit, setAllowEdit] = useState(false);
  const onFiles = useCallback((f: LoadedFile[]) => setFile(f[0]), []);
  const reset = () => { setFile(null); setPhase({ k: "idle" }); setPw(""); setConfirm(""); };
  if (phase.k === "working") return <Working label={phase.label} />;
  if (phase.k === "done") return <ResultCard result={phase.r} onReset={reset} tool={tool} />;
  if (phase.k === "error") return <ErrorCard message={phase.m} onReset={reset} onRetry={() => setPhase({ k: "idle" })} />;
  if (!file) return <Intake tool={tool} onFiles={onFiles} />;
  const mismatch = confirm.length > 0 && pw !== confirm;
  return (
    <div className="space-y-4 text-left">
      <FileChip file={file} onRemove={reset} />
      <Field label="Password" hint="At least 4 characters. We never see it and can't recover it.">{(id) => <Input id={id} type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />}</Field>
      <Field label="Confirm password" hint={mismatch ? "Passwords don't match." : undefined}>{(id) => <Input id={id} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />}</Field>
      <Switch label="Allow printing" checked={allowPrint} onChange={setAllowPrint} />
      <Switch label="Allow copying text" checked={allowCopy} onChange={setAllowCopy} />
      <Switch label="Allow editing" checked={allowEdit} onChange={setAllowEdit} />
      <p className="flex gap-1.5 text-xs text-ink-3"><ShieldCheck className="mt-0.5 size-3.5 shrink-0" /> Encrypted with AES-256 in your browser. Your file and password are never uploaded.</p>
      <Button size="lg" className="w-full" disabled={pw.length < 4 || pw !== confirm} onClick={async () => {
        setPhase({ k: "working", label: "Encrypting" });
        try {
          const bytes = await encryptPdf(file.bytes, { userPassword: pw, allowPrint, allowCopy, allowEdit });
          track("conversion_completed", { tool: tool.slug });
          setPhase({ k: "done", r: { blob: pdfBlob(bytes), name: `${baseName(file.name)}-protected.pdf`, summary: <span className="inline-flex items-center gap-1"><Lock className="size-3.5" /> AES-256 protected · {formatBytes(bytes.length)}</span> } });
        } catch {
          setPhase({ k: "error", m: "We couldn't encrypt this PDF." });
        }
      }}><Lock /> Protect PDF</Button>
    </div>
  );
}

export function RepairWorkspace({ tool }: { tool: Tool }) {
  const [phase, setPhase] = useState<Phase>({ k: "idle" });
  const reset = () => setPhase({ k: "idle" });
  const onFiles = useCallback(async (files: LoadedFile[]) => {
    const f = files[0];
    setPhase({ k: "working", label: "Repairing" });
    try {
      const bytes = await repairPdf(f.bytes);
      track("conversion_completed", { tool: tool.slug });
      setPhase({ k: "done", r: { blob: pdfBlob(bytes), name: `${baseName(f.name)}-repaired.pdf`, editable: true } });
    } catch {
      setPhase({ k: "error", m: "This file is too damaged to recover." });
    }
  }, [tool.slug]);
  if (phase.k === "working") return <Working label={phase.label} />;
  if (phase.k === "done") return <ResultCard result={phase.r} onReset={reset} tool={tool} />;
  if (phase.k === "error") return <ErrorCard message={phase.m} onReset={reset} />;
  // Damaged files may not pass the PDF signature check strictly, but they still start with %PDF.
  return <Intake tool={tool} onFiles={onFiles} raw />;
}
