// Generates deterministic test PDFs: tests/fixtures/{sample,form}.pdf
import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";
import { writeFileSync, mkdirSync } from "node:fs";

mkdirSync("tests/fixtures", { recursive: true });

const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);
const bold = await doc.embedFont(StandardFonts.HelveticaBold);
for (let i = 1; i <= 3; i++) {
  const p = doc.addPage([595.28, 841.89]);
  p.drawText(`Service Agreement — Page ${i}`.replace("—", "-"), { x: 60, y: 770, size: 22, font: bold, color: rgb(0.08, 0.09, 0.11) });
  const lines = [
    "This agreement is made between Acme Corporation and the Client.",
    "Payment terms: 60 days from the date of invoice.",
    "Confidential: account number 4401-2290-1187.",
    "The parties agree to the terms set out in this document.",
  ];
  lines.forEach((l, k) => p.drawText(l, { x: 60, y: 720 - k * 24, size: 12, font, color: rgb(0.15, 0.16, 0.2) }));
}
doc.getPage(2).setRotation(degrees(90));
doc.setTitle("Sample agreement");
writeFileSync("tests/fixtures/sample.pdf", await doc.save());

const f = await PDFDocument.create();
const fp = f.addPage([612, 792]);
const fh = await f.embedFont(StandardFonts.Helvetica);
fp.drawText("Application form", { x: 50, y: 730, size: 20, font: fh });
fp.drawText("Full name", { x: 50, y: 690, size: 11, font: fh });
const form = f.getForm();
const name = form.createTextField("full_name");
name.addToPage(fp, { x: 50, y: 660, width: 250, height: 22 });
fp.drawText("Subscribe", { x: 80, y: 630, size: 11, font: fh });
form.createCheckBox("subscribe").addToPage(fp, { x: 50, y: 626, width: 16, height: 16 });
const dd = form.createDropdown("country");
dd.addOptions(["Nepal", "India", "United Kingdom"]);
dd.addToPage(fp, { x: 50, y: 580, width: 200, height: 22 });
writeFileSync("tests/fixtures/form.pdf", await f.save());
// Word-per-run document (like many Word/LaTeX exports): each word is its own text operator.
const w = await PDFDocument.create();
const wp = w.addPage([595.28, 841.89]);
const wf = await w.embedFont(StandardFonts.Helvetica);
let x = 60;
for (const word of "The invoice total is 1,250 USD payable today.".split(" ")) {
  wp.drawText(word, { x, y: 700, size: 12, font: wf });
  x += wf.widthOfTextAtSize(word + " ", 12);
}
wp.drawText("Second column text", { x: 400, y: 700, size: 12, font: wf });
writeFileSync("tests/fixtures/words.pdf", await w.save());
console.log("fixtures written");
