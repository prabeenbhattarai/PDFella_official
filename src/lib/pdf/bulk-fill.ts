/**
 * Fills a PDF form once per spreadsheet row, in the browser. A row that can't be
 * saved is reported and skipped, so one bad row doesn't lose the whole batch.
 */
import { PDFCheckBox, PDFDocument, PDFDropdown, PDFOptionList, PDFRadioGroup, PDFTextField } from "pdf-lib";
import JSZip from "jszip";
import type { Sheet } from "../spreadsheet";
import { sanitizeFileName, stripExtension } from "../utils";

export type FormFieldType = "text" | "checkbox" | "choice";
export interface FormField { name: string; type: FormFieldType; options: string[] }

/** Field name → spreadsheet column, or null to leave the field empty. */
export type FieldMapping = Record<string, number | null>;

export async function listFormFields(bytes: Uint8Array): Promise<FormField[]> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const out: FormField[] = [];
  for (const f of doc.getForm().getFields()) {
    if (f.isReadOnly()) continue;
    if (f instanceof PDFTextField) out.push({ name: f.getName(), type: "text", options: [] });
    else if (f instanceof PDFCheckBox) out.push({ name: f.getName(), type: "checkbox", options: [] });
    else if (f instanceof PDFDropdown || f instanceof PDFOptionList || f instanceof PDFRadioGroup) out.push({ name: f.getName(), type: "choice", options: f.getOptions() });
  }
  return out;
}

const normalise = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

/** Match fields to columns by name, e.g. "applicant.full_name" to "Full Name". */
export function autoMap(fields: FormField[], headers: string[]): FieldMapping {
  const columns = headers.map(normalise);
  return Object.fromEntries(fields.map((f) => {
    const whole = columns.indexOf(normalise(f.name));
    const last = columns.indexOf(normalise(f.name.split(".").pop() ?? ""));
    const at = whole >= 0 ? whole : last;
    return [f.name, at >= 0 ? at : null];
  }));
}

const isTicked = (v: string) => /^(1|true|yes|y|x|on|checked|✓|✔)$/i.test(v.trim());

/** Fill one copy. Returns its bytes plus any values that didn't fit the form. */
export async function fillOne(bytes: Uint8Array, values: Record<string, string>, { flatten = false } = {}): Promise<{ bytes: Uint8Array; problems: string[] }> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const form = doc.getForm();
  const problems: string[] = [];
  for (const [name, value] of Object.entries(values)) {
    const f = form.getField(name);
    try {
      if (f instanceof PDFTextField) f.setText(value || undefined);
      else if (f instanceof PDFCheckBox) { if (isTicked(value)) f.check(); else f.uncheck(); }
      else if (value && (f instanceof PDFDropdown || f instanceof PDFOptionList || f instanceof PDFRadioGroup)) {
        const option = f.getOptions().find((o) => o.toLowerCase() === value.toLowerCase());
        if (option) f.select(option);
        else problems.push(`“${value}” isn't an option for ${name}`);
      }
    } catch {
      problems.push(`“${value}” doesn't fit in ${name}`);
    }
  }
  if (flatten) form.flatten();
  return { bytes: await doc.save({ useObjectStreams: true }), problems };
}

export interface BulkResult { zip: Blob; created: number; problems: string[] }

export async function bulkFill(
  input: { bytes: Uint8Array; name: string; sheet: Sheet; mapping: FieldMapping; nameColumn: number | null; flatten: boolean },
  onProgress?: (done: number, total: number) => void,
): Promise<BulkResult> {
  const { bytes, name, sheet, mapping, nameColumn, flatten } = input;
  const zip = new JSZip();
  const used = new Set<string>();
  const problems: string[] = [];
  let created = 0;
  for (let i = 0; i < sheet.rows.length; i++) {
    const row = sheet.rows[i];
    // Spreadsheet row numbers, counting the header as row 1.
    const label = `Row ${i + 2}`;
    const values = Object.fromEntries(Object.entries(mapping).filter(([, col]) => col !== null).map(([field, col]) => [field, row[col!] ?? ""]));
    try {
      const out = await fillOne(bytes, values, { flatten });
      const wanted = (nameColumn !== null && row[nameColumn]) || `${stripExtension(name)}-${i + 1}`;
      // The added extension stops a name like "J. Smith" losing its end as if ".Smith" were one.
      const base = stripExtension(sanitizeFileName(`${wanted}.pdf`, "pdf"));
      let file = `${base}.pdf`;
      for (let n = 2; used.has(file.toLowerCase()); n++) file = `${base}-${n}.pdf`;
      used.add(file.toLowerCase());
      zip.file(file, out.bytes);
      created++;
      problems.push(...out.problems.map((p) => `${label}: ${p}`));
    } catch {
      // pdf-lib's built-in form font can't draw every script, such as Devanagari.
      problems.push(`${label}: skipped, because it has characters this form's font can't show`);
    }
    onProgress?.(i + 1, sheet.rows.length);
    await new Promise((r) => setTimeout(r));
  }
  return { zip: await zip.generateAsync({ type: "blob" }), created, problems };
}
