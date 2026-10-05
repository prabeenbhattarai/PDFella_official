"use client";

import { useCallback, useEffect, useState } from "react";
import { Info, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Switch } from "@/components/ui/form";
import { isProcessingAvailable, runJob, ProcessingError, ProcessingUnavailableError } from "@/lib/processing/client";
import { track } from "@/lib/analytics";
import type { Tool, ServerOp } from "@/lib/tools";
import { JOB_TTL_MINUTES } from "@/lib/limits";
import { Intake, ResultCard, Working, ErrorCard, FileChip, UnavailableCard, baseName, type LoadedFile, type ToolResult } from "./shared";

type Phase = { k: "idle" } | { k: "working"; label: string; p?: number } | { k: "done"; r: ToolResult } | { k: "error"; m: string } | { k: "unavailable" };

const LANGS: [string, string][] = [["eng", "English"], ["deu", "German"], ["fra", "French"], ["spa", "Spanish"], ["ita", "Italian"], ["por", "Portuguese"], ["nld", "Dutch"], ["hin", "Hindi"], ["nep", "Nepali"], ["ara", "Arabic"], ["chi_sim", "Chinese (Simplified)"], ["jpn", "Japanese"]];

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  html: "text/html",
};

export function ServerWorkspace({ tool, op, output }: { tool: Tool; op: ServerOp; output: string }) {
  const [file, setFile] = useState<LoadedFile | null>(null);
  const [phase, setPhase] = useState<Phase>({ k: "idle" });
  const [available, setAvailable] = useState<boolean | null>(null);
  const [lang, setLang] = useState("eng");
  const [password, setPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [allowPrint, setAllowPrint] = useState(true);
  const [allowCopy, setAllowCopy] = useState(false);
  const [ocrFirst, setOcrFirst] = useState(false);
  const onFiles = useCallback((f: LoadedFile[]) => setFile(f[0]), []);
  const reset = () => { setFile(null); setPhase({ k: "idle" }); setPassword(""); setConfirmPw(""); };
  useEffect(() => { isProcessingAvailable().then(setAvailable); }, []);

  if (phase.k === "working") return <Working label={phase.label} progress={phase.p} />;
  if (phase.k === "done") return <ResultCard result={phase.r} onReset={reset} tool={tool} />;
  if (phase.k === "error") return <ErrorCard message={phase.m} onReset={reset} onRetry={() => setPhase({ k: "idle" })} />;
  if (phase.k === "unavailable") return <UnavailableCard tool={tool} onReset={reset} />;
  if (!file) {
    return (
      <div className="space-y-3">
        <Intake tool={tool} onFiles={onFiles} />
        {available === false && <p className="flex items-center justify-center gap-1.5 text-xs text-warn"><Info className="size-3.5" /> The processing service isn&apos;t connected in this environment, so this tool can&apos;t run here yet.</p>}
      </div>
    );
  }

  const pwMismatch = op === "protect" && password !== confirmPw;
  const disabled = (op === "protect" && (password.length < 4 || pwMismatch)) || (op === "unlock" && !password);

  const go = async () => {
    const labels: Partial<Record<ServerOp, string>> = { ocr: "Recognising text", "office-to-pdf": "Converting to PDF", protect: "Encrypting", unlock: "Removing password", repair: "Repairing" };
    const label = labels[op] ?? "Converting";
    setPhase({ k: "working", label: "Uploading securely", p: 0 });
    track("conversion_started", { tool: tool.slug });
    try {
      const params: Record<string, unknown> = { language: lang };
      if (op === "protect") Object.assign(params, { password, allowPrint, allowCopy });
      if (op === "unlock") params.password = password;
      if (op === "pdf-to-docx") params.ocr = ocrFirst;
      const { blob } = await runJob(op, [{ name: file.name, blob: new Blob([file.bytes as BlobPart], { type: file.type || "application/octet-stream" }) }], {
        params,
        onProgress: (ph, pct) => setPhase({ k: "working", label: ph === "uploading" ? "Uploading securely" : ph === "downloading" ? "Downloading result" : label, p: ph === "processing" && !pct ? undefined : pct }),
      });
      track("conversion_completed", { tool: tool.slug });
      const suffix: Partial<Record<ServerOp, string>> = { ocr: "-searchable", protect: "-protected", unlock: "-unlocked", repair: "-repaired" };
      setPhase({ k: "done", r: { blob: new Blob([blob], { type: MIME[output] ?? blob.type }), name: `${baseName(file.name)}${suffix[op] ?? ""}.${output}`, editable: output === "pdf" && op !== "protect" } });
    } catch (e) {
      if (e instanceof ProcessingUnavailableError) return setPhase({ k: "unavailable" });
      track("error_occurred", { tool: tool.slug, code: e instanceof ProcessingError ? e.code : "unknown" });
      const msg = e instanceof ProcessingError && e.code === "wrong_password" ? "That password isn't correct for this PDF."
        : e instanceof ProcessingError && e.code === "rate_limited" ? "You've reached today's limit for cloud processing. Please try again tomorrow."
          : e instanceof ProcessingError && e.code === "not_encrypted" ? "This PDF isn't password protected."
            : "Please try again. If the problem continues, the file may be damaged or unsupported.";
      setPhase({ k: "error", m: msg });
    }
  };

  return (
    <div className="space-y-4 text-left">
      <FileChip file={file} onRemove={reset} />
      {(op === "ocr" || op === "pdf-to-docx") && (
        <Field label="Document language">{(id) => <Select id={id} value={lang} onChange={(e) => setLang(e.target.value)}>{LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>}</Field>
      )}
      {op === "pdf-to-docx" && <Switch label="Run OCR first (for scanned PDFs)" checked={ocrFirst} onChange={setOcrFirst} />}
      {op === "protect" && (
        <>
          <Field label="Password" hint="At least 4 characters. We can't recover it for you.">{(id) => <Input id={id} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />}</Field>
          <Field label="Confirm password" hint={pwMismatch && confirmPw ? "Passwords don't match." : undefined}>{(id) => <Input id={id} type="password" autoComplete="new-password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} />}</Field>
          <Switch label="Allow printing" checked={allowPrint} onChange={setAllowPrint} />
          <Switch label="Allow copying text" checked={allowCopy} onChange={setAllowCopy} />
        </>
      )}
      {op === "unlock" && <Field label="Current password">{(id) => <Input id={id} type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} />}</Field>}
      <p className="flex gap-1.5 text-xs text-ink-3"><Lock className="mt-0.5 size-3.5 shrink-0" /> Your file is uploaded over HTTPS to private storage, processed in an isolated container and deleted automatically within {JOB_TTL_MINUTES} minutes.</p>
      <Button size="lg" className="w-full" disabled={disabled} onClick={go}>{tool.name}</Button>
    </div>
  );
}
