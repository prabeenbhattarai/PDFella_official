// Inputs for the guide screenshots: a long PDF (so progress is visible), a damaged PDF, and images.
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";
mkdirSync("tests/fixtures/guide", { recursive: true });

const sample = readFileSync("public/samples/agreement.pdf");
const src = await PDFDocument.load(sample);
const long = await PDFDocument.create();
const f = await long.embedFont(StandardFonts.Helvetica);
for (let i = 0; i < 40; i++) {
  const [p] = await long.copyPages(src, [0]);
  long.addPage(p).drawText(`Appendix page ${i + 1}`, { x: 60, y: 40, size: 9, font: f, color: rgb(0.4, 0.4, 0.45) });
}
writeFileSync("tests/fixtures/guide/long.pdf", await long.save());

const txt = new TextDecoder("latin1").decode(sample);
writeFileSync("tests/fixtures/guide/damaged.pdf", sample.slice(0, txt.lastIndexOf("xref")));

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1200, height: 800 } });
const shot = async (html, file, type = "png", w = 1200, h = 800) => {
  await p.setViewportSize({ width: w, height: h });
  await p.setContent(`<body style="margin:0">${html}</body>`);
  await p.screenshot({ path: file, type, ...(type === "jpeg" ? { quality: 90 } : {}) });
};
await shot(`<div style="width:1200px;height:800px;background:linear-gradient(135deg,#cfe7df,#5d8f86);display:flex;align-items:flex-end;padding:60px;box-sizing:border-box;font:700 64px Georgia;color:#fff">Moodboard · Brand palette</div>`, "tests/fixtures/guide/photo-1.jpg", "jpeg");
await shot(`<div style="width:1200px;height:800px;background:linear-gradient(135deg,#f6dcc8,#e8590c);display:flex;align-items:flex-end;padding:60px;box-sizing:border-box;font:700 64px Georgia;color:#fff">Receipt · Studio supplies</div>`, "tests/fixtures/guide/photo-2.jpg", "jpeg");
await shot(`<div style="width:600px;height:400px;background:#fff;display:flex;align-items:center;justify-content:center;font:700 54px Helvetica;color:#15171c">Dashboard screenshot</div>`, "tests/fixtures/guide/screenshot.png", "png", 600, 400);
await p.setViewportSize({ width: 400, height: 160 });
await p.setContent(`<body style="margin:0;background:transparent"><div style="width:400px;height:160px;display:flex;align-items:center;gap:18px;font:800 46px Helvetica;color:#0c7a64"><div style="width:120px;height:120px;border-radius:30px;background:#0c7a64"></div>Northwind</div></body>`);
await p.screenshot({ path: "tests/fixtures/guide/logo.png", omitBackground: true });
await b.close();
console.log("guide fixtures written");

// Photo-heavy PDF (losslessly embedded large images) so Compress shows a realistic saving.
{
  const { PDFDocument } = await import("pdf-lib");
  const b2 = await chromium.launch();
  const pg = await b2.newPage({ viewport: { width: 2000, height: 1300 } });
  const doc = await PDFDocument.create();
  for (const hue of [160, 25, 260]) {
    await pg.setContent(`<body style="margin:0"><canvas id=c width=2000 height=1300></canvas><script>
      const g=c.getContext('2d');const d=g.createImageData(2000,1300);
      for(let i=0;i<d.data.length;i+=4){const x=(i/4)%2000,y=Math.floor(i/4/2000);const n=Math.random()*40;
        d.data[i]=Math.min(255,${hue}+x/12+n);d.data[i+1]=Math.min(255,120+y/10+n);d.data[i+2]=Math.min(255,90+(x+y)/20+n);d.data[i+3]=255;}
      g.putImageData(d,0,0);</script></body>`);
    const png = await pg.locator("#c").screenshot({ type: "png" });
    const img = await doc.embedPng(png);
    const page = doc.addPage([842, 595]);
    page.drawImage(img, { x: 0, y: 0, width: 842, height: 595 });
  }
  writeFileSync("tests/fixtures/guide/photos.pdf", await doc.save());
  await b2.close();
  console.log("photos.pdf written");
}
