/**
 * Reads CSV and Excel files in the browser. Nothing is uploaded. Excel is read
 * directly from the file's XML, keeping the first sheet's displayed text only.
 */
import JSZip from "jszip";

export interface Sheet { headers: string[]; rows: string[][] }

/** Enough for a batch run in a browser tab without running out of memory. */
export const MAX_ROWS = 500;

export class SpreadsheetError extends Error {}

function toSheet(table: string[][]): Sheet {
  const filled = table.filter((r) => r.some((c) => c.trim()));
  if (filled.length < 2) throw new SpreadsheetError("The spreadsheet needs a header row and at least one row of data.");
  if (filled.length - 1 > MAX_ROWS) throw new SpreadsheetError(`The spreadsheet has ${filled.length - 1} rows. You can fill up to ${MAX_ROWS} at a time.`);
  const width = filled[0].length;
  const headers = filled[0].map((h, i) => h.trim() || `Column ${i + 1}`);
  return { headers, rows: filled.slice(1).map((r) => Array.from({ length: width }, (_, i) => (r[i] ?? "").trim())) };
}

function delimiterOf(text: string): string {
  const firstLine = text.slice(0, text.search(/\r?\n|$/));
  const count = (d: string) => firstLine.split(d).length;
  return [",", ";", "\t"].reduce((best, d) => (count(d) > count(best) ? d : best), ",");
}

export function parseCsv(input: string): Sheet {
  const text = input.replace(/^﻿/, "");
  const delimiter = delimiterOf(text);
  const table: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && !cell) quoted = true;
    else if (c === delimiter) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); table.push(row); row = []; cell = "";
    } else cell += c;
  }
  row.push(cell);
  table.push(row);
  return toSheet(table);
}

const unescapeXml = (s: string) => s.replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
  if (e[0] !== "#") return named[e.toLowerCase()];
  const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
  return code <= 0x10ffff ? String.fromCodePoint(code) : "";
});
const textRuns = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unescapeXml(m[1])).join("");
const attr = (tag: string, name: string) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];

function columnIndex(ref: string) {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, "").toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64;
  return n - 1;
}

export async function parseXlsx(bytes: Uint8Array): Promise<Sheet> {
  let zip: JSZip;
  try { zip = await JSZip.loadAsync(bytes); } catch { throw new SpreadsheetError("We couldn't read this Excel file. It may be damaged."); }
  const read = (name: string) => zip.file(name)?.async("string");

  const workbook = await read("xl/workbook.xml");
  const rels = await read("xl/_rels/workbook.xml.rels");
  const firstId = workbook?.match(/<sheet\s[^>]*r:id="([^"]+)"/)?.[1];
  const target = rels && firstId ? [...rels.matchAll(/<Relationship\s[^>]*>/g)].map((m) => m[0]).find((r) => attr(r, "Id") === firstId) : undefined;
  const path = target ? attr(target, "Target") : undefined;
  const sheetXml = (path && await read(path.startsWith("/") ? path.slice(1) : `xl/${path}`)) || await read("xl/worksheets/sheet1.xml");
  if (!sheetXml) throw new SpreadsheetError("We couldn't find a sheet in this Excel file.");

  const sharedXml = await read("xl/sharedStrings.xml");
  const shared = sharedXml ? [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textRuns(m[1])) : [];

  const table: string[][] = [];
  for (const rowMatch of sheetXml.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    if (table.length > MAX_ROWS + 1) break;
    const row: string[] = [];
    let next = 0;
    for (const c of (rowMatch[1] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = attr(c[1], "r");
      const at = ref ? columnIndex(ref) : next;
      next = at + 1;
      const body = c[2] ?? "";
      const type = attr(c[1], "t");
      const value = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "";
      row[at] = type === "s" ? shared[Number(value)] ?? ""
        : type === "inlineStr" ? textRuns(body)
          : type === "b" ? (value === "1" ? "TRUE" : "FALSE")
            : unescapeXml(value);
    }
    table.push(Array.from(row, (v) => v ?? ""));
  }
  return toSheet(table);
}

export async function readSpreadsheet(file: { name: string; bytes: Uint8Array }): Promise<Sheet> {
  const isZip = file.bytes[0] === 0x50 && file.bytes[1] === 0x4b;
  if (isZip) return parseXlsx(file.bytes);
  if (/\.(csv|tsv|txt)$/i.test(file.name)) return parseCsv(new TextDecoder().decode(file.bytes));
  throw new SpreadsheetError("Use a CSV or Excel (.xlsx) file.");
}
