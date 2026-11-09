const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('passphrase', {
  submit: (value) => ipcRenderer.send('passphrase:submit', String(value)),
  cancel: () => ipcRenderer.send('passphrase:cancel'),
});
