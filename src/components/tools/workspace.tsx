"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import type { Tool } from "@/lib/tools";
import { editorHref } from "@/lib/tools";
import { HeroUpload } from "@/components/marketing/hero-upload";
import { track } from "@/lib/analytics";

// Each workspace (and the PDF libraries it needs) is loaded only on its own tool page.
const loading = () => <div className="h-60 animate-pulse rounded-2xl border-2 border-dashed border-border-strong bg-surface" />;
const Merge = dynamic(() => import("./organise").then((m) => m.MergeWorkspace), { loading });
const Split = dynamic(() => import("./organise").then((m) => m.SplitWorkspace), { loading });
const Pages = dynamic(() => import("./organise").then((m) => m.PagesWorkspace), { loading });
const Compress = dynamic(() => import("./transform").then((m) => m.CompressWorkspace), { loading });
const Watermark = dynamic(() => import("./transform").then((m) => m.WatermarkWorkspace), { loading });
const PageNumbers = dynamic(() => import("./transform").then((m) => m.PageNumbersWorkspace), { loading });
const HeaderFooter = dynamic(() => import("./transform").then((m) => m.HeaderFooterWorkspace), { loading });
const ImagesToPdf = dynamic(() => import("./transform").then((m) => m.ImagesToPdfWorkspace), { loading });
const PdfToImages = dynamic(() => import("./transform").then((m) => m.PdfToImagesWorkspace), { loading });
const PdfToText = dynamic(() => import("./transform").then((m) => m.PdfToTextWorkspace), { loading });
const Flatten = dynamic(() => import("./transform").then((m) => m.FlattenWorkspace), { loading });
const PdfToWord = dynamic(() => import("./transform").then((m) => m.PdfToWordWorkspace), { loading });
const Unlock = dynamic(() => import("./security").then((m) => m.UnlockWorkspace), { loading });
const Protect = dynamic(() => import("./security").then((m) => m.ProtectWorkspace), { loading });
const Repair = dynamic(() => import("./security").then((m) => m.RepairWorkspace), { loading });
const Server = dynamic(() => import("./server").then((m) => m.ServerWorkspace), { loading });

export function ToolWorkspace({ tool }: { tool: Tool }) {
  useEffect(() => { track("tool_opened", { tool: tool.slug }); }, [tool.slug]);
  const w = tool.workspace;
  switch (w.type) {
    case "editor": {
      const href = editorHref(tool);
      return <HeroUpload query={href.slice("/editor".length)} accepts={tool.accepts} multiple={false} size="default" />;
    }
    case "merge": return <Merge tool={tool} />;
    case "split": return <Split tool={tool} />;
    case "pages": return <Pages tool={tool} op={w.op} />;
    case "compress": return <Compress tool={tool} />;
    case "watermark": return <Watermark tool={tool} />;
    case "page-numbers": return <PageNumbers tool={tool} />;
    case "header-footer": return <HeaderFooter tool={tool} />;
    case "images-to-pdf": return <ImagesToPdf tool={tool} />;
    case "pdf-to-images": return <PdfToImages tool={tool} format={w.format} />;
    case "pdf-to-text": return <PdfToText tool={tool} />;
    case "flatten": return <Flatten tool={tool} />;
    case "pdf-to-docx": return <PdfToWord tool={tool} />;
    case "unlock": return <Unlock tool={tool} />;
    case "protect": return <Protect tool={tool} />;
    case "repair": return <Repair tool={tool} />;
    case "server": return <Server tool={tool} op={w.op} output={w.output} />;
  }
}
