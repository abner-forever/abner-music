import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  net,
  protocol,
  shell,
  Tray,
} from 'electron';
import squirrelStartup from 'electron-squirrel-startup';
import { parseFile } from 'music-metadata';
import { randomUUID } from 'node:crypto';
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { serveMedia } from './desktop/media';
import { createUpdateController } from './desktop/updates';
import { createGdMusicController } from './desktop/gd-music';
import { downloadFileInfo, uniqueFileName } from './desktop/download';
import { releasePageUrl } from './shared/updates';
import type {
  AudioDownloadRequest,
  GdMusicReference,
  LibraryDownloadRequest,
  LibraryRemoveResult,
  LibraryStorageInfo,
  Track,
  UpdateStatus,
} from './shared/types';

if (squirrelStartup) app.quit();
app.setName('Abner Music');
if (process.platform === 'win32') app.setAppUserModelId('com.abner.music');
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
let tray: Tray | null = null;
let menuBarWidth = 0;
let quitting = false;
let updateStatus: UpdateStatus = {
  state: 'idle',
  message: '检查新版本，查看更新日志并前往 GitHub 下载',
};
let fullBounds: Electron.Rectangle | undefined;
let importing = false;
let updateController: ReturnType<typeof createUpdateController> | undefined;
let musicController: ReturnType<typeof createGdMusicController> | undefined;
let records: Array<{ track: Track; file: string; managed?: string }> = [];
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
const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');
const defaultDownloadsDirectory = () => path.join(app.getPath('userData'), 'downloads');
let appSettings: { downloadDirectory?: string } = {};
const downloadsDirectory = () => appSettings.downloadDirectory || defaultDownloadsDirectory();

async function loadSettings() {
  try {
    const parsed = JSON.parse(await readFile(settingsPath(), 'utf8')) as {
      downloadDirectory?: unknown;
    };
    appSettings =
      typeof parsed?.downloadDirectory === 'string' && parsed.downloadDirectory
        ? { downloadDirectory: path.resolve(parsed.downloadDirectory) }
        : {};
  } catch {
    appSettings = {};
  }
}

async function saveSettings() {
  const snapshot = JSON.stringify(appSettings);
  await mkdir(app.getPath('userData'), { recursive: true });
  await writeFile(`${settingsPath()}.tmp`, snapshot, 'utf8');
  await rename(`${settingsPath()}.tmp`, settingsPath());
}

function storageInfo(): LibraryStorageInfo {
  return {
    directory: downloadsDirectory(),
    defaultDirectory: defaultDownloadsDirectory(),
    isDefault: !appSettings.downloadDirectory,
  };
}
const appIcon = app.isPackaged
  ? path.join(process.resourcesPath, 'icon.png')
  : path.join(app.getAppPath(), 'build/icon.png');
let saveQueue = Promise.resolve();
const maxDownloadBytes = 500 * 1024 * 1024;

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

function validateDownloadRequest(value: unknown): AudioDownloadRequest {
  if (!value || typeof value !== 'object') throw new Error('下载参数无效');
  const input = value as Partial<AudioDownloadRequest>;
  if (
    !input.remote ||
    input.remote.provider !== 'gd' ||
    !['netease', 'joox', 'bilibili'].includes(input.remote.platform) ||
    typeof input.remote.trackId !== 'string' ||
    !input.remote.trackId ||
    ![128, 192, 320, 740, 999].includes(Number(input.quality)) ||
    typeof input.suggestedName !== 'string' ||
    !input.suggestedName.trim() ||
    input.suggestedName.length > 240 ||
    typeof input.format !== 'string' ||
    input.format.length > 20
  )
    throw new Error('下载参数无效');
  return {
    remote: {
      provider: 'gd',
      platform: input.remote.platform,
      trackId: input.remote.trackId,
      pictureId: input.remote.pictureId,
      lyricId: input.remote.lyricId,
    },
    quality: input.quality as AudioDownloadRequest['quality'],
    suggestedName: input.suggestedName.trim(),
    format: input.format,
  };
}

