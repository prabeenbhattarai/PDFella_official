"use client";

import { useState } from "react";
import { create } from "zustand";
import { KeyRound } from "lucide-react";
import { Dialog } from "./dialog";
import { Button } from "./button";
import { Input } from "./form";

interface PromptState {
  request: { fileName: string; incorrect: boolean; resolve: (pw: string | null) => void } | null;
}
const usePrompt = create<PromptState>(() => ({ request: null }));

/** Ask the user for a PDF's open password. Resolves null if they cancel. */
export function askPassword(fileName: string, incorrect: boolean): Promise<string | null> {
  return new Promise((resolve) => usePrompt.setState({ request: { fileName, incorrect, resolve } }));
}

export function PasswordPrompt() {
  const request = usePrompt((s) => s.request);
  const [value, setValue] = useState("");
  const close = (pw: string | null) => {
    request?.resolve(pw);
    usePrompt.setState({ request: null });
    setValue("");
  };
  return (
    <Dialog open={!!request} onClose={() => close(null)} title="This PDF is password protected"
      description={`Enter the password for “${request?.fileName ?? ""}”. It's used only in your browser to unlock the file, so you can edit it freely.`}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (value) close(value); }}>
        <div className="relative">
          <KeyRound className="absolute top-2.5 left-3 size-4 text-ink-3" />
          <Input type="password" autoComplete="off" className="pl-9" data-autofocus aria-label="PDF password" aria-invalid={request?.incorrect} value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
        {request?.incorrect && <p className="text-sm text-danger" role="alert">That password isn&apos;t right. Try again.</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => close(null)}>Cancel</Button>
          <Button type="submit" disabled={!value}>Unlock</Button>
        </div>
      </form>
    </Dialog>
  );
}
