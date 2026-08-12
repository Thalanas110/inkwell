import { Directory, Filesystem } from "@capacitor/filesystem";

export function sanitizePdfFilename(name: string): string {
  const safe = name.trim().replace(/[\\/:*?"<>|]/g, "_");
  if (!safe) return "inkwell-document.pdf";
  return /\.pdf$/i.test(safe) ? safe : `${safe}.pdf`;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function safeStorageKey(key: string) {
  return key.replace(/[\\/]/g, "_");
}

export async function saveCapacitorFile(key: string, bytes: Uint8Array): Promise<void> {
  await Filesystem.writeFile({
    path: safeStorageKey(key),
    data: bytesToBase64(bytes),
    directory: Directory.Data,
    recursive: true,
  });
}

export async function readCapacitorFile(key: string): Promise<Uint8Array | null> {
  try {
    const result = await Filesystem.readFile({
      path: safeStorageKey(key),
      directory: Directory.Data,
    });
    return typeof result.data === "string" ? base64ToBytes(result.data) : null;
  } catch (error) {
    if (isMissingFileError(error)) return null;
    throw error;
  }
}

export async function deleteCapacitorFile(key: string): Promise<void> {
  try {
    await Filesystem.deleteFile({
      path: safeStorageKey(key),
      directory: Directory.Data,
    });
  } catch (error) {
    if (!isMissingFileError(error)) throw error;
  }
}

export async function exportCapacitorPdf(name: string, bytes: Uint8Array): Promise<string> {
  const permissions = await Filesystem.checkPermissions();
  if (permissions.publicStorage === "prompt") await Filesystem.requestPermissions();

  const filename = sanitizePdfFilename(name);
  await Filesystem.writeFile({
    path: filename,
    data: bytesToBase64(bytes),
    directory: Directory.Documents,
    recursive: true,
  });
  return filename;
}

function isMissingFileError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: string; message?: string };
  return (
    candidate.code === "FileNotFound" || /not found|does not exist/i.test(candidate.message ?? "")
  );
}
