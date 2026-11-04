"use client";

/**
 * Files handed to the desktop app (double-clicked, or dropped on the window), on
 * their way to the editor. Each one opens in its own tab, and any that arrive
 * before the editor is on screen wait here.
 */
export interface IncomingFile { name: string; type: string; bytes: Uint8Array }

let queue: IncomingFile[] = [];
let consumer: ((files: IncomingFile[]) => void) | null = null;

function drain() {
  if (!consumer || !queue.length) return;
  const files = queue;
  queue = [];
  consumer(files);
}

/** Returns true if the editor is open to receive them. */
export function receiveFiles(files: IncomingFile[]): boolean {
  queue.push(...files);
  drain();
  return !!consumer;
}

export function setFileConsumer(fn: (files: IncomingFile[]) => void) {
  consumer = fn;
  drain();
  return () => { if (consumer === fn) consumer = null; };
}
