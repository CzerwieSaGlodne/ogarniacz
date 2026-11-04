'use strict';
/* Okno aplikacji, menu, zapis danych w pliku data.json */

const { app, BrowserWindow, ipcMain, dialog, Menu, shell, Tray, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const { createSyncHub } = require('./sync-server.js');

const APP_TITLE = 'OGARNIACZ';
const isDev = !app.isPackaged;

// folder z danymi: C:\Users\Natalia\AppData\Roaming\OGARNIACZ
app.setName(APP_TITLE);

/* Neutralny pasek tytułu okna - kolor dopasowuje się do motywu */
const TITLE_BAR_DEFAULT = { color: '#e4d2de', symbolColor: '#4a4460' };
const TITLE_BAR_BY_THEME = {
  pastel: { color: '#e4d2de', symbolColor: '#4a4460' },
  dark: { color: '#0f1118', symbolColor: '#c9cfdc' },
  cozy: { color: '#c9d8cf', symbolColor: '#33302f' }
};

let win = null;
let tray = null;
let syncHub = null;
let isQuitting = false;
const startHidden = process.argv.includes('--hidden');

/* Wersja przenośna trzyma dane w folderze "data" obok programu,
   dzięki czemu wystarczy skopiować plik i nie potrzeba uprawnień administratora. */
const isPortable = !!process.env.PORTABLE_EXECUTABLE_DIR;
/* Zmienna jest używana tylko podczas testów - pozwala nie dotykać
   prawdziwych danych użytkownika. */
const dataDir = process.env.OGARNIACZ_DATA_DIR
  ? path.resolve(process.env.OGARNIACZ_DATA_DIR)
  : isPortable
    ? path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'data')
    : app.getPath('userData');

const dataFile = () => path.join(dataDir, 'data.json');
const boundsFile = () => path.join(dataDir, 'window.json');

/* ---------- Okno ---------- */

function createWindow() {
  const state = loadBounds();

  win = new BrowserWindow({
    width: state.width || 1280,
    height: state.height || 820,
    x: state.x,
    y: state.y,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: APP_TITLE,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    backgroundColor: TITLE_BAR_DEFAULT.color,
    autoHideMenuBar: true,
    // własny kolor paska tytułu zamiast czarnego
    titleBarStyle: 'hidden',
    titleBarOverlay: Object.assign({ height: 40 }, TITLE_BAR_DEFAULT),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true
    }
  });

  win.loadFile(path.join(__dirname, '..', 'src', 'index.html'));

  win.once('ready-to-show', () => {
    const hideOnStart = startHidden && keepInTray();
    if (!hideOnStart) win.show();
    if (isDev) win.webContents.openDevTools({ mode: 'detach' });
  });

  win.on('close', (event) => {
    saveBounds();
    if (!isQuitting && keepInTray()) {
      event.preventDefault();
      win.hide();
      updateTrayMenu();
    }
  });
  win.on('closed', () => { win = null; });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

async function loadBounds() {
  try {
    return JSON.parse(await fs.readFile(boundsFile(), 'utf8'));
  } catch {
    return {};
  }
}

function saveBounds() {
  if (!win || win.isDestroyed() || win.isMinimized()) return;
  const b = win.getBounds();
  fs.writeFile(boundsFile(), JSON.stringify(b), 'utf8').catch(() => {});
}

/* ---------- Dane ---------- */

ipcMain.handle('data:load', async () => {
  try {
    return JSON.parse(await fs.readFile(dataFile(), 'utf8'));
  } catch {
    return null;
  }
});