const downloadLyricsPath = (file: string) => file.slice(0, -path.extname(file).length) + '.lrc';

async function saveRemoteAudio(url: string, destination: string) {
  const temporary = destination + '.' + randomUUID() + '.download';
  try {
    const response = await net.fetch(url, {
      headers: { Accept: 'audio/*,application/octet-stream;q=0.9,*/*;q=0.5' },
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok || !response.body) throw new Error('音乐源返回 ' + response.status);
    const contentType = response.headers.get('content-type')?.toLowerCase() || '';
    if (contentType.startsWith('text/')) throw new Error('音乐源没有返回音频文件');
    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > maxDownloadBytes) throw new Error('音频文件超过 500 MB');
    await pipeline(
      Readable.fromWeb(response.body as import('node:stream/web').ReadableStream<Uint8Array>),
      createWriteStream(temporary, { flags: 'wx' }),
    );
    try {
      await rename(temporary, destination);
    } catch (error) {
      if (!['EEXIST', 'EPERM'].includes((error as NodeJS.ErrnoException).code || '')) throw error;
      await unlink(destination);
      await rename(temporary, destination);
    }
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    if (error instanceof Error && error.name === 'TimeoutError')
      throw new Error('下载超时，请稍后重试');
    throw error instanceof Error ? error : new Error('下载失败');
  }
}

async function fetchRemoteLyrics(remote?: GdMusicReference) {
  if (!remote || !musicController) return '';
  try {
    const lyrics = await musicController.client.lyrics(remote);
    return (lyrics.lyric || '').trim().slice(0, 200_000);
  } catch {
    return '';
  }
}

async function saveRemoteLyrics(file: string, remote?: GdMusicReference) {
  const lyrics = await fetchRemoteLyrics(remote);
  if (!lyrics) return '';
  const target = downloadLyricsPath(file);
  try {
    await writeFile(target, lyrics, 'utf8');
    return target;
  } catch {
    return '';
  }
}

async function fetchRemoteArtwork(remote?: GdMusicReference) {
  if (!remote || !musicController) return '';
  try {
    const url = await musicController.client.picture(remote);
    if (!url) return '';
    const response = await net.fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) return '';
    const type = (response.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
    if (!type.startsWith('image/')) return '';
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > 1_500_000) return '';
    return `data:${type};base64,${buffer.toString('base64')}`;
  } catch {
    return '';
  }
}

async function downloadRemoteAudio(value: unknown) {
  if (!mainWindow || !musicController) throw new Error('下载服务尚未就绪');
  const request = validateDownloadRequest(value);
  const resolution = await musicController.client.resolve({
    remote: request.remote,
    quality: request.quality,
    refresh: true,
  });
  const source = new URL(resolution.url);
  if (!['http:', 'https:'].includes(source.protocol) || source.username || source.password)
    throw new Error('下载地址无效');
  const file = downloadFileInfo(request, resolution.url);
  const selected = await dialog.showSaveDialog(mainWindow, {
    title: '下载在线音乐',
    defaultPath: path.join(app.getPath('music'), file.fileName),
    buttonLabel: '下载',
    filters: [
      { name: '音频文件', extensions: [file.extension] },
      { name: '所有文件', extensions: ['*'] },
    ],
  });
  if (selected.canceled || !selected.filePath) return { saved: false };
  const destination = path.extname(selected.filePath)
    ? selected.filePath
    : selected.filePath + '.' + file.extension;
  await saveRemoteAudio(resolution.url, destination);
  const lyricsFile = await saveRemoteLyrics(destination, request.remote);
  return {
    saved: true,
    fileName: path.basename(destination),
    lyricsSaved: Boolean(lyricsFile),
  };
}

