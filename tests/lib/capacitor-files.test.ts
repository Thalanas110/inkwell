import { describe, expect, it } from "vitest";
import { base64ToBytes, bytesToBase64, sanitizePdfFilename } from "../../src/lib/capacitor-files";

describe("Capacitor file helpers", () => {
  it("sanitizes exported PDF filenames", () => {
    expect(sanitizePdfFilename("signed contract")).toBe("signed contract.pdf");
    expect(sanitizePdfFilename("../secret\\contract.PDF")).toBe(".._secret_contract.PDF");
    expect(sanitizePdfFilename("   ")).toBe("inkwell-document.pdf");
  });

  it("round-trips binary bytes through base64", () => {
    const bytes = new Uint8Array([0, 1, 2, 255]);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });
});
