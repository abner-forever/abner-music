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
  library: {
    list(): Promise<Track[]>;
    importFiles(folder?: boolean): Promise<{ tracks: Track[]; skipped: number }>;
    remove(id: string): Promise<void>;
  };
  window: { minimize(): void; maximize(): void; close(): void; mini(enabled: boolean): void };
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
