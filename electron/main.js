import { app, BrowserWindow, Menu, shell } from 'electron';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const packaged = app.isPackaged;

/** Port libre choisi au démarrage : l'application ne doit pas se battre avec
 *  une instance Docker déjà en écoute sur 8080. */
function freePort() {
  return new Promise((done, fail) => {
    const probe = createServer();
    probe.on('error', fail);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => done(port));
    });
  });
}

async function startServer() {
  const port = await freePort();
  process.env.PORT = String(port);
  // Écoute sur la boucle locale seulement : les schémas ne doivent pas être
  // exposés au réseau de la machine.
  process.env.HOST = '127.0.0.1';
  process.env.NODE_ENV = 'production';
  // Les documents vivent dans ~/Library/Application Support/LucidFlow.
  process.env.DATA_DIR = app.getPath('userData');
  process.env.PUBLIC_DIR = packaged
    ? join(process.resourcesPath, 'public')
    : resolve(here, '../client/dist');

  await import(resolve(here, '../server/src/index.js'));
  return port;
}

/** Actions d'édition : natives dans un champ de saisie, propres à l'application
 *  sur la toile. Sans ce partage, l'accélérateur du menu confisquerait la touche
 *  et l'annulation du schéma ne fonctionnerait plus. */
function editItem(label, accelerator, action) {
  return {
    label,
    accelerator,
    async click(_item, win) {
      if (!win) return;
      const typing = await win.webContents
        .executeJavaScript("!!document.activeElement?.closest('input, textarea, [contenteditable]')")
        .catch(() => false);
      if (typing) win.webContents[action]?.();
      else await win.webContents.executeJavaScript(`window.lucidflowEdit?.(${JSON.stringify(action)})`).catch(() => {});
    },
  };
}

function buildMenu() {
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about', label: `À propos de ${app.name}` },
        { type: 'separator' },
        { role: 'hide', label: `Masquer ${app.name}` },
        { role: 'hideOthers', label: 'Masquer les autres' },
        { role: 'unhide', label: 'Tout afficher' },
        { type: 'separator' },
        { role: 'quit', label: `Quitter ${app.name}` },
      ],
    },
    {
      label: 'Fichier',
      submenu: [
        {
          label: 'Enregistrer',
          accelerator: 'CmdOrCtrl+S',
          click: (_i, win) => win?.webContents.executeJavaScript('window.lucidflowSave?.()').catch(() => {}),
        },
        { type: 'separator' },
        { role: 'close', label: 'Fermer la fenêtre' },
      ],
    },
    {
      label: 'Édition',
      submenu: [
        editItem('Annuler', 'CmdOrCtrl+Z', 'undo'),
        editItem('Rétablir', 'Shift+CmdOrCtrl+Z', 'redo'),
        { type: 'separator' },
        editItem('Couper', 'CmdOrCtrl+X', 'cut'),
        editItem('Copier', 'CmdOrCtrl+C', 'copy'),
        editItem('Coller', 'CmdOrCtrl+V', 'paste'),
        editItem('Tout sélectionner', 'CmdOrCtrl+A', 'selectAll'),
      ],
    },
    {
      label: 'Affichage',
      submenu: [
        { role: 'reload', label: 'Recharger' },
        { role: 'toggleDevTools', label: 'Outils de développement' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Taille réelle' },
        { role: 'zoomIn', label: 'Agrandir' },
        { role: 'zoomOut', label: 'Réduire' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Plein écran' },
      ],
    },
    {
      label: 'Fenêtre',
      submenu: [
        { role: 'minimize', label: 'Réduire' },
        { role: 'zoom', label: 'Zoom' },
        { role: 'front', label: 'Tout ramener au premier plan' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow(port) {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 620,
    backgroundColor: '#f4f6f9',
    title: 'LucidFlow',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  win.once('ready-to-show', () => win.show());
  win.loadURL(`http://127.0.0.1:${port}/`);

  // Les liens externes s'ouvrent dans le navigateur, pas dans une fenêtre de l'app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`http://127.0.0.1:${port}`)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // Fermeture : on laisse partir l'enregistrement en attente avant de céder.
  // Le preventDefault annule aussi une demande de sortie (Cmd+Q) : il faut donc
  // la relancer une fois l'enregistrement terminé, sinon l'application survit
  // sans fenêtre.
  let closable = false;
  win.on('close', (event) => {
    if (closable) return;
    event.preventDefault();
    const flush = win.webContents.executeJavaScript('window.lucidflowSave?.()').catch(() => {});
    const limite = new Promise((done) => setTimeout(done, 2000));
    Promise.race([flush, limite]).finally(() => {
      closable = true;
      if (quitting) app.quit();
      else win.close();
    });
  });

  return win;
}

app.setName('LucidFlow');

/** Vrai dès que l'utilisateur demande à quitter (Cmd+Q, menu, dock). */
let quitting = false;
app.on('before-quit', () => {
  quitting = true;
});

app.whenReady().then(async () => {
  const port = await startServer();
  buildMenu();
  createWindow(port);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(port);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
