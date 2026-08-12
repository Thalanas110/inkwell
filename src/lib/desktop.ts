import { idbDel, idbGet, idbSet } from "./idb";
import {
  deleteCapacitorFile,
  exportCapacitorPdf,
  readCapacitorFile,
  saveCapacitorFile,
} from "./capacitor-files";
import { getRuntimeKind } from "./runtime";

export type DesktopBridge = {
  platform: string;
  readDb(): Promise<Uint8Array | null>;
  writeDb(bytes: Uint8Array): Promise<boolean>;
  writeFile(key: string, bytes: Uint8Array): Promise<boolean>;
  readFile(key: string): Promise<Uint8Array | null>;
  deleteFile(key: string): Promise<boolean>;
  exportFile(name: string, bytes: Uint8Array): Promise<string | null>;
};

export function desktop(): DesktopBridge | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { inkwellDesktop?: DesktopBridge }).inkwellDesktop;
}

export const isDesktop = () => Boolean(desktop());

export function runtimeLabel() {
  switch (getRuntimeKind()) {
    case "electron":
      return "Desktop · offline";
    case "android":
      return "Android · offline";
    default:
      return "Browser preview · offline";
  }
}

/** Persisted PDF bytes: Electron app-data folder, or IndexedDB in the browser. */
export async function saveFileBytes(key: string, bytes: Uint8Array) {
  const d = desktop();
  if (d) await d.writeFile(key, bytes);
  else if (getRuntimeKind() === "android") await saveCapacitorFile(key, bytes);
  else await idbSet(`file:${key}`, bytes);
}

export async function readFileBytes(key: string): Promise<Uint8Array | null> {
  const d = desktop();
  if (d) return d.readFile(key);
  if (getRuntimeKind() === "android") return readCapacitorFile(key);
  const v = await idbGet<Uint8Array | ArrayBuffer>(`file:${key}`);
  if (!v) return null;
  return v instanceof Uint8Array ? v : new Uint8Array(v);
}

export async function deleteFileBytes(key: string) {
  const d = desktop();
  if (d) await d.deleteFile(key);
  else if (getRuntimeKind() === "android") await deleteCapacitorFile(key);
  else await idbDel(`file:${key}`);
}

export async function exportBytes(name: string, bytes: Uint8Array) {
  const d = desktop();
  if (d) return d.exportFile(name, bytes);
  if (getRuntimeKind() === "android") return exportCapacitorPdf(name, bytes);
  const blob = new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return name;
}
