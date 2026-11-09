// Ponte do assistente da IA com o processo principal.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('qythonSetup', {
  state: () => ipcRenderer.invoke('ai:state'),
  install: (modelId) => ipcRenderer.invoke('ai:install', modelId),
  cancel: () => ipcRenderer.invoke('ai:cancel'),
  skip: () => ipcRenderer.invoke('ai:skip'),
  done: () => ipcRenderer.invoke('ai:done'),
  onUpdate: (callback) => {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on('ai:update', handler);
    return () => ipcRenderer.removeListener('ai:update', handler);
  },
});
