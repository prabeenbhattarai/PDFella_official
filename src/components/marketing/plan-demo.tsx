"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Bookmark, Check, ClipboardPen, Crop, Crown, Download, FileArchive, FileSpreadsheet, FileText, Highlighter, MousePointer2, Plus,
  Signature, SquareSlash, Stamp, TextCursor, Type, X, type LucideIcon,
} from "lucide-react";
import { DOCUMENTS_PER_DAY, LITE_TABS } from "@/lib/plan-limits";
import { PRICES } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { ease, fade, follow, lerp, prog, usePrefersReducedMotion, type Pt } from "./live-demo";

/*
 * A scripted mock of the editor showing what each plan includes, drawn like the
 * home page's LiveDemo: a fixed stage scaled to its container, driven by a clock.
 */
type PlanId = "free" | "lite" | "pro";

const W = 640, H = 500;
const TAB_H = 28, TOP = 36, RAIL = 64;
const PAGE_W = 300, PAGE_H = 410;
const PAGE_X = RAIL + (W - RAIL - PAGE_W) / 2, PAGE_Y = TAB_H + TOP + 12;

const RAIL_TOOLS: { id: string; label: string; icon: LucideIcon; needs?: PlanId }[] = [
  { id: "edit", label: "Edit text", icon: TextCursor },
  { id: "markup", label: "Markup", icon: Highlighter },
  { id: "text", label: "Add text", icon: Type },
  { id: "sign", label: "Sign", icon: Signature, needs: "lite" },
  { id: "stamp", label: "Stamps", icon: Stamp, needs: "lite" },
  { id: "redact", label: "Redact", icon: SquareSlash, needs: "pro" },
  { id: "form", label: "Forms", icon: ClipboardPen, needs: "pro" },
];
const RANK: Record<PlanId, number> = { free: 0, lite: 1, pro: 2 };
const railPt = (id: string): Pt => [RAIL / 2, TAB_H + TOP + 12 + RAIL_TOOLS.findIndex((x) => x.id === id) * 50 + 20];
const TAB_ADD = (tabs: number): Pt => [10 + tabs * 96 + 12, TAB_H / 2];

// Where things sit on the page, so the cursor can reach them.
const WORD: Pt = [PAGE_X + 128, PAGE_Y + 96];
const HL_LINE = PAGE_Y + 116;
const ACCOUNT_Y = PAGE_Y + 146;
const SIG: Pt = [PAGE_X + 26, PAGE_Y + 318];
const STAMP: Pt = [PAGE_X + 196, PAGE_Y + 262];

interface Step { at: number; caption: string }
interface Item { label: string; at?: number; needs?: "Lite" | "Pro" }
const DEMO: Record<PlanId, { dur: number; docs: string; steps: Step[]; items: Item[] }> = {
  free: {
    dur: 11000,
    docs: `${DOCUMENTS_PER_DAY.free} a day`,
    steps: [
      { at: 0, caption: "Free: edit the text in your PDF" },
      { at: 3100, caption: "Free: highlight, draw and add images" },
      { at: 5400, caption: "Signatures are part of Lite, so Free shows you the upgrade" },
    ],
    items: [
      { label: "Edit text", at: 2700 },
      { label: "Highlight and draw", at: 4900 },
      { label: "Common fonts", at: 0 },
      { label: "Merge, split, compress", at: 0 },
      { label: "Signatures", needs: "Lite" },
      { label: "Stamps", needs: "Lite" },
      { label: "Redaction", needs: "Pro" },
    ],
  },
  lite: {
    dur: 12500,
    docs: `${DOCUMENTS_PER_DAY.lite} a day`,
    steps: [
      { at: 0, caption: "Lite: sign any document" },
      { at: 3000, caption: "Lite: add stamps, including your own" },
      { at: 4900, caption: "Lite: more than 50 extra fonts" },
      { at: 7000, caption: `Lite: up to ${LITE_TABS} documents open in tabs` },
      { at: 9200, caption: "Redaction is part of Pro, so Lite shows you the upgrade" },
    ],
    items: [
      { label: "Everything in Free", at: 0 },
      { label: "Signatures", at: 2700 },
      { label: "Stamps", at: 4300 },
      { label: "50+ extra fonts", at: 6200 },
      { label: `${LITE_TABS} tabs at once`, at: 8600 },
      { label: "Crop and bookmarks", at: 0 },
      { label: "Redaction", needs: "Pro" },
    ],
  },
  pro: {
    dur: 13500,
    docs: "Unlimited",
    steps: [
      { at: 0, caption: "Pro: redaction permanently removes content" },
      { at: 2900, caption: "Pro: build forms people can fill in" },
      { at: 5300, caption: "Pro: unlimited tabs and documents" },
      { at: 7500, caption: "Pro: fill a form from a spreadsheet, one PDF per row" },
    ],
    items: [
      { label: "Everything in Lite", at: 0 },
      { label: "Redaction", at: 2500 },
      { label: "Build forms", at: 4900 },
      { label: "Unlimited tabs", at: 7000 },
      { label: "Spreadsheet filling", at: 11000 },
      { label: "Templates", at: 11000 },
    ],
  },
};
const ORDER: PlanId[] = ["free", "lite", "pro"];
const NAMES: Record<PlanId, string> = { free: "Free", lite: "Lite", pro: "Pro" };
const SIG_PATH = "M6 30 C 14 6, 22 4, 24 18 S 22 36, 34 22 S 46 4, 52 16 S 54 34, 64 24 C 72 16, 78 10, 84 20 S 92 32, 104 18 C 112 10, 120 14, 126 22 L 144 12";

