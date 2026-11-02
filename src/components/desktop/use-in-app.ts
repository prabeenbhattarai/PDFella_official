"use client";

import { useEffect, useState } from "react";

/**
 * True inside the desktop app (html[data-app="desktop"], set before paint by
 * appModeScript). The app-only sidebar and start screen render nothing until
 * then, so website pages don't carry a hidden copy of them: no second h1, no
 * duplicate tool links and lighter HTML.
 */
export function useInApp() {
  const [inApp, setInApp] = useState(false);
  useEffect(() => setInApp(document.documentElement.dataset.app === "desktop"), []);
  return inApp;
}
