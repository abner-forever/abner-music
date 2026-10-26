import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopBridge, UpdateStatus } from './shared/types';

const bridge: DesktopBridge = {
  platform: process.platform,
  library: {
    list: () => ipcRenderer.invoke('library:list'),
    importFiles: (folder = false) => ipcRenderer.invoke('library:import', folder),
    remove: (id) => ipcRenderer.invoke('library:remove', id),
  },
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
    mini: (enabled) => ipcRenderer.send('window:mini', enabled),
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