export function PlanDemo() {
  const [plan, setPlan] = useState<PlanId>("free");
  const [t, setT] = useState(0);
  const [scale, setScale] = useState(1);
  const [visible, setVisible] = useState(false);
  const reduce = usePrefersReducedMotion();
  const wrap = useRef<HTMLDivElement>(null);
  const clock = useRef(0);
  const demo = DEMO[plan];

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / W));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Only animate while on screen.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (reduce) { setT(demo.dur - 1); return; }
    if (!visible) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      clock.current += now - last;
      last = now;
      if (clock.current >= demo.dur) {
        clock.current = 0;
        setPlan((p) => ORDER[(ORDER.indexOf(p) + 1) % ORDER.length]);
      }
      setT(clock.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [visible, reduce, demo.dur]);

  const choose = (p: PlanId) => { clock.current = 0; setT(0); setPlan(p); };

  const { cursor, clicks, tool, tabs } = script(plan, t);
  const caption = [...demo.steps].reverse().find((s) => t >= s.at)?.caption ?? demo.steps[0].caption;

  const index = ORDER.indexOf(plan);

  return (
    <div data-testid="plan-demo" data-plan={plan} className="relative overflow-hidden rounded-[2rem] bg-[linear-gradient(150deg,#0f8a71_0%,#0b6b57_42%,#052f27_100%)] p-5 text-white shadow-[0_40px_90px_-40px_rgb(6_63_52/0.9)] sm:p-8 lg:p-10">
      <div className="pointer-events-none absolute -top-32 -left-24 size-96 rounded-full bg-white/10 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute inset-0 opacity-[0.05] [background-image:linear-gradient(white_1px,transparent_1px),linear-gradient(90deg,white_1px,transparent_1px)] [background-size:32px_32px]" aria-hidden />

      <div className="relative grid items-start gap-8 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-10">
        {/* The plan: real text, readable at every size. */}
        <div>
          <div className="relative flex rounded-full bg-black/25 p-1 ring-1 ring-white/10" role="tablist" aria-label="Plans">
            <span className="absolute top-1 bottom-1 left-1 w-[calc((100%-8px)/3)] rounded-full bg-white shadow-md transition-transform duration-500 ease-out" style={{ transform: `translateX(${index * 100}%)` }} aria-hidden />
            {ORDER.map((p) => (
              <button key={p} type="button" role="tab" aria-selected={plan === p} onClick={() => choose(p)}
                className={cn("relative z-10 h-9 flex-1 rounded-full text-[13.5px] font-semibold transition-colors duration-300", plan === p ? "text-[#0b6b57]" : "text-white/75 hover:text-white")}>
                {NAMES[p]}
              </button>
            ))}
          </div>

          <div key={plan} className="animate-fade-in">
            <p className="mt-7 flex items-baseline gap-2">
              <span className="font-display text-[52px] leading-none tracking-tight">{plan === "free" ? "$0" : `$${PRICES[plan].yearly}`}</span>
              <span className="text-[14px] text-white/70">{plan === "free" ? "forever" : "a month, billed yearly"}</span>
            </p>
            <ul className="mt-6 space-y-2.5">
              {demo.items.map((i) => {
                const on = i.at !== undefined && t >= i.at;
                return (
                  <li key={i.label} className={cn("flex items-center gap-2.5 text-[14.5px] transition-colors duration-500", i.needs ? "text-white/70" : on ? "text-white" : "text-white/70")}>
                    {i.needs ? <Crown className="mx-[1px] size-4 shrink-0 text-[#ffc83d]/80" strokeWidth={1.8} aria-hidden />
                      : <span className={cn("flex size-[18px] shrink-0 items-center justify-center rounded-full transition-all duration-500", on ? "scale-100 bg-white text-[#0b6b57]" : "scale-90 bg-white/15 text-transparent")}><Check className="size-3" strokeWidth={3} aria-hidden /></span>}
                    <span className="min-w-0 flex-1">{i.label}</span>
                    {i.needs && <span className="rounded-full border border-white/25 px-2 py-px text-[11px] font-medium text-white/75">{i.needs}</span>}
                  </li>
                );
              })}
            </ul>
            <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-white/15 ring-1 ring-white/15">
              <div className="bg-[#0a5a49]/70 px-4 py-3"><dt className="text-[12px] text-white/65">Documents</dt><dd className="mt-0.5 text-[15px] font-semibold">{demo.docs}</dd></div>
              <div className="bg-[#0a5a49]/70 px-4 py-3"><dt className="text-[12px] text-white/65">Tabs at once</dt><dd className="mt-0.5 text-[15px] font-semibold">{plan === "free" ? "1" : plan === "lite" ? LITE_TABS : "Unlimited"}</dd></div>
            </dl>
          </div>
        </div>

        {/* The stage. */}
        <div className="min-w-0">
          <div className="overflow-hidden rounded-2xl bg-surface shadow-[0_30px_70px_-25px_rgb(0_0_0/0.65)] ring-1 ring-black/10">
            <div className="flex h-8 items-center gap-1.5 border-b border-border bg-surface-2 px-3.5" aria-hidden>
              <span className="size-2.5 rounded-full bg-[#ff5f57]" /><span className="size-2.5 rounded-full bg-[#febc2e]" /><span className="size-2.5 rounded-full bg-[#28c840]" />
            </div>
            <div ref={wrap} className="overflow-hidden" style={{ height: H * scale }} aria-hidden>
              <div className="relative origin-top-left select-none" style={{ width: W, height: H, transform: `scale(${scale})` }}>
                <TabStrip plan={plan} tabs={tabs} />
                <TopBar plan={plan} />
                <Rail plan={plan} tool={tool} />
                <div className="absolute bg-workspace" style={{ left: RAIL, top: TAB_H + TOP, right: 0, bottom: 0 }} />
                <Page plan={plan} t={t} />
                {plan === "lite" && <FontList t={t} />}
                {plan === "pro" && <SpreadsheetFill t={t} />}
                {plan === "free" && <Premium t={t} from={6000} to={9700} title="Sign documents with Lite" body="Draw, type or upload your signature and place it anywhere." price={PRICES.lite.yearly} />}
                {plan === "lite" && <Premium t={t} from={9900} to={12100} title="Redact with Pro" body="Permanently remove sensitive text and areas, not just cover them." price={PRICES.pro.yearly} />}
                <Cursor at={cursor} clicks={clicks} t={t} />
              </div>
            </div>
          </div>
          {/* The stage is decorative, so the same words are readable here at every size. */}
          <div className="mt-4 flex items-center gap-3">
            <p className="min-h-[1.5em] flex-1 text-[14.5px] font-medium text-white/90" data-testid="plan-demo-caption">{caption}</p>
          </div>
          <div className="mt-2 h-0.5 overflow-hidden rounded-full bg-white/15" aria-hidden>
            <div className="h-full origin-left bg-white/80" style={{ transform: `scaleX(${reduce ? 1 : prog(t, 0, demo.dur)})` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Where the cursor goes, what it clicks, and what's open, at time t. */
function script(plan: PlanId, t: number): { cursor: Pt; clicks: number[]; tool: string; tabs: number } {
  if (plan === "free") {
    return {
      cursor: follow(t, [[0, railPt("edit")], [800, WORD], [2600, WORD], [3100, railPt("markup")], [3500, [PAGE_X + 26, HL_LINE]], [4600, [PAGE_X + 238, HL_LINE]], [5300, railPt("sign")], [9800, railPt("sign")], [10600, [PAGE_X + 150, PAGE_Y + 220]]]),
      clicks: [850, 1020, 3150, 5650],
      tool: t >= 3150 ? "markup" : t >= 850 ? "edit" : "",
      tabs: 1,
    };
  }
  if (plan === "lite") {
    return {
      cursor: follow(t, [[0, railPt("sign")], [600, SIG], [900, SIG], [2700, [SIG[0] + 144, SIG[1] + 12]], [3100, railPt("stamp")], [3600, STAMP], [4300, STAMP], [5100, [W - 70, TAB_H + TOP + 150]], [6200, [W - 70, TAB_H + TOP + 150]], [7000, TAB_ADD(1)], [7500, TAB_ADD(1)], [8100, TAB_ADD(2)], [8700, TAB_ADD(2)], [9300, railPt("redact")], [12100, railPt("redact")]]),
      clicks: [100, 3200, 3750, 5900, 7400, 8050, 9500],
      tool: t >= 9500 ? "redact" : t >= 3200 ? "stamp" : "sign",
      tabs: t >= 8050 ? 3 : t >= 7400 ? 2 : 1,
    };
  }
  const addAt = [5500, 5900, 6300, 6700];
  const added = addAt.filter((a) => t >= a).length;
  return {
    cursor: follow(t, [[0, railPt("redact")], [500, [PAGE_X + 108, ACCOUNT_Y - 6]], [700, [PAGE_X + 108, ACCOUNT_Y - 6]], [2300, [PAGE_X + 186, ACCOUNT_Y + 6]], [3000, railPt("form")], [3500, [PAGE_X + 130, PAGE_Y + 222]], [4900, [PAGE_X + 130, PAGE_Y + 272]], [5400, TAB_ADD(1)], [5500, TAB_ADD(1)], [6700, TAB_ADD(4)], [7500, [PAGE_X + 270, PAGE_Y + 385]]]),
    clicks: [100, 3100, 3700, 4400, ...addAt],
    tool: t >= 3100 ? "form" : "redact",
    tabs: 1 + added,
  };
}

function TabStrip({ plan, tabs }: { plan: PlanId; tabs: number }) {
  const names = ["contract.pdf", "invoice.pdf", "report.pdf", "form.pdf", "notes.pdf"];
  return (
    <div className="absolute inset-x-0 top-0 flex items-end gap-1 border-b border-border bg-surface-2 px-2.5" style={{ height: TAB_H }}>
      {names.slice(0, tabs).map((n, i) => (
        <div key={n} className={cn("flex h-[23px] w-[92px] items-center gap-1 rounded-t-md px-2 text-[10px] animate-fade-in", i === 0 ? "border border-b-0 border-border bg-surface text-ink" : "text-ink-3")}>
          <FileText className="size-2.5 shrink-0" />
          <span className="truncate">{n}</span>
        </div>
      ))}
      <span className="relative mb-1 flex size-5 items-center justify-center text-ink-3">
        <Plus className="size-3" />
        {plan === "free" && <Marker className="-top-0.5 -right-1" />}
      </span>
    </div>
  );
}

function TopBar({ plan }: { plan: PlanId }) {
  return (
    <div className="absolute inset-x-0 flex items-center gap-2 border-b border-border bg-surface px-3" style={{ top: TAB_H, height: TOP }}>
      <span className="text-[11px] font-medium text-ink">contract.pdf</span>
      <span className="ml-auto flex items-center gap-2.5 text-ink-3">
        <span className="relative"><Crop className="size-3.5" />{plan === "free" && <Marker className="-top-1.5 -right-1" />}</span>
        <span className="relative"><Bookmark className="size-3.5" />{plan === "free" && <Marker className="-top-1.5 -right-1" />}</span>
      </span>
      <span className="flex h-6 items-center gap-1 rounded-md border border-border px-2 text-[10px] font-medium text-ink-2"><Download className="size-3" /> Download</span>
      <span className="flex h-6 items-center rounded-md bg-accent px-2.5 text-[10px] font-semibold text-accent-ink">Save</span>
    </div>
  );
}

function Rail({ plan, tool }: { plan: PlanId; tool: string }) {
  return (
    <div className="absolute left-0 flex flex-col items-center gap-0.5 border-r border-border bg-surface pt-3" style={{ top: TAB_H + TOP, bottom: 0, width: RAIL }}>
      {RAIL_TOOLS.map(({ id, label, icon: Icon, needs }) => (
        <div key={id} className={cn("relative flex h-[48px] w-[54px] flex-col items-center justify-center gap-0.5 rounded-lg", tool === id ? "bg-accent-soft text-accent" : "text-ink-2")}>
          <Icon className="size-4" strokeWidth={1.8} />
          <span className="text-[8.5px] font-medium">{label}</span>
          {needs && RANK[plan] < RANK[needs] && <Marker className="top-1 right-2.5" />}
        </div>
      ))}
    </div>
  );
}

function Page({ plan, t }: { plan: PlanId; t: number }) {
  const free = plan === "free", lite = plan === "lite", pro = plan === "pro";
  const word = free ? (t < 1300 ? "60" : t < 1600 ? "" : t < 1950 ? "3" : "30") : "30";
  const selecting = free && t >= 1050 && t < 1300;
  const editing = free && t >= 1050 && t < 2700;
  const hl = free ? ease(prog(t, 3550, 1050)) : 0;
  const sigP = lite ? prog(t, 900, 1800) : 0;
  const stampP = lite ? fade(t, 3750, 280) : 0;
  const fontChanged = lite && t >= 5900;
  const redact = pro ? ease(prog(t, 700, 1600)) : 0;
  const fieldAt = [3700, 4400];
  return (
    <div className="absolute overflow-hidden rounded-sm bg-white shadow-[0_6px_24px_-8px_rgb(0_0_0/0.3)]" style={{ left: PAGE_X, top: PAGE_Y, width: PAGE_W, height: PAGE_H }}>
      <div className="absolute inset-x-[26px] top-[26px] text-[#15171c]">
        <p className={cn("text-[17px] font-bold tracking-tight transition-all duration-300", fontChanged && "font-serif italic")}>Service Agreement</p>
        <p className="mt-1 text-[9px] text-neutral-500">Between Acme Corporation and the Client</p>
        <div className="mt-5 space-y-[8px] text-[10px] leading-[16px]">
          <p>Payment due within{" "}
            <span className={cn("relative inline-block min-w-[12px] rounded-[2px] text-center", selecting && "bg-[#b6d7ff]", editing && "outline-1 outline-accent outline-solid")}>{word}{editing && !selecting && <span className="ml-px inline-block h-[11px] w-px translate-y-[2px] bg-accent" />}</span>{" "}
            days of the invoice.</p>
          <p className="relative w-fit">
            <span className="absolute inset-y-0 left-0 rounded-[1px] bg-[#ffe14d]/80" style={{ width: `${hl * 100}%` }} />
            <span className="relative">Late payments are charged 2% each month.</span>
          </p>
          <p>Account number{" "}
            <span className="relative inline-block">4401-2290-1187
              <span className="absolute inset-y-0 left-0 bg-black" style={{ width: `${redact * 100}%` }} />
            </span>
          </p>
          <p>The parties agree to the terms set out here.</p>
        </div>
      </div>

      {pro && [["Full name", 0], ["Email address", 1]].map(([label, i]) => (
        <div key={label as string} className="absolute" style={{ left: 26, top: 192 + (i as number) * 48, width: 210, opacity: fade(t, fieldAt[i as number], 260) }}>
          <p className="mb-0.5 text-[8.5px] font-medium text-neutral-500">{label}</p>
          <div className="h-[22px] rounded-[3px] border border-[#8c94a3] bg-[#f2f7ff]" />
        </div>
      ))}

      <div className="absolute inset-x-[26px] top-[305px] text-[8.5px] text-neutral-500">Signed by</div>
      <svg className="absolute" style={{ left: 26, top: 318 }} width="150" height="40" viewBox="0 0 150 40" fill="none">
        <path d={SIG_PATH} stroke="#123a8a" strokeWidth="1.7" strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - sigP} opacity={sigP > 0 ? 1 : 0} />
      </svg>
      <div className="absolute inset-x-[26px] top-[358px] h-px bg-neutral-300" />

      {stampP > 0 && (
        <div className="absolute rounded-[4px] border-2 border-[#2e9e5b] px-2 py-0.5 text-[12px] font-bold tracking-wider text-[#2e9e5b]" style={{ left: 164, top: 248, opacity: stampP, transform: `rotate(-8deg) scale(${lerp(1.5, 1, stampP)})` }}>APPROVED</div>
      )}
    </div>
  );
}

/** Lite: picking a font from the wider list. */
function FontList({ t }: { t: number }) {
  const shown = fade(t, 5000, 220) * (1 - fade(t, 6700, 220));
  if (shown <= 0) return null;
  const fonts = [["Helvetica", "sans-serif"], ["Playfair Display", "serif"], ["Merriweather", "serif"], ["Dancing Script", "cursive"], ["Roboto Mono", "monospace"]];
  return (
    <div className="absolute w-[150px] rounded-xl border border-border bg-surface p-1.5 shadow-lg" style={{ right: 14, top: TAB_H + TOP + 92, opacity: shown }}>
      <p className="px-1.5 py-1 text-[9px] font-semibold text-ink-3">50+ MORE FONTS</p>
      {fonts.map(([f, family], i) => (
        <div key={f} className={cn("rounded-md px-1.5 py-1 text-[11px] text-ink", i === 1 && t >= 5900 && "bg-accent-soft text-accent")} style={{ fontFamily: family }}>{f}</div>
      ))}
    </div>
  );
}

/** Pro: one form and a spreadsheet become a ZIP of filled PDFs. */
function SpreadsheetFill({ t }: { t: number }) {
  const shown = fade(t, 7600, 300);
  if (shown <= 0) return null;
  const rows = ["Asha Rai", "Ben Cole", "Chen Li", "Dana Fox"];
  const made = Math.floor(lerp(0, 250, ease(prog(t, 8800, 2300))));
  return (
    <div className="absolute inset-y-0 flex items-center justify-center gap-3 bg-black/25" style={{ left: RAIL, right: 0, top: TAB_H + TOP, opacity: shown }}>
      <div className="w-[150px] rounded-xl border border-border bg-surface p-2.5 shadow-xl">
        <p className="flex items-center gap-1.5 text-[10px] font-semibold text-ink"><FileSpreadsheet className="size-3.5 text-[#2e9e5b]" /> people.xlsx</p>
        <div className="mt-2 divide-y divide-border rounded-md border border-border text-[9.5px] text-ink-2">
          {rows.map((r, i) => (
            <div key={r} className={cn("px-1.5 py-1 transition-colors", t >= 8800 + i * 350 && "bg-accent-soft text-accent")}>{r}</div>
          ))}
        </div>
      </div>
      <div className="w-[120px] rounded-xl border border-border bg-surface p-2.5 text-center shadow-xl">
        <FileArchive className="mx-auto size-6 text-accent" />
        <p className="mt-1 text-[20px] font-semibold tabular-nums text-ink">{made}</p>
        <p className="text-[9.5px] text-ink-3">filled PDFs</p>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-3"><div className="h-full bg-accent" style={{ width: `${(made / 250) * 100}%` }} /></div>
      </div>
    </div>
  );
}

/** The same Premium dialog people see in the real editor. */
function Premium({ t, from, to, title, body, price }: { t: number; from: number; to: number; title: string; body: string; price: number }) {
  const shown = fade(t, from, 240) * (1 - fade(t, to, 240));
  if (shown <= 0) return null;
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/30" style={{ opacity: shown }}>
      <div className="w-[320px] rounded-2xl bg-surface p-5 shadow-2xl" style={{ transform: `scale(${lerp(0.95, 1, shown)})` }}>
        <div className="flex items-start justify-between gap-2">
          <p className="text-[15px] font-semibold text-ink">{title}</p>
          <X className="size-3.5 shrink-0 text-ink-3" />
        </div>
        <p className="mt-1 text-[11px] leading-snug text-ink-2">{body}</p>
        <p className="mt-2.5 inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold text-accent"><Crown className="size-3" /> Premium feature</p>
        <p className="mt-2.5 text-[11px] text-ink-2"><span className="font-semibold text-ink">From ${price} a month</span>, billed yearly.</p>
        <div className="mt-3 flex gap-2">
          <span className="flex h-8 flex-1 items-center justify-center rounded-lg bg-accent text-[11px] font-semibold text-white">See plans</span>
          <span className="flex h-8 items-center px-3 text-[11px] font-medium text-ink-2">Not now</span>
        </div>
      </div>
    </div>
  );
}

function Marker({ className }: { className: string }) {
  return <Crown className={cn("absolute size-2.5 text-[#d9a514]", className)} strokeWidth={2.4} />;
}

function Cursor({ at, clicks, t }: { at: Pt; clicks: number[]; t: number }) {
  const ripple = clicks.find((c) => t >= c && t < c + 380);
  return (
    <div className="pointer-events-none absolute z-20" style={{ left: at[0], top: at[1] }}>
      {ripple !== undefined && <span className="absolute -top-3 -left-3 size-6 rounded-full border-2 border-accent" style={{ opacity: 1 - prog(t, ripple, 380), transform: `scale(${lerp(0.4, 1.3, prog(t, ripple, 380))})` }} />}
      <MousePointer2 className="size-[18px] fill-ink text-white drop-shadow" strokeWidth={1.5} />
    </div>
  );
}
