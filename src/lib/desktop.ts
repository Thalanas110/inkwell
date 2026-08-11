import { idbDel, idbGet, idbSet } from "./idb";

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

/** Persisted PDF bytes: Electron app-data folder, or IndexedDB in the browser. */
export async function saveFileBytes(key: string, bytes: Uint8Array) {
  const d = desktop();
  if (d) await d.writeFile(key, bytes);
  else await idbSet(`file:${key}`, bytes);
}

export async function readFileBytes(key: string): Promise<Uint8Array | null> {
  const d = desktop();
  if (d) return d.readFile(key);
  const v = await idbGet<Uint8Array | ArrayBuffer>(`file:${key}`);
  if (!v) return null;
  return v instanceof Uint8Array ? v : new Uint8Array(v);
}

export async function deleteFileBytes(key: string) {
  const d = desktop();
  if (d) await d.deleteFile(key);
  else await idbDel(`file:${key}`);
}

export async function exportBytes(name: string, bytes: Uint8Array) {
  const d = desktop();
  if (d) return d.exportFile(name, bytes);
  const blob = new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return name;
}
