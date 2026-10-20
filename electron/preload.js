'use strict';
/* Most między interfejsem a Electronem - tylko 5 funkcji, bez dostępu do systemu */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  load: () => ipcRenderer.invoke('data:load'),
  save: (data) => ipcRenderer.invoke('data:save', data),
  dataPath: () => ipcRenderer.invoke('data:path'),
  setTitleBar: (themeId) => ipcRenderer.invoke('ui:titlebar', themeId),
  exportData: (data, name) => ipcRenderer.invoke('dialog:export', data, name),
  importData: () => ipcRenderer.invoke('dialog:import'),
  onMenu: (channel, handler) => {
    const allowed = ['menu:export', 'menu:import'];
    if (!allowed.includes(channel)) return;
    ipcRenderer.on(channel, () => handler());
  }
});