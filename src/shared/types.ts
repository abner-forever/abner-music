export type MusicPlatform = 'netease' | 'joox' | 'bilibili';
export type MusicQuality = 128 | 192 | 320 | 740 | 999;

export interface GdMusicReference {
  provider: 'gd';
  platform: MusicPlatform;
  trackId: string;
  pictureId?: string;
  lyricId?: string;
}

export interface MusicSearch {
  platform: MusicPlatform;
  keyword: string;
  page: number;
}

export interface MusicResolution {
  remote: GdMusicReference;
  quality: MusicQuality;
  refresh?: boolean;
}

export interface MusicLyrics {
  lyric: string;
  translation: string;
}

export interface AudioDownloadRequest {
  remote: GdMusicReference;
  quality: MusicQuality;
  suggestedName: string;
  format: string;
}

export interface AudioDownloadResult {
  saved: boolean;
  fileName?: string;
  lyricsSaved?: boolean;
}

/** 把在线歌曲下载成本地音乐库曲目；remote 与 url 二选一。 */
export interface LibraryDownloadRequest {
  remote?: GdMusicReference;
  url?: string;
  quality: MusicQuality;
  suggestedName: string;
  format: string;
  title?: string;
  artist?: string;
  album?: string;
}

export interface LibraryRemoveResult {
  fileDeleted: boolean;
}

export interface LibraryStorageInfo {
  directory: string;
  defaultDirectory: string;
  isDefault: boolean;
}

export interface MusicBridge {
  search(input: MusicSearch, requestId: string): Promise<Track[]>;
  resolve(input: MusicResolution, requestId: string): Promise<{ url: string; quality: number }>;
  picture(remote: GdMusicReference, requestId: string): Promise<string>;
  lyrics(remote: GdMusicReference, requestId: string): Promise<MusicLyrics>;
  cancel(requestId: string): void;
}

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  source: string;
  kind: 'demo' | 'local' | 'network';
  artwork: string;
  format: string;
  addedAt: number;
  lyrics?: string;
  translatedLyrics?: string;
  remote?: GdMusicReference;
  /** 由在线歌曲下载而来的本地文件，删除时会一并移除磁盘文件。 */
  downloaded?: boolean;
}

export interface Playlist {
  id: string;
  name: string;
  description: string;
  artwork: string;
  trackIds: string[];
}

export interface ReleaseInfo {
  version: string;
  title: string;
  notes: string;
  publishedAt: string;
  url: string;
}

export interface UpdateStatus {
  state: 'idle' | 'checking' | 'available' | 'error';
  message: string;
  release?: ReleaseInfo;
}

export interface DesktopBridge {
  platform: string;
  music: MusicBridge;
  download?: {
    audio(input: AudioDownloadRequest): Promise<AudioDownloadResult>;
  };
  library: {
    list(): Promise<Track[]>;
    importFiles(folder?: boolean): Promise<{ tracks: Track[]; skipped: number }>;
    remove(id: string): Promise<LibraryRemoveResult>;
    download(input: LibraryDownloadRequest): Promise<Track>;
    storage(): Promise<LibraryStorageInfo>;
    chooseStorage(): Promise<LibraryStorageInfo>;
    openStorage(): Promise<void>;
    reveal(id: string): Promise<void>;
  };
  window: {
    minimize(): void;
    maximize(): void;
    close(): void;
    mini(enabled: boolean): void;
    isMaximized(): Promise<boolean>;
    onMaximized(callback: (maximized: boolean) => void): () => void;
  };
  app: {
    quit(): void;
    version(): Promise<string>;
    checkUpdate(): Promise<UpdateStatus>;
    openRelease(): Promise<void>;
    onUpdate(callback: (status: UpdateStatus) => void): () => void;
    onMediaKey(callback: (action: string) => void): () => void;
  };
}

declare global {
  interface Window {
    desktop?: DesktopBridge;
  }
  const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
  const MAIN_WINDOW_VITE_NAME: string;
}
