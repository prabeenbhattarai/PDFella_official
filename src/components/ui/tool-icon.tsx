import {
  PenLine, Type, Eraser, Highlighter, Brush, MessageSquareText, ImagePlus, Shapes, Signature, Combine, Split, RotateCw,
  LayoutGrid, FileMinus, FileOutput, FileText, FileImage, Sheet, Presentation, FileType, FileInput, Images, Minimize2,
  ScanText, Wrench, Layers, Lock, LockOpen, SquareSlash, Droplets, ListOrdered, PanelTop, ClipboardPen, TextCursorInput, File, Crop, BookMarked, FileSearch, FileSpreadsheet, Copy, Link2,
  type LucideIcon,
} from "lucide-react";

const map: Record<string, LucideIcon> = {
  PenLine, Type, Eraser, Highlighter, Brush, MessageSquareText, ImagePlus, Shapes, Signature, Combine, Split, RotateCw,
  LayoutGrid, FileMinus, FileOutput, FileText, FileImage, Sheet, Presentation, FileType, FileInput, Images, Minimize2,
  ScanText, Wrench, Layers, Lock, LockOpen, SquareSlash, Droplets, ListOrdered, PanelTop, ClipboardPen, TextCursorInput, Crop, BookMarked, FileSearch, FileSpreadsheet, Copy, Link2,
};

export function ToolIcon({ name, className }: { name: string; className?: string }) {
  const Icon = map[name] ?? File;
  return <Icon className={className} aria-hidden />;
}
