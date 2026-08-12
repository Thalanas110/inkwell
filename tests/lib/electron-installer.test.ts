import { describe, expect, it } from "vitest";

import {
  isRetryablePackagingFailure,
  getBuilderSpawnOptions,
  runBuilderWithRetries,
} from "../../scripts/electron-installer.mjs";
import { moveStagingDirectory } from "../../scripts/electron-builder-rename-workaround.cjs";

describe("electron installer retry handling", () => {
  it("retries a Windows staging rename failure before returning success", async () => {
    const attempts: number[] = [];

    const exitCode = await runBuilderWithRetries({
      platform: "win32",
      retryDelayMs: 0,
      spawnBuilder: () => {
        attempts.push(attempts.length + 1);
        return Promise.resolve(
          attempts.length === 1
            ? {
                code: 1,
                output:
                  "EPERM: operation not permitted, rename 'win-unpacked.tmp' -> 'win-unpacked'",
              }
            : { code: 0, output: "" },
        );
      },
    });

    expect(exitCode).toBe(0);
    expect(attempts).toEqual([1, 2]);
  });

  it("does not retry unrelated builder failures", () => {
    expect(
      isRetryablePackagingFailure(
        'Error: Application entry file "electron/main.cjs" does not exist',
      ),
    ).toBe(false);
  });

  it("uses the Windows shell when launching electron-builder.cmd", () => {
    const options = getBuilderSpawnOptions("win32");

    expect(options.shell).toBe(true);
    expect(options.env.NODE_OPTIONS).toContain(
      "--require=./scripts/electron-builder-rename-workaround.cjs",
    );
  });

  it("falls back to copying when Windows refuses the staging rename", async () => {
    const calls: string[] = [];

    await moveStagingDirectory("win-unpacked.tmp", "win-unpacked", {
      rename: async () => {
        calls.push("rename");
        const error = new Error("locked");
        error.code = "EPERM";
        throw error;
      },
      copy: async () => calls.push("copy"),
      remove: async () => calls.push("remove"),
      delay: async () => undefined,
      attempts: 1,
    });

    expect(calls).toEqual(["rename", "copy", "remove"]);
  });
});
