const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('moshu', {
  isElectron: true,
  info: () => invoke('app:info'),
  list: () => invoke('fs:list'),
  read: (name) => invoke('fs:read', name),
  write: (name, payload) => invoke('fs:write', name, payload),
  remove: (name) => invoke('fs:delete', name),
  rename: (from, to) => invoke('fs:rename', from, to),
  reveal: (name) => invoke('shell:reveal', name),
  openPath: (target) => invoke('shell:openPath', target),
  importDialog: () => invoke('dialog:import'),
  saveDialog: (name, payload) => invoke('dialog:save', name, payload),
  saveExport: (name, base64) => invoke('workspace:save-export', name, base64),
  exportPdf: (html, name) => invoke('pdf:export', html, name),
  aiProxy: (payload) => invoke('ai:proxy', payload),
  aiDownload: (url) => invoke('ai:download', url),
  openWorkspace: () => invoke('app:openWorkspace'),
  writeBoard: (name, data) => invoke('app:writeBoardFile', name, data),
  window: (action) => invoke('win:action', action),
  onBridgeReady: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('bridge:ready', handler);
    return () => ipcRenderer.removeListener('bridge:ready', handler);
  },
  onWindowState: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('win:state', handler);
    return () => ipcRenderer.removeListener('win:state', handler);
  },
});
