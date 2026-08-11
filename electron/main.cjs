const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const http = require("http");

const DEV_URL = process.env.ELECTRON_START_URL || "";

function userDir(sub) {
  const dir = path.join(app.getPath("userData"), sub);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function dbPath() {
  return path.join(userDir("."), "inkwell.db");
}

function filePath(key) {
  return path.join(userDir("documents"), key.replace(/[^a-zA-Z0-9._-]/g, "_"));
}

ipcMain.handle("db:read", () => {
  const p = dbPath();
  return fs.existsSync(p) ? fs.readFileSync(p) : null;
});
ipcMain.handle("db:write", (_e, bytes) => {
  fs.writeFileSync(dbPath(), Buffer.from(bytes));
  return true;
});
ipcMain.handle("file:write", (_e, key, bytes) => {
  fs.writeFileSync(filePath(key), Buffer.from(bytes));
  return true;
});
ipcMain.handle("file:read", (_e, key) => {
  const p = filePath(key);
  return fs.existsSync(p) ? fs.readFileSync(p) : null;
});
ipcMain.handle("file:delete", (_e, key) => {
  const p = filePath(key);
  if (fs.existsSync(p)) fs.unlinkSync(p);
  return true;
});
ipcMain.handle("file:export", async (_e, name, bytes) => {
  const res = await dialog.showSaveDialog({ defaultPath: name });
  if (res.canceled || !res.filePath) return null;
  fs.writeFileSync(res.filePath, Buffer.from(bytes));
  return res.filePath;
});

// Serves the prerendered client build over localhost so router/asset paths keep working.
function startStaticServer(root) {
  const types = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".wasm": "application/wasm",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
  };
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = decodeURIComponent((req.url || "/").split("?")[0]);
      let file = path.join(root, url);
      if (!file.startsWith(root)) file = root;
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        const idx = path.join(file, "index.html");
        file = fs.existsSync(idx) ? idx : path.join(root, "index.html");
      }
      if (!fs.existsSync(file)) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream" });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${server.address().port}/`));
  });
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1024,
    backgroundColor: "#faf8f4",
    title: "Inkwell — Fill & Sign",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (DEV_URL) {
    await win.loadURL(DEV_URL);
    return;
  }

  const candidates = [
    path.join(__dirname, "..", ".output", "public"),
    path.join(process.resourcesPath || "", "app", ".output", "public"),
    path.join(__dirname, "..", "dist"),
  ];
  const root = candidates.find((p) => p && fs.existsSync(path.join(p, "index.html")));
  if (!root) {
    await win.loadURL(
      "data:text/html,<h1 style=\"font-family:sans-serif;padding:2rem\">Build missing. Run the web build first.</h1>",
    );
    return;
  }
  const url = await startStaticServer(root);
  await win.loadURL(url);
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