function validateLibraryDownload(value: unknown): LibraryDownloadRequest {
  if (!value || typeof value !== 'object') throw new Error('下载参数无效');
  const input = value as Partial<LibraryDownloadRequest>;
  const text = (item: unknown, limit = 240) =>
    typeof item === 'string' ? item.trim().slice(0, limit) : '';
  const remote =
    input.remote && typeof input.remote === 'object' && input.remote.provider === 'gd'
      ? {
          provider: 'gd' as const,
          platform: input.remote.platform,
          trackId: text(input.remote.trackId, 200),
          pictureId: input.remote.pictureId ? text(input.remote.pictureId, 200) : undefined,
          lyricId: input.remote.lyricId ? text(input.remote.lyricId, 200) : undefined,
        }
      : undefined;
  const url = text(input.url, 2_000);
  if (
    (remote && (!['netease', 'joox', 'bilibili'].includes(remote.platform) || !remote.trackId)) ||
    (!remote && !/^https?:\/\//i.test(url)) ||
    ![128, 192, 320, 740, 999].includes(Number(input.quality)) ||
    !text(input.suggestedName) ||
    typeof input.format !== 'string' ||
    input.format.length > 20
  )
    throw new Error('下载参数无效');
  const request: LibraryDownloadRequest = {
    quality: input.quality as LibraryDownloadRequest['quality'],
    suggestedName: text(input.suggestedName) || '在线音乐',
    format: input.format.trim(),
    title: text(input.title, 200),
    artist: text(input.artist, 200),
    album: text(input.album, 200),
  };
  if (remote) request.remote = remote;
  else request.url = url;
  return request;
}

async function downloadRemoteToLibrary(value: unknown) {
  const request = validateLibraryDownload(value);
  let url = request.url || '';
  if (request.remote) {
    if (!musicController) throw new Error('下载服务尚未就绪');
    const resolution = await musicController.client.resolve({
      remote: request.remote,
      quality: request.quality,
      refresh: true,
    });
    url = resolution.url;
  }
  const source = new URL(url);
  if (!['http:', 'https:'].includes(source.protocol) || source.username || source.password)
    throw new Error('下载地址无效');
  const directory = downloadsDirectory();
  await mkdir(directory, { recursive: true });
  const info = downloadFileInfo(request, url);
  const fileName = uniqueFileName(info.fileName, (name) => existsSync(path.join(directory, name)));
  const destination = path.join(directory, fileName);
  await saveRemoteAudio(url, destination);
  let lyrics = '';
  if (request.remote) {
    lyrics = await fetchRemoteLyrics(request.remote);
    if (lyrics)
      await writeFile(downloadLyricsPath(destination), lyrics, 'utf8').catch(() => undefined);
  }
  const artwork = (await fetchRemoteArtwork(request.remote)) || 'forest';
  let duration = 0;
  try {
    const metadata = await parseFile(destination, { skipCovers: true, duration: true });
    duration = metadata.format.duration || 0;
  } catch {
    duration = 0;
  }
  const id = randomUUID();
  const track: Track = {
    id,
    title: (request.title || '').trim() || path.basename(fileName, path.extname(fileName)),
    artist: (request.artist || '').trim() || '未知艺术家',
    album: (request.album || '').trim() || '本地音乐',
    duration,
    source: `abner-media://track/${id}`,
    kind: 'local',
    artwork,
    format: info.extension.toUpperCase(),
    addedAt: Date.now(),
    downloaded: true,
    ...(lyrics ? { lyrics } : {}),
  };
  records.push({ track, file: destination, managed: directory });
  await saveCatalog();
  return track;
}

async function removeLibraryTrack(id: unknown): Promise<LibraryRemoveResult> {
  if (typeof id !== 'string') throw new Error('曲目 ID 无效');
  const record = records.find((item) => item.track.id === id);
  records = records.filter((item) => item.track.id !== id);
  let fileDeleted = false;
  if (record) {
    const roots = [record.managed, downloadsDirectory(), defaultDownloadsDirectory()].filter(
      (root): root is string => typeof root === 'string' && root.length > 0,
    );
    const file = path.resolve(record.file);
    // 只清理应用自己下载下来的文件，用户手动导入的音乐保持原样。
    const managed = record.track.downloaded === true || Boolean(record.managed);
    const insideDownloads = roots.some((root) => {
      const relative = path.relative(path.resolve(root), file);
      return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
    });
    if (managed && insideDownloads) {
      await unlink(file).catch(() => undefined);
      await unlink(downloadLyricsPath(file)).catch(() => undefined);
      fileDeleted = !existsSync(file);
    }
  }
  await saveCatalog();
  return { fileDeleted };
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

function showWindow() {
  if (!mainWindow) createWindow();
  if (mainWindow?.isMinimized()) mainWindow.restore();
  mainWindow?.show();
  mainWindow?.focus();
}

function createTray() {
  const size = process.platform === 'darwin' ? 18 : 16;
  tray = new Tray(nativeImage.createFromPath(appIcon).resize({ width: size, height: size }));
  tray.setToolTip('Abner Music');
  const trayMenu = Menu.buildFromTemplate([
    { label: '打开 Abner Music', click: showWindow },
    { type: 'separator' },
    {
      label: '播放 / 暂停',
      click: () => mainWindow?.webContents.send('player:media-key', 'toggle'),
    },
    { label: '下一首', click: () => mainWindow?.webContents.send('player:media-key', 'next') },
    {
      label: '上一首',
      click: () => mainWindow?.webContents.send('player:media-key', 'previous'),
    },
    { type: 'separator' },
    { label: '退出 Abner Music', click: () => app.quit() },
  ]);
  if (process.platform === 'darwin') {
    tray.setIgnoreDoubleClickEvents(true);
    tray.on('right-click', () => tray?.popUpContextMenu(trayMenu));
    tray.on('click', (_event, bounds, position) => {
      // macOS supplies locationInWindow.x, not a global screen coordinate.
      const x = position.x - (bounds.width - menuBarWidth) / 2;
      const controls = menuBarWidth - 110;
      const index = Math.floor((x - controls) / 28);
      if (menuBarWidth && x >= controls && index >= 0 && index < 3) {
        mainWindow?.webContents.send('player:media-key', ['previous', 'toggle', 'next'][index]);
      } else if (menuBarWidth && x >= controls + 84 && x < menuBarWidth) showWindow();
    });
  } else {
    tray.setContextMenu(trayMenu);
    tray.on('click', showWindow);
    tray.on('double-click', showWindow);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: process.platform === 'darwin' ? 1200 : 1440,
    height: process.platform === 'darwin' ? 800 : 960,
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
      backgroundThrottling: false,
    },
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  const sendMaximized = () => {
    if (!mainWindow) return;
    mainWindow.webContents.send('window:maximized', mainWindow.isMaximized());
  };
  mainWindow.on('maximize', sendMaximized);
  mainWindow.on('unmaximize', sendMaximized);
  mainWindow.webContents.on('did-finish-load', sendMaximized);
  mainWindow.on('close', (event) => {
    if (quitting) return;
    event.preventDefault();
    mainWindow?.hide();
  });
  mainWindow.on('closed', () => {
    musicController?.dispose();
    mainWindow = null;
  });
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) void mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  else
    void mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
}

if (!squirrelStartup && app.requestSingleInstanceLock()) {
  void app.whenReady().then(async () => {
    if (process.platform === 'darwin') {
      app.dock?.setIcon(appIcon);
    }
    try {
      records = JSON.parse(await readFile(catalogPath(), 'utf8'));
    } catch {
      records = [];
    }
    await loadSettings();
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
    const music = createGdMusicController((url, init) => net.fetch(url, init));
    musicController = music;
    for (const method of ['search', 'resolve', 'picture', 'lyrics'] as const) {
      ipcMain.handle(`music:${method}`, (event, input, requestId: unknown) => {
        trusted(event);
        return music.run<unknown>(requestId, (signal) => music.client[method](input, signal));
      });
    }
    ipcMain.on('music:cancel', (event, requestId: unknown) => {
      trusted(event);
      music.cancel(requestId);
    });
    ipcMain.handle('download:audio', (event, input: unknown) => {
      trusted(event);
      return downloadRemoteAudio(input);
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
      return removeLibraryTrack(id);
    });
    ipcMain.handle('library:download', (event, input: unknown) => {
      trusted(event);
      return downloadRemoteToLibrary(input);
    });
    ipcMain.handle('library:storage', (event) => {
      trusted(event);
      return storageInfo();
    });
    ipcMain.handle('library:storage:choose', async (event) => {
      trusted(event);
      if (!mainWindow) throw new Error('窗口尚未就绪');
      const selected = await dialog.showOpenDialog(mainWindow, {
        title: '选择下载保存位置',
        defaultPath: downloadsDirectory(),
        buttonLabel: '使用此文件夹',
        properties: ['openDirectory', 'createDirectory'],
      });
      if (selected.canceled || !selected.filePaths[0]) return storageInfo();
      const directory = path.resolve(selected.filePaths[0]);
      appSettings = { ...appSettings, downloadDirectory: directory };
      await saveSettings();
      await mkdir(directory, { recursive: true }).catch(() => undefined);
      return storageInfo();
    });
    ipcMain.handle('library:storage:open', async (event) => {
      trusted(event);
      const directory = downloadsDirectory();
      await mkdir(directory, { recursive: true }).catch(() => undefined);
      const failure = await shell.openPath(directory);
      if (failure) throw new Error(failure);
    });
    ipcMain.handle('library:reveal', (event, id: unknown) => {
      trusted(event);
      if (typeof id !== 'string') throw new Error('曲目 ID 无效');
      const record = records.find((item) => item.track.id === id);
      if (!record || !existsSync(record.file)) throw new Error('找不到这首歌的文件了');
      shell.showItemInFolder(record.file);
    });
    ipcMain.handle('app:version', (event) => {
      trusted(event);
      return app.getVersion();
    });
    ipcMain.on('app:quit', (event) => {
      trusted(event);
      app.quit();
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
    ipcMain.handle('window:is-maximized', (event) => {
      trusted(event);
      return Boolean(mainWindow?.isMaximized());
    });
    ipcMain.on('player:menu-bar-lyrics', (event, value: unknown) => {
      trusted(event);
      if (process.platform !== 'darwin' || !value || typeof value !== 'object') return;
      const state = value as { image?: unknown; width?: unknown; lyric?: unknown };
      if (
        typeof state.image !== 'string' ||
        state.image.length > 100000 ||
        !state.image.startsWith('data:image/png;base64,') ||
        typeof state.width !== 'number' ||
        !Number.isInteger(state.width) ||
        state.width < 110 ||
        state.width > 342 ||
        typeof state.lyric !== 'string'
      )
        return;
      const image = nativeImage.createEmpty();
      image.addRepresentation({ dataURL: state.image, scaleFactor: 2 });
      if (image.isEmpty() || image.getSize().width !== state.width || image.getSize().height !== 22)
        return;
      image.setTemplateImage(true);
      menuBarWidth = state.width;
      tray?.setImage(image);
      tray?.setToolTip(
        `Abner Music · 上一首 / 播放或暂停 / 下一首${state.lyric ? ' · ' + state.lyric.slice(0, 500) : ''}`,
      );
    });
    ipcMain.on('window:mini', (event, enabled: unknown) => {
      trusted(event);
      if (!mainWindow || typeof enabled !== 'boolean') return;
      if (enabled) {
        fullBounds = mainWindow.getBounds();
        mainWindow.setMinimumSize(340, 148);
        mainWindow.setSize(360, 156);
        if (process.platform === 'darwin') mainWindow.setWindowButtonPosition({ x: 12, y: 10 });
        mainWindow.setAlwaysOnTop(true);
      } else {
        mainWindow.setAlwaysOnTop(false);
        if (process.platform === 'darwin') mainWindow.setWindowButtonPosition({ x: 22, y: 23 });
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
            ...(process.platform === 'darwin' ? [] : [{ role: 'quit' as const }]),
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
    createTray();
    configureUpdates();
    app.on('second-instance', showWindow);
    app.on('activate', showWindow);
  });
} else if (!squirrelStartup) app.quit();

app.on('before-quit', () => {
  quitting = true;
});
app.on('will-quit', () => {
  tray?.destroy();
  tray = null;
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
