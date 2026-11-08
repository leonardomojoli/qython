// Processo principal do app desktop do Qython: sobe a pilha local (Postgres + backend),
// abre a janela e a mantém de pé até o médico fechar.
import { app, BrowserWindow, Menu, Notification, Tray, dialog, ipcMain, nativeImage, safeStorage, session, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { layout } from './paths.js';
import { createLogger } from './logger.js';
import { SecretStore, SecretsUnavailableError } from './secrets.js';
import { Settings } from './settings.js';
import { Stack, KeysMissingError } from './stack.js';
import { runSmoke } from './smoke.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const SMOKE = process.argv.includes('--smoke');

app.setName('Qython');
// Perfil isolado (testes e CI): sem isto o app usaria o perfil real do usuário.
if (process.env.QYTHON_USER_DATA) app.setPath('userData', process.env.QYTHON_USER_DATA);

const paths = layout(app.getPath('userData'));
const log = createLogger(paths.logs, 'app');
const iconFile = path.join(here, '..', 'assets', 'icon.png');

function resourcesDir() {
  if (process.env.QYTHON_RESOURCES_DIR) return process.env.QYTHON_RESOURCES_DIR;
  return app.isPackaged ? process.resourcesPath : path.join(here, '..', 'build-resources');
}

let stack = null;
let splash = null;
let mainWindow = null;
let tray = null;
let quitting = false;

function createSplash() {
  splash = new BrowserWindow({
    width: 460, height: 260, frame: false, resizable: false, show: false, center: true,
    backgroundColor: '#1a1a2e', icon: iconFile, skipTaskbar: false, title: 'Qython',
  });
  splash.loadFile(path.join(here, 'splash.html'));
  splash.once('ready-to-show', () => splash?.show());
}

function setStatus(text) {
  if (!splash || splash.isDestroyed()) return;
  splash.webContents.executeJavaScript(`setStatus(${JSON.stringify(text)})`).catch(() => {});
}

function sameOrigin(url, base) {
  try {
    return new URL(url).origin === new URL(base).origin;
  } catch {
    return false;
  }
}

function createMainWindow(baseUrl, { visible = true } = {}) {
  const win = new BrowserWindow({
    width: 1366, height: 860, minWidth: 1024, minHeight: 640, show: false,
    backgroundColor: '#ffffff', title: 'Qython', icon: iconFile, autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(here, 'preload.cjs'),
      contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: true,
    },
  });
  if (visible) win.once('ready-to-show', () => win.show());

  // Links para fora (PubMed, bulas, diretrizes) abrem no navegador do sistema; a página
  // do app nunca navega para um site externo dentro da própria janela.
  const external = (url) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
  };
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (sameOrigin(url, baseUrl) || url.startsWith(`blob:${new URL(baseUrl).origin}`)) {
      return { action: 'allow' };
    }
    external(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!sameOrigin(url, baseUrl)) {
      event.preventDefault();
      external(url);
    }
  });

  // Fechar a janela mantém o app na bandeja (Windows e macOS), onde as notificações e os
  // serviços continuam. No Linux muitos ambientes não têm bandeja: fechar encerra.
  win.on('close', (event) => {
    if (quitting || process.platform === 'linux') return;
    event.preventDefault();
    win.hide();
  });
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });
  win.loadURL(baseUrl);
  return win;
}

function showMain() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createTray() {
  try {
    const image = nativeImage.createFromPath(iconFile).resize({ width: 22, height: 22 });
    tray = new Tray(image);
    tray.setToolTip('Qython');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Abrir o Qython', click: showMain },
      { label: 'Abrir a pasta de logs', click: () => shell.openPath(paths.logs) },
      { type: 'separator' },
      { label: 'Sair', click: () => app.quit() },
    ]));
    tray.on('click', showMain);
  } catch (err) {
    log.warn(`Bandeja indisponível: ${err.message}`);
  }
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    { label: 'Editar', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'Exibir', submenu: [{ role: 'reload' }, { role: 'togglefullscreen' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' }, ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' }])] },
    { label: 'Ajuda', submenu: [
      { label: 'Abrir a pasta de logs', click: () => shell.openPath(paths.logs) },
      { label: 'Código-fonte e documentação', click: () => shell.openExternal('https://github.com/leonardomojoli/qython') },
    ] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function hardenSession(origin) {
  // Só a própria página pede permissões; microfone é do ditado e notificação é do app.
  const allowed = new Set(['media', 'notifications', 'clipboard-sanitized-write', 'fullscreen']);
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => {
    cb(allowed.has(permission) && sameOrigin(wc.getURL(), origin));
  });
}

