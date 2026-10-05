// Generates public/samples/agreement.pdf — the same document shown in the homepage demo,
// so "Try it with this sample PDF" opens exactly what visitors just watched.
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { writeFileSync, mkdirSync } from "node:fs";

mkdirSync("public/samples", { recursive: true });
const doc = await PDFDocument.create();
doc.setTitle("Service Agreement");
const page = doc.addPage([595.28, 841.89]);
const f = await doc.embedFont(StandardFonts.Helvetica);
const b = await doc.embedFont(StandardFonts.HelveticaBold);
const ink = rgb(0.12, 0.13, 0.16), grey = rgb(0.45, 0.47, 0.52), rule = rgb(0.85, 0.86, 0.88);
const x = 60;
let y = 770;
page.drawText("Service Agreement", { x, y, size: 26, font: b, color: ink });
y -= 26;
page.drawText("Acme Studio Ltd · Northwind Traders · 5 October 2026", { x, y, size: 10, font: f, color: grey });
y -= 16;
page.drawLine({ start: { x, y }, end: { x: 535, y }, thickness: 0.8, color: rule });
y -= 26;
const lines = [
  "1. Scope: design and delivery of a complete brand identity.",
  "2. Payment terms: 60 days from the date of invoice.",
  "3. Fee: £12,400 payable in two equal instalments.",
  "4. Bank account: 4401-2290-1187 (Northwind Traders).",
  "5. Ownership of all final artwork transfers to the client on full payment.",
  "6. Either party may end this agreement with 30 days' written notice.",
];
for (const l of lines) { page.drawText(l, { x, y, size: 12, font: f, color: ink }); y -= 22; }
y -= 18;
page.drawRectangle({ x, y: y - 110, width: 475, height: 110, color: rgb(0.62, 0.79, 0.74) });
page.drawText("Moodboard — palette and imagery", { x: x + 12, y: y - 100, size: 9, font: f, color: rgb(1, 1, 1) });
y -= 170;
page.drawText("Signed for Northwind Traders", { x, y, size: 10, font: f, color: grey });
page.drawLine({ start: { x, y: y - 50 }, end: { x: x + 220, y: y - 50 }, thickness: 0.8, color: grey });
page.drawText("Date", { x: x + 280, y, size: 10, font: f, color: grey });
page.drawLine({ start: { x: x + 280, y: y - 50 }, end: { x: x + 420, y: y - 50 }, thickness: 0.8, color: grey });
writeFileSync("public/samples/agreement.pdf", await doc.save());
console.log("public/samples/agreement.pdf written");
