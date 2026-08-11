const { contextBridge, ipcRenderer } = require("electron");

const toBytes = (v) => (v ? new Uint8Array(v) : null);

contextBridge.exposeInMainWorld("inkwellDesktop", {
  platform: process.platform,
  readDb: async () => toBytes(await ipcRenderer.invoke("db:read")),
  writeDb: (bytes) => ipcRenderer.invoke("db:write", bytes),
  writeFile: (key, bytes) => ipcRenderer.invoke("file:write", key, bytes),
  readFile: async (key) => toBytes(await ipcRenderer.invoke("file:read", key)),
  deleteFile: (key) => ipcRenderer.invoke("file:delete", key),
  exportFile: (name, bytes) => ipcRenderer.invoke("file:export", name, bytes),
});
