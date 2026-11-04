"use client";

import { create } from "zustand";
import { uid } from "../utils";
import { useEditor } from "./store";
import { useSearch } from "./search";
import { disposeSources } from "../pdf/docCache";

/**
 * Document tabs. The editor store holds the open tab's document; the other tabs
 * keep a snapshot of their document fields and are swapped back in on switch.
 * Tool style, clipboard, signatures and image assets stay shared, so copy/paste works across tabs.
 */
const DOC_KEYS = [
  "status", "error", "docName", "docKey", "bookmarks", "sources", "pages", "objects", "formValues", "past", "future", "dirty",
  "tool", "selection", "editingId", "editSelection", "selectedPages", "currentPage", "zoom", "fit", "pendingAsset", "redactPreview", "stylePrompt",
] as const;

type EditorState = ReturnType<typeof useEditor.getState>;
export type TabSnapshot = Pick<EditorState, (typeof DOC_KEYS)[number]>;

export interface Tab { id: string; snapshot: TabSnapshot | null; scroll?: number }

interface TabsState {
  tabs: Tab[];
  active: string;
}

const firstId = uid("t");
export const useTabs = create<TabsState>()(() => ({ tabs: [{ id: firstId, snapshot: null }], active: firstId }));

function capture(): TabSnapshot {
  const s = useEditor.getState();
  return Object.fromEntries(DOC_KEYS.map((k) => [k, s[k]])) as TabSnapshot;
}

/** Park the open document in its tab and show another one (null = a fresh, empty tab). */
function show(id: string, snapshot: TabSnapshot | null) {
  const { tabs, active } = useTabs.getState();
  const scroll = document.getElementById("document-scroller")?.scrollTop ?? 0;
  const parked = tabs.map((t) => (t.id === active ? { ...t, snapshot: capture(), scroll } : t));
  useSearch.getState().clear();
  useSearch.getState().setOpen(false);
  if (snapshot) useEditor.setState(snapshot);
  else useEditor.getState().reset();
  useTabs.setState({ tabs: parked.map((t) => (t.id === id ? { ...t, snapshot: null } : t)), active: id });
  restoreScroll(parked.find((t) => t.id === id)?.scroll);
}

/** The canvas remounts for the new tab; put it back where the reader left it. */
function restoreScroll(top: number | undefined) {
  if (!top) return;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const el = document.getElementById("document-scroller");
    if (el) el.scrollTop = top;
  }));
}

export function newTab() {
  const id = uid("t");
  useTabs.setState((s) => ({ tabs: [...s.tabs, { id, snapshot: null }] }));
  show(id, null);
  return id;
}

export function switchTab(id: string) {
  const { tabs, active } = useTabs.getState();
  const tab = tabs.find((t) => t.id === id);
  if (!tab || id === active || useEditor.getState().status === "loading") return;
  show(id, tab.snapshot);
}

/** True when any tab, open or parked, has unsaved changes. */
export function anyTabDirty() {
  const { tabs, active } = useTabs.getState();
  return tabs.some((t) => (t.id === active ? useEditor.getState().dirty : t.snapshot?.dirty));
}

export function closeTab(id: string) {
  const { tabs, active } = useTabs.getState();
  const index = tabs.findIndex((t) => t.id === id);
  if (index < 0) return;
  const doc = id === active ? capture() : tabs[index].snapshot;
  if (doc?.dirty && !confirm(`Close “${doc.docName}”? Its unsaved changes will be lost.`)) return;
  if (doc) {
    const keep = new Set(tabs.filter((t) => t.id !== id && t.id !== active).flatMap((t) => Object.keys(t.snapshot?.sources ?? {})));
    if (id !== active) Object.keys(useEditor.getState().sources).forEach((k) => keep.add(k));
    void disposeSources(Object.keys(doc.sources).filter((k) => !keep.has(k)));
  }

  if (tabs.length === 1) {
    useEditor.getState().reset();
    return;
  }
  const rest = tabs.filter((t) => t.id !== id);
  if (id !== active) {
    useTabs.setState({ tabs: rest });
    return;
  }
  const next = rest[Math.min(index, rest.length - 1)];
  useSearch.getState().clear();
  useSearch.getState().setOpen(false);
  if (next.snapshot) useEditor.setState(next.snapshot);
  else useEditor.getState().reset();
  useTabs.setState({ tabs: rest.map((t) => (t.id === next.id ? { ...t, snapshot: null } : t)), active: next.id });
  restoreScroll(next.scroll);
}

/** Ids of the PDF sources in tabs other than the open one (kept alive when it changes document). */
export function otherTabSources(): Set<string> {
  const { tabs, active } = useTabs.getState();
  return new Set(tabs.filter((t) => t.id !== active).flatMap((t) => Object.keys(t.snapshot?.sources ?? {})));
}