ipcMain.handle('data:save', async (_e, data) => {
  try {
    if (syncHub) {
      const result = await syncHub.absorbDesktop(data);
      if (result && result.ok === false) return result;
      return { ok: true };
    }
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(dataFile(), JSON.stringify(data, null, 2), 'utf8');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle('data:path', async () => dataFile());

/* ---------- Synchronizacja ---------- */

ipcMain.handle('sync:status', async () => (syncHub ? syncHub.getStatus() : null));
ipcMain.handle('sync:enable', async () => {
  if (!syncHub) return null;
  const status = await syncHub.enable();
  applyLoginItem();
  refreshTray();
  showWindowIfNeeded();
  return status;
});
ipcMain.handle('sync:disable', async () => {
  if (!syncHub) return null;
  const status = await syncHub.disable();
  refreshTray();
  return status;
});
ipcMain.handle('sync:new-code', async () => (syncHub ? syncHub.newPairCode() : null));
ipcMain.handle('sync:unpair', async () => (syncHub ? syncHub.unpair() : null));
ipcMain.handle('sync:set-options', async (_e, options) => {
  if (!syncHub) return null;
  const status = await syncHub.setOptions(options);
  applyLoginItem();
  refreshTray();
  return status;
});

ipcMain.handle('ui:titlebar', async (_e, themeId) => {
  if (!win || win.isDestroyed()) return false;
  const colors = TITLE_BAR_BY_THEME[themeId] || TITLE_BAR_DEFAULT;
  try {
    win.setTitleBarOverlay(Object.assign({ height: 40 }, colors));
    win.setBackgroundColor(colors.color);
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('dialog:export', async (_e, data, suggestedName) => {
  const result = await dialog.showSaveDialog(win, {
    title: 'Zapisz kopię tablic',
    defaultPath: path.join(app.getPath('documents'), suggestedName || 'ogarniacz-kopia.json'),
    filters: [{ name: 'Kopia OGARNIACZA', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePath) return { ok: false };
  await fs.writeFile(result.filePath, JSON.stringify(data, null, 2), 'utf8');
  return { ok: true, path: result.filePath };
});

ipcMain.handle('dialog:import', async () => {
  const result = await dialog.showOpenDialog(win, {
    title: 'Wczytaj kopię tablic',
    properties: ['openFile'],
    filters: [{ name: 'Kopia OGARNIACZA', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePaths.length) return { ok: false };
  const raw = await fs.readFile(result.filePaths[0], 'utf8');
  return { ok: true, data: JSON.parse(raw), path: result.filePaths[0] };
});

/* ---------- Tray i autostart ---------- */

function showWindow() {
  if (!win || win.isDestroyed()) {
    createWindow();
    return;
  }
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function showWindowIfNeeded() {
  if (!win || win.isDestroyed() || win.isVisible()) return;
  if (!startHidden) showWindow();
}

function applyLoginItem() {
  if (!syncHub || !app.isPackaged) return;
  try {
    app.setLoginItemSettings({
      openAtLogin: !!syncHub.settings.startAtLogin,
      path: process.execPath,
      args: ['--hidden']
    });
  } catch (err) {
    console.error('Nie udało się ustawić autostartu:', err.message);
  }
}

function trayStatusText() {
  if (!syncHub) return 'Synchronizacja wyłączona';
  const status = syncHub.getStatus();
  if (!status.enabled) return 'Synchronizacja wyłączona';
  if (!status.ready) return 'Synchronizacja: sprawdź Tailscale';
  if (status.paired) return 'Synchronizacja z telefonem włączona';
  return 'Synchronizacja: czekam na telefon';
}

function updateTrayMenu() {
  if (!tray) return;
  tray.setToolTip('OGARNIACZ — ' + trayStatusText());
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Otwórz OGARNIACZ', click: showWindow },
    { label: trayStatusText(), enabled: false },
    { type: 'separator' },
    {
      label: 'Synchronizacja z telefonem…',
      click: () => {
        showWindow();
        if (win && !win.isDestroyed()) win.webContents.send('menu:sync');
      }
    },
    { type: 'separator' },
    {
      label: 'Zakończ OGARNIACZ',
      click: () => { isQuitting = true; app.quit(); }
    }
  ]));
}

function createTray() {
  if (tray) return;
  let image = nativeImage.createFromPath(path.join(__dirname, '..', 'build', 'icon.png'));
  if (!image.isEmpty()) image = image.resize({ width: 16, height: 16 });
  try {
    tray = new Tray(image);
    tray.on('click', showWindow);
    updateTrayMenu();
  } catch (err) {
    tray = null;
    console.error('Nie udało się utworzyć ikony w zasobniku:', err.message);
  }
}

function refreshTray() {
  const shouldShow = !!(syncHub && syncHub.settings.enabled && syncHub.settings.runInTray);
  if (shouldShow) {
    createTray();
    updateTrayMenu();
  } else if (tray) {
    tray.destroy();
    tray = null;
  }
}

function keepInTray() {
  return !!(syncHub && syncHub.settings.enabled && syncHub.settings.runInTray && tray);
}

function syncStatusChanged(status) {
  if (win && !win.isDestroyed()) win.webContents.send('sync:status', status);
  updateTrayMenu();
}

function syncStateFromPhone(state) {
  if (win && !win.isDestroyed()) win.webContents.send('sync:state', state);
}

/* ---------- Menu ---------- */

function send(channel) {
  return () => win && win.webContents.send(channel);
}

function buildMenu() {
  const template = [
    {
      label: 'Plik',
      submenu: [
        { label: 'Zapisz kopię…', accelerator: 'CmdOrCtrl+E', click: send('menu:export') },
        { label: 'Wczytaj kopię…', accelerator: 'CmdOrCtrl+I', click: send('menu:import') },
        {
          label: 'Synchronizacja z telefonem…',
          click: () => {
            showWindow();
            if (win && !win.isDestroyed()) win.webContents.send('menu:sync');
          }
        },
        { type: 'separator' },
        { label: 'Zamknij', accelerator: 'CmdOrCtrl+W', role: 'close' },
        { label: 'Wyjdź', accelerator: 'Alt+F4', role: 'quit' }
      ]
    },
    {
      label: 'Edycja',
      submenu: [
        { role: 'undo', label: 'Cofnij' },
        { role: 'redo', label: 'Ponów' },
        { type: 'separator' },
        { role: 'cut', label: 'Wytnij' },
        { role: 'copy', label: 'Kopiuj' },
        { role: 'paste', label: 'Wklej' },
        { role: 'selectAll', label: 'Zaznacz wszystko' }
      ]
    },
    {
      label: 'Widok',
      submenu: [
        { role: 'reload', label: 'Odśwież' },
        { role: 'resetZoom', label: 'Zoom 100%' },
        { role: 'zoomIn', label: 'Powiększ' },
        { role: 'zoomOut', label: 'Pomniejsz' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Pełny ekran' },
        { role: 'toggleDevTools', label: 'Narzędzia deweloperskie' }
      ]
    },
    {
      label: 'Pomoc',
      submenu: [
        {
          label: 'Gdzie są moje dane?',
          click: () => dialog.showMessageBox(win, {
            type: 'info',
            title: APP_TITLE,
            message: 'Twoje tablice są zapisywane w pliku:',
            detail: dataFile(),
            buttons: ['OK', 'Skopiuj ścieżkę'],
            defaultId: 0,
            cancelId: 0
          }).then((r) => { if (r.response === 1) shell.writeText(dataFile()); })
        },
        {
          label: 'O programie',
          click: () => dialog.showMessageBox(win, {
            type: 'info',
            title: 'O programie',
            message: APP_TITLE,
            detail: 'Tablice z zadaniami.\n\n' +
              'Karta: kliknij, aby otworzyć.\n' +
              'Przeciąganie: karty między listami i tablicami.\n' +
              'Prawy przycisk myszy: emotki punktacji.\n' +
              'Skróty: Ctrl+K szukaj, Esc zamknij, Enter dodaj.\n\n' +
              'Wersja ' + app.getVersion(),
            buttons: ['OK']
          })
        }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ---------- Start ---------- */

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    showWindow();
  });

  app.whenReady().then(async () => {
    syncHub = createSyncHub({
      dataDir,
      dataFile: dataFile(),
      appVersion: app.getVersion(),
      onStatus: syncStatusChanged,
      onState: syncStateFromPhone
    });
    await syncHub.init();
    applyLoginItem();
    buildMenu();
    createWindow();
    refreshTray();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
      else showWindow();
    });
  });

  app.on('before-quit', () => { isQuitting = true; });
  app.on('window-all-closed', () => {
    if (!keepInTray()) app.quit();
  });
}