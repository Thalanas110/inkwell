import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const DEFAULT_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 1500;

export function isRetryablePackagingFailure(output) {
  return (
    /\b(?:EPERM|EBUSY)\b/i.test(output) &&
    /rename[\s\S]*win-unpacked\.tmp[\s\S]*win-unpacked/i.test(output)
  );
}

export function getBuilderSpawnOptions(platform = process.platform) {
  const workaroundPath = "./scripts/electron-builder-rename-workaround.cjs";
  const nodeOptions = process.env.NODE_OPTIONS ?? "";

  return {
    env: {
      ...process.env,
      NODE_OPTIONS: `${nodeOptions} --require=${workaroundPath}`.trim(),
    },
    stdio: ["inherit", "pipe", "pipe"],
    shell: platform === "win32",
  };
}

function spawnBuilderProcess() {
  const command = process.platform === "win32" ? "electron-builder.cmd" : "electron-builder";

  return new Promise((resolve) => {
    const child = spawn(command, ["--win", "nsis"], getBuilderSpawnOptions());
    let output = "";

    const forward = (chunk, stream) => {
      const text = chunk.toString();
      output += text;
      stream.write(chunk);
    };

    child.stdout.on("data", (chunk) => forward(chunk, process.stdout));
    child.stderr.on("data", (chunk) => forward(chunk, process.stderr));
    child.on("error", (error) =>
      resolve({ code: 1, output: `${output}\n${error.stack ?? error}` }),
    );
    child.on("close", (code) => resolve({ code: code ?? 1, output }));
  });
}

export async function runBuilderWithRetries({
  attempts = DEFAULT_ATTEMPTS,
  platform = process.platform,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  spawnBuilder = spawnBuilderProcess,
} = {}) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const result = await spawnBuilder();

    if (result.code === 0) {
      return 0;
    }

    const canRetry =
      platform === "win32" && attempt < attempts && isRetryablePackagingFailure(result.output);

    if (!canRetry) {
      return result.code || 1;
    }

    console.warn(
      `electron-builder hit a transient Windows staging lock; retrying (${attempt + 1}/${attempts})...`,
    );
    await delay(retryDelayMs);
  }

  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runBuilderWithRetries();
}
