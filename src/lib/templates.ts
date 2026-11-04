"use client";

import { local } from "./storage/local";
import { uid } from "./utils";

/** Reusable documents, kept only in this browser's storage. */
export interface TemplateInfo { id: string; name: string; size: number; savedAt: number }

const INDEX = "templates";
const fileKey = (id: string) => `template:${id}`;

export const listTemplates = async () => (await local.get<TemplateInfo[]>(INDEX)) ?? [];

/** Returns the new template, or null if the browser wouldn't store it. */
export async function saveTemplate(name: string, bytes: Uint8Array): Promise<TemplateInfo | null> {
  const info: TemplateInfo = { id: uid("tpl"), name, size: bytes.length, savedAt: Date.now() };
  await local.set(fileKey(info.id), bytes);
  if (!(await local.get<Uint8Array>(fileKey(info.id)))) return null;
  await local.set(INDEX, [info, ...(await listTemplates())]);
  return info;
}

export const readTemplate = (id: string) => local.get<Uint8Array>(fileKey(id));

export async function deleteTemplate(id: string) {
  await local.del(fileKey(id));
  await local.set(INDEX, (await listTemplates()).filter((t) => t.id !== id));
}
