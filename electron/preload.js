const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  rpc: (method, params) => ipcRenderer.invoke('rpc', { method, params }),
  onMenu: (callback) => {
    const handler = (_event, id) => callback(id);
    ipcRenderer.on('menu', handler);
    return () => ipcRenderer.removeListener('menu', handler);
  },
  onNotification: (callback) => {
    const handler = (_event, msg) => callback(msg);
    ipcRenderer.on('sidecar-notification', handler);
    return () => ipcRenderer.removeListener('sidecar-notification', handler);
  },
  openFolderDialog: () => ipcRenderer.invoke('dialog:openFolder'),
  openFileDialog: () => ipcRenderer.invoke('dialog:openFile'),
  saveFileDialog: (defaultName) => ipcRenderer.invoke('dialog:saveFile', defaultName),
  openInFinder: (path) => ipcRenderer.invoke('shell:openInFinder', path),
});
