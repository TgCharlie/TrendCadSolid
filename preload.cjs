'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('trendcadApp', {
  getInfo: () => ipcRenderer.invoke('app:get-info'),
  checkForUpdates: () => ipcRenderer.invoke('app:check-for-updates'),
  openRelease: url => ipcRenderer.invoke('app:open-release', url)
});
