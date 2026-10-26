import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, shell } from 'electron';
import squirrelStartup from 'electron-squirrel-startup';
import { parseFile } from 'music-metadata';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { serveMedia } from './desktop/media';
import { createUpdateController } from './desktop/updates';
import { releasePageUrl } from './shared/updates';
import type { Track, UpdateStatus } from './shared/types';

if (squirrelStartup) app.quit();
app.setName('Abner Music');
const customDataDirectory = app.commandLine.getSwitchValue('user-data-dir');
if (customDataDirectory) app.setPath('userData', path.resolve(customDataDirectory));
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'abner-media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
    },
  },
]);

let mainWindow: BrowserWindow | null = null;
let updateStatus: UpdateStatus = {
  state: 'idle',
  message: '检查新版本，查看更新日志并前往 GitHub 下载',
};
let fullBounds: Electron.Rectangle | undefined;
let importing = false;
let updateController: ReturnType<typeof createUpdateController> | undefined;
let records: Array<{ track: Track; file: string }> = [];
const extensions = new Set([
  '.mp3',
  '.wav',
  '.flac',
  '.m4a',
  '.aac',
  '.ogg',
  '.opus',
  '.aiff',
  '.aif',
]);
const catalogPath = () => path.join(app.getPath('userData'), 'library.json');
const appIcon = app.isPackaged
  ? path.join(process.resourcesPath, 'icon.png')
  : path.join(app.getAppPath(), 'build/icon.png');
let saveQueue = Promise.resolve();

function saveCatalog() {
  const snapshot = JSON.stringify(records);
  saveQueue = saveQueue
    .catch(() => undefined)
    .then(async () => {
      await mkdir(app.getPath('userData'), { recursive: true });
      await writeFile(`${catalogPath()}.tmp`, snapshot, 'utf8');
      await rename(`${catalogPath()}.tmp`, catalogPath());
    });
  return saveQueue;
}

function trusted(event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent) {
  if (
    !mainWindow ||
    event.sender !== mainWindow.webContents ||
    event.senderFrame !== mainWindow.webContents.mainFrame
  )
    throw new Error('Untrusted renderer');
}

async function collectFiles(directory: string, output: string[]) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (output.length >= 10000) return;
    if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) await collectFiles(fullPath, output);
    else if (extensions.has(path.extname(entry.name).toLowerCase())) output.push(fullPath);
  }
}

async function importLibrary(folder: boolean) {
  if (!mainWindow || importing) return { tracks: [], skipped: 0 };
  importing = true;
  try {
    const selected = await dialog.showOpenDialog(mainWindow, {
      title: folder ? '导入音乐文件夹（最多 10,000 首）' : '选择音乐文件',
      properties: folder ? ['openDirectory'] : ['openFile', 'multiSelections'],
      filters: [
        { name: 'Audio', extensions: [...extensions].map((extension) => extension.slice(1)) },
      ],
    });
    if (selected.canceled) return { tracks: [], skipped: 0 };
    const files: string[] = [];
    for (const selectedPath of selected.filePaths) {
      if (folder) await collectFiles(selectedPath, files);
      else if (extensions.has(path.extname(selectedPath).toLowerCase())) files.push(selectedPath);
    }
    const tracks: Track[] = [];
    let skipped = 0;
    for (const file of files) {
      if (records.some((record) => record.file === file)) {
        skipped++;
        continue;
      }
      try {
        const metadata = await parseFile(file, { skipCovers: false, duration: true });
        const picture = metadata.common.picture?.[0];
        const artwork =
          picture && picture.data.length < 5_000_000
            ? `data:${picture.format};base64,${Buffer.from(picture.data).toString('base64')}`
            : 'forest';
        const id = randomUUID();
        const lyricsPath = file.slice(0, -path.extname(file).length) + '.lrc';
        const track: Track = {
          id,
          title: metadata.common.title || path.basename(file, path.extname(file)),
          artist: metadata.common.artist || '未知艺术家',
          album: metadata.common.album || '本地音乐',
          duration: metadata.format.duration || 0,
          source: `abner-media://track/${id}`,
          kind: 'local',
          artwork,
          format: path.extname(file).slice(1).toUpperCase(),
          addedAt: Date.now(),
          lyrics: existsSync(lyricsPath)
            ? (await readFile(lyricsPath, 'utf8')).slice(0, 200000)
            : undefined,
        };
        records.push({ track, file });
        tracks.push(track);
      } catch {
        skipped++;
      }
    }
    await saveCatalog();
    return { tracks, skipped };
  } finally {
    importing = false;
  }
}

