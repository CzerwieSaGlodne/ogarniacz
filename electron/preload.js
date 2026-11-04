'use strict';
/* Most między interfejsem a Electronem - tylko bezpieczne, konkretne funkcje. */

const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, handler) {
  const listener = (_event, value) => handler(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('api', {
  load: () => ipcRenderer.invoke('data:load'),
  save: (data) => ipcRenderer.invoke('data:save', data),
  dataPath: () => ipcRenderer.invoke('data:path'),
  setTitleBar: (themeId) => ipcRenderer.invoke('ui:titlebar', themeId),
  exportData: (data, name) => ipcRenderer.invoke('dialog:export', data, name),
  importData: () => ipcRenderer.invoke('dialog:import'),

  syncStatus: () => ipcRenderer.invoke('sync:status'),
  syncEnable: () => ipcRenderer.invoke('sync:enable'),
  syncDisable: () => ipcRenderer.invoke('sync:disable'),
  syncNewCode: () => ipcRenderer.invoke('sync:new-code'),
  syncUnpair: () => ipcRenderer.invoke('sync:unpair'),
  syncSetOptions: (options) => ipcRenderer.invoke('sync:set-options', options),
  onSyncStatus: (handler) => subscribe('sync:status', handler),
  onSyncState: (handler) => subscribe('sync:state', handler),

  onMenu: (channel, handler) => {
    const allowed = ['menu:export', 'menu:import', 'menu:sync'];
    if (!allowed.includes(channel)) return;
    ipcRenderer.on(channel, () => handler());
  }
});
