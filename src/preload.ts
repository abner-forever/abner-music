import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopBridge, UpdateStatus } from './shared/types';

const bridge: DesktopBridge = {
  platform: process.platform,
  music: {
    search: (input, requestId) => ipcRenderer.invoke('music:search', input, requestId),
    resolve: (input, requestId) => ipcRenderer.invoke('music:resolve', input, requestId),
    picture: (remote, requestId) => ipcRenderer.invoke('music:picture', remote, requestId),
    lyrics: (remote, requestId) => ipcRenderer.invoke('music:lyrics', remote, requestId),
    cancel: (requestId) => ipcRenderer.send('music:cancel', requestId),
  },
  download: {
    audio: (input) => ipcRenderer.invoke('download:audio', input),
  },
  library: {
    list: () => ipcRenderer.invoke('library:list'),
    importFiles: (folder = false) => ipcRenderer.invoke('library:import', folder),
    remove: (id) => ipcRenderer.invoke('library:remove', id),
    download: (input) => ipcRenderer.invoke('library:download', input),
    storage: () => ipcRenderer.invoke('library:storage'),
    chooseStorage: () => ipcRenderer.invoke('library:storage:choose'),
    openStorage: () => ipcRenderer.invoke('library:storage:open'),
    reveal: (id) => ipcRenderer.invoke('library:reveal', id),
  },
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
    mini: (enabled) => ipcRenderer.send('window:mini', enabled),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
    onMaximized: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, maximized: boolean) =>
        callback(maximized);
      ipcRenderer.on('window:maximized', listener);
      return () => ipcRenderer.removeListener('window:maximized', listener);
    },
  },
  app: {
    quit: () => ipcRenderer.send('app:quit'),
    version: () => ipcRenderer.invoke('app:version'),
    checkUpdate: () => ipcRenderer.invoke('app:check-update'),
    openRelease: () => ipcRenderer.invoke('app:open-release'),
    onUpdate: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, status: UpdateStatus) =>
        callback(status);
      ipcRenderer.on('app:update-status', listener);
      return () => ipcRenderer.removeListener('app:update-status', listener);
    },
    onMediaKey: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, action: string) => callback(action);
      ipcRenderer.on('player:media-key', listener);
      return () => ipcRenderer.removeListener('player:media-key', listener);
    },
  },
};

contextBridge.exposeInMainWorld('desktop', bridge);