function configureUpdates() {
  updateController = createUpdateController({
    version: app.getVersion(),
    request: (url, options) => net.fetch(url, options),
    onStatus: (status) => {
      updateStatus = status;
      mainWindow?.webContents.send('app:update-status', status);
    },
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1000,
    minHeight: 720,
    backgroundColor: '#f7f8f2',
    title: 'Abner Music',
    icon: appIcon,
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 22, y: 23 },
    frame: process.platform === 'darwin',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) void mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  else
    void mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
}

if (!squirrelStartup && app.requestSingleInstanceLock()) {
  app.on('second-instance', () => {
    if (mainWindow?.isMinimized()) mainWindow.restore();
    mainWindow?.focus();
  });
  void app.whenReady().then(async () => {
    if (process.platform === 'darwin') {
      app.dock?.setIcon(appIcon);
    }
    try {
      records = JSON.parse(await readFile(catalogPath(), 'utf8'));
    } catch {
      records = [];
    }
    protocol.handle('abner-media', async (request) => {
      const parsed = new URL(request.url);
      const record =
        parsed.hostname === 'track'
          ? records.find((item) => item.track.id === parsed.pathname.slice(1))
          : undefined;
      if (!record || !existsSync(record.file))
        return new Response('File not found', { status: 404 });
      return serveMedia(request, record.file);
    });
    ipcMain.handle('library:list', (event) => {
      trusted(event);
      return records.map((record) => record.track);
    });
    ipcMain.handle('library:import', (event, folder: unknown) => {
      trusted(event);
      return importLibrary(folder === true);
    });
    ipcMain.handle('library:remove', async (event, id: unknown) => {
      trusted(event);
      records = records.filter((record) => record.track.id !== id);
      await saveCatalog();
    });
    ipcMain.handle('app:version', (event) => {
      trusted(event);
      return app.getVersion();
    });
    ipcMain.handle('app:check-update', async (event) => {
      trusted(event);
      return (await updateController?.check()) || updateStatus;
    });
    for (const action of ['minimize', 'maximize', 'close'] as const) {
      ipcMain.on(`window:${action}`, (event) => {
        trusted(event);
        if (action === 'maximize') {
          if (mainWindow?.isMaximized()) mainWindow.unmaximize();
          else mainWindow?.maximize();
        } else mainWindow?.[action]();
      });
    }
    ipcMain.on('window:mini', (event, enabled: unknown) => {
      trusted(event);
      if (!mainWindow || typeof enabled !== 'boolean') return;
      if (enabled) {
        fullBounds = mainWindow.getBounds();
        mainWindow.setMinimumSize(400, 180);
        mainWindow.setSize(430, 208);
        mainWindow.setAlwaysOnTop(true);
      } else {
        mainWindow.setAlwaysOnTop(false);
        if (fullBounds) mainWindow.setBounds(fullBounds);
        mainWindow.setMinimumSize(1000, 720);
      }
    });
    ipcMain.handle('app:open-release', async (event) => {
      trusted(event);
      const release = updateStatus.release;
      if (
        !release ||
        ![releasePageUrl(`v${release.version}`), releasePageUrl(release.version)].includes(
          release.url,
        )
      )
        throw new Error('没有可下载的更新');
      await shell.openExternal(release.url);
    });
    const media = (action: string) => mainWindow?.webContents.send('player:media-key', action);
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        ...(process.platform === 'darwin'
          ? [
              {
                label: 'Abner Music',
                submenu: [
                  { role: 'about' as const },
                  { type: 'separator' as const },
                  { role: 'hide' as const },
                  { role: 'quit' as const },
                ],
              },
            ]
          : []),
        {
          label: '文件',
          submenu: [
            { label: '导入音乐', accelerator: 'CmdOrCtrl+O', click: () => media('import') },
            { role: 'close' },
          ],
        },
        {
          label: '编辑',
          submenu: [
            { role: 'undo' },
            { role: 'redo' },
            { type: 'separator' },
            { role: 'cut' },
            { role: 'copy' },
            { role: 'paste' },
            { role: 'selectAll' },
          ],
        },
        {
          label: '播放',
          submenu: [
            { label: '播放 / 暂停', accelerator: 'MediaPlayPause', click: () => media('toggle') },
            { label: '下一首', accelerator: 'MediaNextTrack', click: () => media('next') },
            { label: '上一首', accelerator: 'MediaPreviousTrack', click: () => media('previous') },
          ],
        },
        {
          label: '视图',
          submenu: [
            { role: 'togglefullscreen' },
            ...(!app.isPackaged ? [{ role: 'toggleDevTools' as const }] : []),
          ],
        },
      ]),
    );
    createWindow();
    configureUpdates();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
} else if (!squirrelStartup) app.quit();

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
