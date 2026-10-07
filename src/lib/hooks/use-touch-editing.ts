"use client";

import { useSyncExternalStore } from "react";

/** Phones and tablets (no hover, coarse pointer) or narrow screens: edit text in a sheet above the keyboard. */
const QUERY = "(hover: none) and (pointer: coarse), (max-width: 767px)";

const subscribe = (cb: () => void) => {
  const m = window.matchMedia(QUERY);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};

export function useTouchEditing(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => false);
}
