// Atualização automática pelo GitHub Releases (electron-updater).
//
// Regras que importam para um app clínico:
//  - nunca interrompe o médico: baixa em segundo plano e instala quando o app é FECHADO;
//  - quem não quer a consulta ao GitHub desliga (settings.json `autoUpdate: false` ou
//    QYTHON_NO_UPDATE=1), porque checar atualização revela o IP e a versão ao GitHub;
//  - o banco se atualiza sozinho na abertura seguinte (o bootstrap aplica as migrations);
//  - no macOS sem assinatura o Squirrel.Mac não instala: o app só avisa e abre a página da versão.

/**
 * Decide se este app deve procurar atualização, e como. Função pura, para testar.
 * @returns {{enabled:boolean, reason?:string, autoDownload?:boolean}}
 */
export function updatePolicy({ isPackaged, env, settings, platform, appImage }) {
  if (!isPackaged) return { enabled: false, reason: 'app em desenvolvimento' };
  if (env.QYTHON_NO_UPDATE) return { enabled: false, reason: 'QYTHON_NO_UPDATE' };
  if (settings.get('autoUpdate', true) === false) return { enabled: false, reason: 'desligado nas preferências' };
  // O deb é instalado pelo gerenciador de pacotes do sistema, que cuida das versões.
  if (platform === 'linux' && !appImage) return { enabled: false, reason: 'instalado por pacote do sistema' };
  // Sem assinatura, o macOS recusa trocar o app por si mesmo: só avisa.
  return { enabled: true, autoDownload: platform !== 'darwin' };
}

const SIX_HOURS = 6 * 60 * 60 * 1000;

/**
 * @param {object} o
 * @param {import('electron').App} o.app
 * @param {import('./settings.js').Settings} o.settings
 * @param {any} o.log
 * @param {(title:string, body:string)=>void} o.notify
 * @param {(url:string)=>void} o.openExternal
 * @param {(handler:()=>void)=>void} [o.onInstallReady] recebe a função "instalar agora"
 */
export async function startUpdater(o) {
  const policy = updatePolicy({
    isPackaged: o.app.isPackaged, env: process.env, settings: o.settings, platform: process.platform,
    appImage: Boolean(process.env.APPIMAGE),
  });
  if (!policy.enabled) {
    o.log.info(`Atualização automática desligada: ${policy.reason}.`);
    return null;
  }
  const { default: updaterPkg } = await import('electron-updater');
  const { autoUpdater } = updaterPkg;
  autoUpdater.logger = { info: (m) => o.log.info(`[atualizador] ${m}`), warn: (m) => o.log.warn(`[atualizador] ${m}`), error: (m) => o.log.error(`[atualizador] ${m}`), debug() {} };
  autoUpdater.autoDownload = policy.autoDownload;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;

  autoUpdater.on('update-available', (info) => {
    o.log.info(`Versão ${info.version} disponível.`);
    if (!policy.autoDownload) {
      o.notify('Qython: versão nova', `A versão ${info.version} saiu. Baixe em github.com/leonardomojoli/qython/releases.`);
      o.openExternal(`https://github.com/leonardomojoli/qython/releases/tag/v${info.version}`);
    }
  });
  autoUpdater.on('update-downloaded', (info) => {
    o.log.info(`Versão ${info.version} baixada; instala ao fechar o app.`);
    o.notify('Qython: atualização pronta', `A versão ${info.version} será instalada quando você fechar o Qython.`);
    o.onInstallReady?.(() => autoUpdater.quitAndInstall());
  });
  autoUpdater.on('error', (err) => o.log.warn(`Não foi possível procurar atualização: ${err?.message ?? err}`));

  const check = () => autoUpdater.checkForUpdates().catch((err) => o.log.warn(`Atualização: ${err.message}`));
  setTimeout(check, 30_000).unref();
  setInterval(check, SIX_HOURS).unref();
  return autoUpdater;
}