async function fatal(err) {
  log.error(`Falha ao iniciar: ${err.stack ?? err.message}`);
  if (SMOKE) {
    process.stderr.write(`\n${err.message}\n`);
    await shutdown(1);
    return;
  }
  splash?.close();
  const known = err instanceof KeysMissingError || err instanceof SecretsUnavailableError;
  const { response } = await dialog.showMessageBox({
    type: 'error', title: 'Qython',
    message: known ? 'O Qython não conseguiu abrir os seus dados' : 'O Qython não conseguiu iniciar',
    detail: err.message,
    buttons: ['Abrir a pasta de logs', 'Fechar'], defaultId: 1,
  });
  if (response === 0) await shell.openPath(paths.logs);
  await shutdown(1);
}

async function shutdown(code = 0) {
  if (quitting && !stack) {
    app.exit(code);
    return;
  }
  quitting = true;
  try {
    await stack?.stop();
  } catch (err) {
    log.error(`Falha ao encerrar a pilha: ${err.message}`);
  }
  stack = null;
  log.close();
  app.exit(code);
}

async function boot() {
  buildMenu();
  if (!SMOKE) createSplash();

  const secrets = new SecretStore(paths.secrets, safeStorage);
  const settings = new Settings(paths.settings);
  stack = new Stack({
    paths, resources: { backend: path.join(resourcesDir(), 'backend'), web: path.join(resourcesDir(), 'web') },
    secrets, settings, logger: log, onStatus: setStatus,
  });
  stack.on('failed', (message) => {
    if (quitting) return;
    dialog.showErrorBox('Qython', `${message}\nVeja a pasta de logs para o motivo.`);
  });

  try {
    await stack.start();
  } catch (err) {
    // O médico fechou o app durante a primeira abertura: a pilha foi derrubada de
    // propósito e o erro que sobra disso não merece uma janela.
    if (quitting) return;
    await fatal(err);
    return;
  }
  if (quitting) return;

  hardenSession(stack.webUrl);
  mainWindow = createMainWindow(stack.webUrl, { visible: !SMOKE });
  if (SMOKE) {
    try {
      await runSmoke({ stack, log, window: mainWindow });
      process.stdout.write('SMOKE OK\n');
      await shutdown(0);
    } catch (err) {
      await fatal(err);
    }
    return;
  }
  mainWindow.once('ready-to-show', () => {
    splash?.close();
    splash = null;
  });
  createTray();
}

ipcMain.handle('qython:notify', (_e, { title, body }) => {
  if (!Notification.isSupported()) return false;
  const n = new Notification({ title, body, icon: iconFile });
  n.on('click', showMain);
  n.show();
  return true;
});
ipcMain.handle('qython:open-logs', () => shell.openPath(paths.logs));
ipcMain.handle('qython:app-info', () => ({
  version: app.getVersion(), platform: process.platform, userData: paths.root, logs: paths.logs,
  secretsProtection: stack?.secrets.protection ?? null,
}));

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showMain);
  app.on('before-quit', (event) => {
    if (quitting) return;
    event.preventDefault();
    shutdown(0);
  });
  app.on('window-all-closed', () => {
    // Windows/macOS ficam na bandeja; o Linux encerra (ver createMainWindow).
    if (process.platform === 'linux' || SMOKE) shutdown(0);
  });
  app.on('activate', showMain);
  app.whenReady().then(boot).catch(fatal);
  if (SMOKE) {
    setTimeout(() => {
      log.error('Teste de fumaça passou de 20 minutos; abortando.');
      app.exit(2);
    }, 20 * 60 * 1000).unref();
  }
}

// Evita uma janela de erro do Electron para exceções que o log já registra.
process.on('uncaughtException', (err) => log.error(`uncaughtException: ${err.stack ?? err.message}`));
process.on('unhandledRejection', (err) => log.error(`unhandledRejection: ${err?.stack ?? err}`));

// Garante que a pasta de logs exista mesmo se a pilha falhar antes de criá-la.
fs.mkdirSync(paths.logs, { recursive: true });
