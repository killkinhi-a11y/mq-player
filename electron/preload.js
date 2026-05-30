const { contextBridge } = require("electron");

// Expose a minimal API to the renderer for platform detection
contextBridge.exposeInMainWorld("electronPlatform", {
  isElectron: true,
  platform: process.platform,
});
