import { describe, expect, it } from "vitest";

import { startElectronApp } from "../../electron/startup.cjs";

describe("Electron startup", () => {
  it("waits for Electron ready before migrating data or creating a window", async () => {
    let resolveReady!: () => void;
    const ready = new Promise<void>((resolve) => {
      resolveReady = resolve;
    });
    const events: string[] = [];

    const startup = startElectronApp({
      whenReady: () => ready,
      migrateLegacyData: () => events.push("migrate"),
      createWindow: () => events.push("window"),
    });

    expect(events).toEqual([]);
    resolveReady();
    await startup;

    expect(events).toEqual(["migrate", "window"]);
  });
});
