import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import { autoMap, bulkFill, fillOne, listFormFields } from "@/lib/pdf/bulk-fill";
import { MAX_ROWS, parseCsv, parseXlsx, readSpreadsheet, SpreadsheetError } from "@/lib/spreadsheet";
import { fixture } from "./helpers";
import { readFileSync } from "node:fs";
import path from "node:path";

/** A form with one of each field type. */
async function makeForm() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 400]);
  const form = doc.getForm();
  form.createTextField("applicant.full_name").addToPage(page, { x: 10, y: 350, width: 200, height: 20 });
  const short = form.createTextField("code");
  short.setMaxLength(3);
  short.addToPage(page, { x: 10, y: 320, width: 200, height: 20 });
  form.createCheckBox("agree").addToPage(page, { x: 10, y: 290, width: 20, height: 20 });
  const dd = form.createDropdown("country");
  dd.addOptions(["Nepal", "India"]);
  dd.addToPage(page, { x: 10, y: 260, width: 200, height: 20 });
  return doc.save();
}

describe("spreadsheets", () => {
  it("reads quotes, line breaks, BOM and blank rows in CSV", () => {
    const s = parseCsv('﻿Name,Note\r\n"Rai, Asha","said ""hi""\nthen left"\r\n,\r\nBo,2\r\n');
    expect(s.headers).toEqual(["Name", "Note"]);
    expect(s.rows).toEqual([["Rai, Asha", 'said "hi"\nthen left'], ["Bo", "2"]]);
  });
  it("detects semicolons and tabs", () => {
    expect(parseCsv("a;b\n1;2").rows).toEqual([["1", "2"]]);
    expect(parseCsv("a\tb\n1\t2").rows).toEqual([["1", "2"]]);
  });
  it("rejects a sheet with no data, or too many rows", () => {
    expect(() => parseCsv("just,headers\n")).toThrow(SpreadsheetError);
    expect(() => parseCsv(`a\n${"1\n".repeat(MAX_ROWS + 1)}`)).toThrow(/up to 500/);
  });
  it("reads a real Excel file", async () => {
    const s = await parseXlsx(new Uint8Array(readFileSync(path.join(__dirname, "..", "fixtures", "guide", "budget.xlsx"))));
    expect(s.headers.length).toBeGreaterThan(0);
    expect(s.rows.length).toBeGreaterThan(0);
  });
  it("reads shared strings, inline text, gaps and entities in Excel", async () => {
    const zip = new JSZip();
    zip.file("xl/sharedStrings.xml", '<sst><si><t>Name</t></si><si><r><t>Rai </t></r><r><t>&amp; Co</t></r></si></sst>');
    zip.file("xl/worksheets/sheet1.xml", '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="inlineStr"><is><t>Age</t></is></c></row><row r="2"><c r="A2" t="s"><v>1</v></c><c r="C2"><v>30</v></c></row></sheetData></worksheet>');
    const s = await parseXlsx(await zip.generateAsync({ type: "uint8array" }));
    expect(s.headers).toEqual(["Name", "Column 2", "Age"]);
    expect(s.rows).toEqual([["Rai & Co", "", "30"]]);
  });
  it("refuses other file types", async () => {
    await expect(readSpreadsheet({ name: "x.pdf", bytes: fixture("sample.pdf") })).rejects.toThrow(/CSV or Excel/);
  });
});

describe("filling forms", () => {
  it("lists fields and matches columns by name", async () => {
    const fields = await listFormFields(await makeForm());
    expect(fields.map((f) => [f.name, f.type])).toEqual([["applicant.full_name", "text"], ["code", "text"], ["agree", "checkbox"], ["country", "choice"]]);
    expect(autoMap(fields, ["Full Name", "Country", "Other"])).toEqual({ "applicant.full_name": 0, code: null, agree: null, country: 1 });
  });
  it("fills every field type and reports values that don't fit", async () => {
    const out = await fillOne(await makeForm(), { "applicant.full_name": "Asha", code: "TOOLONG", agree: "Yes", country: "nepal" });
    const form = (await PDFDocument.load(out.bytes)).getForm();
    expect(form.getTextField("applicant.full_name").getText()).toBe("Asha");
    expect(form.getCheckBox("agree").isChecked()).toBe(true);
    expect(form.getDropdown("country").getSelected()).toEqual(["Nepal"]);
    expect(out.problems).toEqual(["“TOOLONG” doesn't fit in code"]);
    const bad = await fillOne(await makeForm(), { country: "Mars" });
    expect(bad.problems).toEqual(["“Mars” isn't an option for country"]);
  });
  it("creates one file per row, keeps names unique, and skips only rows it can't save", async () => {
    const sheet = parseCsv("name,file\nAsha,J. Smith\nBo,J. Smith\nआशा,Third\nCy,\n");
    const r = await bulkFill({ bytes: await makeForm(), name: "form.pdf", sheet, mapping: { "applicant.full_name": 0 }, nameColumn: 1, flatten: false });
    expect(r.created).toBe(3);
    expect(r.problems).toEqual(["Row 4: skipped, because it has characters this form's font can't show"]);
    const zip = await JSZip.loadAsync(await r.zip.arrayBuffer());
    expect(Object.keys(zip.files).sort()).toEqual(["J. Smith-2.pdf", "J. Smith.pdf", "form-4.pdf"]);
    const second = await PDFDocument.load(await zip.files["J. Smith-2.pdf"].async("uint8array"));
    expect(second.getForm().getTextField("applicant.full_name").getText()).toBe("Bo");
  });
  it("flattens when asked", async () => {
    const out = await fillOne(await makeForm(), { "applicant.full_name": "Asha" }, { flatten: true });
    expect((await PDFDocument.load(out.bytes)).getForm().getFields()).toHaveLength(0);
  });
});
