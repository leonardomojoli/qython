// Ponte mínima entre a página e o app. O front só enxerga o que está listado aqui.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('qythonDesktop', {
  isDesktop: true,
  platform: process.platform,
  /** Notificação do sistema operacional (a janela pode estar em segundo plano). */
  notify: (title, body) => ipcRenderer.invoke('qython:notify', { title: String(title), body: String(body ?? '') }),
  openLogs: () => ipcRenderer.invoke('qython:open-logs'),
  appInfo: () => ipcRenderer.invoke('qython:app-info'),
});
