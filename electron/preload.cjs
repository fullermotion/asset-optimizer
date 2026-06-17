const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("assetOptimizer", {
  platform: process.platform,
  selectFiles: () => ipcRenderer.invoke("files:select"),
  selectOutputFolder: () => ipcRenderer.invoke("folder:selectOutput"),
  readAssetMetadata: (filePaths) => ipcRenderer.invoke("assets:metadata", filePaths),
  optimizeAssets: (payload) => ipcRenderer.invoke("assets:optimize", payload),
  revealInFinder: (filePath) => ipcRenderer.invoke("files:reveal", filePath),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  onProgress: (callback) => {
    const listener = (_event, update) => callback(update);
    ipcRenderer.on("assets:progress", listener);
    return () => ipcRenderer.removeListener("assets:progress", listener);
  }
});
