// Processo principal do app desktop do Qython: sobe a pilha local (Postgres + backend),
// abre a janela e a mantém de pé até o médico fechar.
import { app, BrowserWindow, Menu, Notification, Tray, dialog, ipcMain, nativeImage, safeStorage, session, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { layout } from './paths.js';
import { createLogger } from './logger.js';
import { SecretStore, SecretsUnavailableError, electronVault } from './secrets.js';
import { Settings } from './settings.js';
import { Stack, KeysMissingError } from './stack.js';
import { runSmoke } from './smoke.js';
import { AiController } from './ai.js';
import { LocalLlm } from './llm.js';
import { ModelManager, loadManifest } from './models.js';
import { startUpdater } from './updater.js';
import { BackupError, EXTENSION, suggestedName } from './backup.js';
import { backupFlow, restoreFlow } from './backup-flow.js';

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
let ai = null;
let settings = null;
let wizard = null;
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
  // O que dá errado dentro da janela (página que não carrega, renderizador que cai, erro do
  // React) vai para o app.log: sem isto o médico vê uma tela branca e ninguém sabe por quê.
  win.webContents.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
    if (isMainFrame && code !== -3) log.error(`A janela não carregou ${url}: ${desc} (${code})`);
  });
  win.webContents.on('render-process-gone', (_e, details) => log.error(`O renderizador caiu: ${details.reason}`));
  win.webContents.on('console-message', (event) => {
    if (event.level === 'error') log.warn(`[janela] ${event.message}`);
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

let installUpdate = null; // definida quando uma atualização já foi baixada

function trayMenu() {
  return Menu.buildFromTemplate([
    { label: 'Abrir o Qython', click: showMain },
    ...(installUpdate ? [{ label: 'Reiniciar para atualizar', click: () => installUpdate() }] : []),
    { label: 'Escolher a IA…', click: () => { openWizard(); } },
    { label: 'Fazer backup…', click: () => { runBackup().catch(() => {}); } },
    { label: 'Abrir a pasta de logs', click: () => shell.openPath(paths.logs) },
    { type: 'separator' },
    { label: 'Sair', click: () => app.quit() },
  ]);
}

function createTray() {
  try {
    const image = nativeImage.createFromPath(iconFile).resize({ width: 22, height: 22 });
    tray = new Tray(image);
    tray.setToolTip('Qython');
    tray.setContextMenu(trayMenu());
    tray.on('click', showMain);
  } catch (err) {
    log.warn(`Bandeja indisponível: ${err.message}`);
  }
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    { label: 'Arquivo', submenu: [
      { label: 'Fazer backup…', click: () => { runBackup().catch(() => {}); } },
      { label: 'Restaurar backup…', click: () => { runRestore().catch(() => {}); } },
      { type: 'separator' },
      isMac ? { role: 'close' } : { label: 'Sair', click: () => app.quit() },
    ] },
    { label: 'Editar', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'Exibir', submenu: [{ role: 'reload' }, { role: 'togglefullscreen' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' }, ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' }])] },
    { label: 'Ajuda', submenu: [
      { label: 'Escolher a IA…', click: () => { openWizard(); } },
      { label: 'Baixar a transcrição de áudio e vídeo (1,6 GB)', click: () => { downloadWhisper(); } },
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

/** O assistente da IA: escolher o modelo e acompanhar o download. Resolve quando fecha. */
function openWizard() {
  if (wizard && !wizard.isDestroyed()) {
    wizard.focus();
    return new Promise((resolve) => wizard.once('closed', resolve));
  }
  log.info('Abrindo o assistente da IA.');
  wizard = new BrowserWindow({
    width: 820, height: 840, minWidth: 640, minHeight: 560, show: false, title: 'Escolher a IA',
    icon: iconFile, autoHideMenuBar: true, parent: mainWindow ?? undefined, modal: false,
    webPreferences: {
      preload: path.join(here, 'setup', 'preload.cjs'),
      contextIsolation: true, sandbox: true, nodeIntegration: false,
    },
  });
  wizard.setMenuBarVisibility(false);
  wizard.once('ready-to-show', () => wizard.show());
  wizard.loadFile(path.join(here, 'setup', 'index.html'));
  return new Promise((resolve) => wizard.once('closed', () => { wizard = null; resolve(); }));
}

function downloadWhisper() {
  const w = ai?.models.defaultWhisper();
  if (!w) return;
  if (ai.models.isInstalled(w.id)) {
    dialog.showMessageBox(mainWindow ?? undefined, { type: 'info', title: 'Qython', message: 'A transcrição de áudio e vídeo já está instalada.' });
    return;
  }
  if (ai.downloading) {
    dialog.showMessageBox(mainWindow ?? undefined, { type: 'info', title: 'Qython', message: 'Já há um download em andamento', detail: 'Quando ele terminar, peça de novo.' });
    return;
  }
  ai.installWhisper().catch((err) => log.error(`transcrição: ${err.message}`));
  dialog.showMessageBox(mainWindow ?? undefined, {
    type: 'info', title: 'Qython', message: 'Baixando a transcrição de áudio e vídeo',
    detail: 'São cerca de 1,6 GB, em segundo plano. Você será avisado quando terminar.',
  });
}

// --- Backup e restauração ---------------------------------------------------------------

const prompts = new Map(); // webContents.id -> resolve
ipcMain.on('passphrase:submit', (e, value) => prompts.get(e.sender.id)?.(typeof value === 'string' ? value : null));
ipcMain.on('passphrase:cancel', (e) => prompts.get(e.sender.id)?.(null));

/** Pede a senha do backup numa janela própria (o Electron não tem prompt). Null = cancelou. */
function askPassphrase({ title, message, confirm }) {
  return new Promise((resolve) => {
    const win = new BrowserWindow({
      width: 460, height: confirm ? 380 : 300, resizable: false, minimizable: false, show: false, title,
      icon: iconFile, autoHideMenuBar: true, parent: mainWindow ?? undefined, modal: !!mainWindow,
      webPreferences: {
        preload: path.join(here, 'passphrase', 'preload.cjs'),
        contextIsolation: true, sandbox: true, nodeIntegration: false,
      },
    });
    win.setMenuBarVisibility(false);
    const id = win.webContents.id;
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      prompts.delete(id);
      resolve(value);
      if (!win.isDestroyed()) win.close();
    };
    prompts.set(id, finish);
    win.once('ready-to-show', () => win.show());
    win.on('closed', () => finish(null));
    win.loadFile(path.join(here, 'passphrase', 'index.html'), {
      query: { title, message, confirm: confirm ? '1' : '0' },
    });
  });
}

let paused = false;

/** Esconde a janela e mostra a tela de espera enquanto a pilha está parada. */
async function whilePaused(status, fn) {
  paused = true;
  mainWindow?.hide();
  createSplash();
  setStatus(status);
  try {
    return await fn();
  } finally {
    splash?.close();
    splash = null;
    paused = false;
    if (mainWindow && stack?.running) {
      mainWindow.loadURL(stack.webUrl).catch(() => {});
      mainWindow.show();
    }
  }
}

async function runBackup() {
  if (!stack?.running || paused) return { ok: false, reason: 'busy' };
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow ?? undefined, {
    title: 'Salvar o backup do Qython',
    defaultPath: path.join(app.getPath('documents'), suggestedName()),
    filters: [{ name: 'Backup do Qython', extensions: [EXTENSION.slice(1)] }],
  });
  if (canceled || !filePath) return { ok: false, reason: 'canceled' };
  const passphrase = await askPassphrase({
    title: 'Senha do backup', confirm: true,
    message: 'O backup inclui os dados dos pacientes e as chaves de criptografia, e é cifrado com esta senha. ' +
      'Sem ela não há como abrir o arquivo: guarde-a em lugar seguro.',
  });
  if (!passphrase) return { ok: false, reason: 'canceled' };
  try {
    const result = await whilePaused('Fazendo o backup… (o Qython volta em instantes)', () => backupFlow({
      stack, passphrase, outFile: filePath, appVersion: app.getVersion(),
    }));
    log.info(`Backup gravado em ${filePath} (${result.bytes} bytes).`);
    await dialog.showMessageBox(mainWindow ?? undefined, {
      type: 'info', title: 'Qython', message: 'Backup concluído',
      detail: `${filePath}\n\nOs modelos de IA não entram no backup (o assistente baixa de novo). ` +
        'Guarde o arquivo e a senha em lugares diferentes.',
    });
    return { ok: true, file: filePath, bytes: result.bytes };
  } catch (err) {
    log.error(`Backup falhou: ${err.stack ?? err.message}`);
    await dialog.showMessageBox(mainWindow ?? undefined, { type: 'error', title: 'Qython', message: 'O backup falhou', detail: err.message });
    return { ok: false, reason: 'failed', message: err.message };
  }
}

async function runRestore() {
  if (!stack?.running || paused) return { ok: false, reason: 'busy' };
  const picked = await dialog.showOpenDialog(mainWindow ?? undefined, {
    title: 'Escolher o backup do Qython', properties: ['openFile'],
    filters: [{ name: 'Backup do Qython', extensions: [EXTENSION.slice(1)] }],
  });
  if (picked.canceled || !picked.filePaths[0]) return { ok: false, reason: 'canceled' };
  const file = picked.filePaths[0];
  const sure = await dialog.showMessageBox(mainWindow ?? undefined, {
    type: 'warning', title: 'Qython', message: 'Restaurar este backup?',
    detail: 'Os dados de agora serão substituídos pelos do backup. O que existe hoje fica guardado numa pasta ' +
      '"antes-do-restauro" dentro dos dados do Qython, e você pode apagá-la depois.',
    buttons: ['Restaurar', 'Cancelar'], defaultId: 1, cancelId: 1,
  });
  if (sure.response !== 0) return { ok: false, reason: 'canceled' };
  const passphrase = await askPassphrase({ title: 'Senha do backup', confirm: false, message: path.basename(file) });
  if (!passphrase) return { ok: false, reason: 'canceled' };
  try {
    const { antes } = await whilePaused('Restaurando o backup…', () => restoreFlow({ stack, file, passphrase }));
    log.info(`Backup restaurado de ${file}; o que havia ficou em ${antes}.`);
    await dialog.showMessageBox(mainWindow ?? undefined, {
      type: 'info', title: 'Qython', message: 'Backup restaurado',
      detail: `Os dados anteriores ficaram em:\n${antes}\n\nQuando tiver certeza de que está tudo certo, pode apagar essa pasta.`,
    });
    return { ok: true, antes };
  } catch (err) {
    log.error(`Restauração falhou: ${err.stack ?? err.message}`);
    await dialog.showMessageBox(mainWindow ?? undefined, {
      type: 'error', title: 'Qython',
      message: err instanceof BackupError ? 'Não foi possível restaurar' : 'A restauração falhou',
      detail: err.message,
    });
    return { ok: false, reason: 'failed', message: err.message };
  }
}

ipcMain.handle('qython:backup', () => runBackup());
ipcMain.handle('qython:restore', () => runRestore());

function wireAi() {
  const push = () => {
    if (wizard && !wizard.isDestroyed()) wizard.webContents.send('ai:update', ai.state());
  };
  ai.on('change', push);
  let lastPush = 0;
  ai.on('progress', (p) => {
    const now = Date.now();
    if (now - lastPush > 400) {
      lastPush = now;
      push();
    }
    if (tray && p.total) tray.setToolTip(`Qython — baixando a IA (${Math.floor((p.received / p.total) * 100)}%)`);
  });
  ai.on('installed', (id) => {
    tray?.setToolTip('Qython');
    if (!Notification.isSupported()) return;
    const kind = ai.models.get(id)?.kind;
    if (kind === 'support') return; // os modelos de busca são pequenos e não merecem aviso
    const body = kind === 'whisper'
      ? 'A transcrição de áudio e vídeo foi baixada e está pronta para usar.'
      : 'A IA local foi baixada e está pronta para usar.';
    new Notification({ title: 'Qython', body, icon: iconFile }).show();
  });
  ipcMain.handle('ai:state', () => ai.state());
  ipcMain.handle('ai:install', (_e, modelId) => {
    ai.install(modelId).catch((err) => log.error(`install: ${err.message}`));
  });
  ipcMain.handle('ai:cancel', () => ai.cancel());
  ipcMain.handle('ai:skip', () => {
    settings.set('aiSkipped', true);
    wizard?.close();
  });
  ipcMain.handle('ai:done', () => wizard?.close());
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

  const secrets = new SecretStore(paths.secrets, electronVault(safeStorage));
  settings = new Settings(paths.settings);
  const manifest = loadManifest(path.join(here, '..', 'models.json'));
  const models = new ModelManager(manifest, paths.models);
  ai = new AiController({ models, settings, logger: log, llm: () => stack?.llm ?? null });
  wireAi();

  const idleEnv = Number(process.env.QYTHON_LLM_IDLE_SECONDS);
  stack = new Stack({
    chromaIdleSeconds: Number(process.env.QYTHON_CHROMA_IDLE_SECONDS) || undefined,
    models, notReadyReason: () => ai.notReadyReason(),
    paths, resources: { backend: path.join(resourcesDir(), 'backend'), web: path.join(resourcesDir(), 'web') },
    secrets, settings, logger: log, onStatus: setStatus,
    env: process.env.QYTHON_BACKEND_EXTRA_ENV ? JSON.parse(process.env.QYTHON_BACKEND_EXTRA_ENV) : {},
    makeLlm: (apiKey) => new LocalLlm({
      models, settings, apiKey, logger: log,
      llamaDir: path.join(resourcesDir(), 'llama'),
      selectedId: () => ai.selectedId,
      notReady: () => ai.notReadyReason(),
      idleSeconds: idleEnv > 0 ? idleEnv : undefined,
      customModelFile: process.env.QYTHON_AI_MODEL_FILE || null,
    }),
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
      // A biblioteca precisa dos modelos de busca: baixa (e confere o SHA-256) como o app faria.
      await ai.installSupport();
      if (ai.state().error) throw new Error(ai.state().error);
      // A transcrição do CI usa o modelo tiny (75 MB) no lugar do large-v3-turbo (1,6 GB).
      if (process.env.QYTHON_WHISPER_MODEL_ID) await ai.models.install(process.env.QYTHON_WHISPER_MODEL_ID);
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

  // Atualização automática pelo GitHub Releases (só no app instalado; ver updater.js).
  startUpdater({
    app, settings, log,
    notify: (title, body) => {
      if (Notification.isSupported()) new Notification({ title, body, icon: iconFile }).show();
    },
    openExternal: (url) => shell.openExternal(url),
    onInstallReady: (fn) => {
      installUpdate = fn;
      tray?.setContextMenu(trayMenu());
    },
  }).catch((err) => log.warn(`Atualizador: ${err.message}`));

  // Primeira abertura: o médico escolhe a IA antes de começar. O download segue em segundo
  // plano e o cadastro da conta é feito na própria tela do Qython.
  if (!ai.choice && !settings.get('aiSkipped') && !process.env.QYTHON_AI_MODEL_FILE) {
    mainWindow.once('ready-to-show', () => { openWizard(); });
  }
  ai.resumePending();
}

ipcMain.handle('qython:notify', (_e, { title, body }) => {
  if (!Notification.isSupported()) return false;
  const n = new Notification({ title, body, icon: iconFile });
  n.on('click', showMain);
  n.show();
  return true;
});
ipcMain.handle('qython:open-logs', () => shell.openPath(paths.logs));
ipcMain.handle('qython:open-ai-setup', () => { openWizard(); });
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
      log.error('Teste de fumaça passou de 10 minutos; abortando.');
      app.exit(2);
    }, 10 * 60 * 1000).unref();
  }
}

// Evita uma janela de erro do Electron para exceções que o log já registra.
process.on('uncaughtException', (err) => log.error(`uncaughtException: ${err.stack ?? err.message}`));
process.on('unhandledRejection', (err) => log.error(`unhandledRejection: ${err?.stack ?? err}`));

// Garante que a pasta de logs exista mesmo se a pilha falhar antes de criá-la.
fs.mkdirSync(paths.logs, { recursive: true });
