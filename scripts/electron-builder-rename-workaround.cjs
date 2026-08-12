const fs = require("node:fs/promises");
const path = require("node:path");

const RETRYABLE_ERRORS = new Set(["EPERM", "EBUSY"]);

async function moveStagingDirectory(source, destination, options = {}) {
  const {
    attempts = 5,
    copy = (from, to) => fs.cp(from, to, { recursive: true, force: true }),
    delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    remove = (target) => fs.rm(target, { recursive: true, force: true }),
    rename = (from, to) => fs.rename(from, to),
  } = options;

  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await rename(source, destination);
    } catch (error) {
      if (!RETRYABLE_ERRORS.has(error?.code)) {
        throw error;
      }
      lastError = error;
      if (attempt < attempts) {
        await delay(1000 * attempt);
      }
    }
  }

  try {
    await copy(source, destination);
    await remove(source);
  } catch (fallbackError) {
    fallbackError.cause = lastError;
    throw fallbackError;
  }
}

function isElectronStagingRename(source, destination) {
  return (
    path.basename(source) === "win-unpacked.tmp" && path.basename(destination) === "win-unpacked"
  );
}

function installRenameWorkaround() {
  if (process.platform !== "win32" || fs.rename.__inkwellPatched) {
    return;
  }

  const originalRename = fs.rename.bind(fs);
  const patchedRename = async (source, destination) => {
    if (!isElectronStagingRename(source, destination)) {
      return originalRename(source, destination);
    }

    return moveStagingDirectory(source, destination, { rename: originalRename });
  };
  patchedRename.__inkwellPatched = true;
  fs.rename = patchedRename;
}

installRenameWorkaround();

module.exports = {
  installRenameWorkaround,
  isElectronStagingRename,
  moveStagingDirectory,
};
