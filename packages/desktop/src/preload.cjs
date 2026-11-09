// Ponte mínima entre a página e o app. O front só enxerga o que está listado aqui.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('qythonDesktop', {
  isDesktop: true,
  platform: process.platform,
  /** Notificação do sistema operacional (a janela pode estar em segundo plano). */
  notify: (title, body) => ipcRenderer.invoke('qython:notify', { title: String(title), body: String(body ?? '') }),
  openLogs: () => ipcRenderer.invoke('qython:open-logs'),
  /** Abre o assistente da IA (escolher o modelo, ver o download). */
  openAiSetup: () => ipcRenderer.invoke('qython:open-ai-setup'),
  appInfo: () => ipcRenderer.invoke('qython:app-info'),
  /** Backup cifrado dos dados (abre as janelas do sistema para escolher o arquivo e a senha). */
  backup: () => ipcRenderer.invoke('qython:backup'),
  restore: () => ipcRenderer.invoke('qython:restore'),
});
