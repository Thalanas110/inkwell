import { afterEach, describe, expect, it } from "vitest";
import { getRuntimeKind } from "../../src/lib/runtime";

afterEach(() => {
  delete (window as unknown as { inkwellDesktop?: unknown }).inkwellDesktop;
  delete (window as unknown as { Capacitor?: unknown }).Capacitor;
});

describe("getRuntimeKind", () => {
  it("returns electron when the Electron bridge is available", () => {
    (window as unknown as { inkwellDesktop: { platform: string } }).inkwellDesktop = {
      platform: "win32",
    };

    expect(getRuntimeKind()).toBe("electron");
  });

  it("returns android when Capacitor reports a native Android platform", () => {
    (
      window as unknown as {
        Capacitor: { isNativePlatform: () => boolean; getPlatform: () => string };
      }
    ).Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => "android",
    };

    expect(getRuntimeKind()).toBe("android");
  });

  it("returns browser when neither native runtime is available", () => {
    expect(getRuntimeKind()).toBe("browser");
  });
});
