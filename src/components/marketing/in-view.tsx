"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Adds `in-view` once the element scrolls into view (starts scroll-triggered CSS animations). */
export function InView({ children, className, as: Tag = "div", threshold = 0.25 }: { children: ReactNode; className?: string; as?: "div" | "section" | "ol" | "ul"; threshold?: number }) {
  const ref = useRef<HTMLElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }, { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  const Comp = Tag as "div";
  return <Comp ref={ref as React.RefObject<HTMLDivElement>} className={cn(className, seen && "in-view")}>{children}</Comp>;
}
