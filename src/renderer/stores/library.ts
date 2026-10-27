import { computed, reactive, watch } from 'vue';
import type { LibraryDownloadRequest, Playlist, Track } from '../../shared/types';
import { demoTracks, validateAudioUrl } from '../lib/music';
import { deleteFile, readState, storeFile } from '../lib/storage';
import { gdTrackId } from '../../shared/gd-music';

interface LibraryState {
  tracks: Track[];
  favorites: string[];
  playlists: Playlist[];
  history: string[];
  lyrics: Record<string, string>;
}

const saved = readState<Partial<LibraryState>>('abner:library', {});
export const demoEnabled = import.meta.env.DEV;
const builtInTracks = demoEnabled ? demoTracks : [];
const availableId = (id: string) => demoEnabled || !id.startsWith('demo-');
export const library = reactive<LibraryState>({
  tracks: [
    ...builtInTracks,
    ...(Array.isArray(saved.tracks) ? saved.tracks.filter((track) => track.kind !== 'demo') : []),
  ],
  favorites: (saved.favorites || (demoEnabled ? ['demo-1', 'demo-3'] : [])).filter(availableId),
  playlists: (
    saved.playlists ||
    (demoEnabled
      ? [
          {
            id: 'playlist-chill',
            name: '给自己的留白',
            description: '忙碌之外，留一点时间给喜欢的声音。',
            artwork: 'forest',
            trackIds: ['demo-1', 'demo-2', 'demo-5'],
          },
          {
            id: 'playlist-night',
            name: '晚风与耳机',
            description: '在夜色里，和自己待一会儿。',
            artwork: 'space',
            trackIds: ['demo-3', 'demo-4', 'demo-6'],
          },
        ]
      : [])
  ).map((playlist) => ({
    ...playlist,
    trackIds: playlist.trackIds.filter(availableId),
  })),
  history: (saved.history || []).filter(availableId),
  lyrics: saved.lyrics || {},
});

export const favoriteTracks = computed(() =>
  library.tracks.filter((track) => library.favorites.includes(track.id)),
);
export const recentTracks = computed(() =>
  library.history
    .map((id) => library.tracks.find((track) => track.id === id))
    .filter((track): track is Track => Boolean(track)),
);

watch(
  library,
  () => {
    try {
      localStorage.setItem(
        'abner:library',
        JSON.stringify({
          ...library,
          tracks: library.tracks.filter(
            (track) => track.kind !== 'demo' && (!window.desktop || track.kind === 'network'),
          ),
        }),
      );
    } catch {
      window.dispatchEvent(
        new CustomEvent('abner:notice', { detail: '存储空间不足，部分更改可能无法在重启后保留' }),
      );
    }
  },
  { deep: true },
);

export function toggleFavorite(id: string) {
  const index = library.favorites.indexOf(id);
  if (index >= 0) library.favorites.splice(index, 1);
  else library.favorites.push(id);
}

export function rememberTrack(id: string) {
  library.history = [id, ...library.history.filter((previous) => previous !== id)].slice(0, 100);
}

export async function initializeLibrary() {
  if (!window.desktop) return;
  const tracks = await window.desktop.library.list();
  library.tracks = [
    ...builtInTracks,
    ...library.tracks.filter((track) => track.kind === 'network'),
    ...tracks,
  ];
}

export async function importMusic(folder = false) {
  if (!window.desktop) throw new Error('请使用文件选择或拖放导入音乐');
  const result = await window.desktop.library.importFiles(folder);
  const known = new Set(library.tracks.map((track) => track.id));
  library.tracks.push(...result.tracks.filter((track) => !known.has(track.id)));
  return result;
}

export async function importBrowserFiles(files: FileList | File[]) {
  const tracks: Track[] = [];
  let skipped = 0;
  for (const file of Array.from(files)) {
    if (!/\.(mp3|wav|flac|m4a|aac|ogg|opus|aiff?)$/i.test(file.name)) {
      skipped++;
      continue;
    }
    const id = crypto.randomUUID();
    await storeFile(id, file);
    tracks.push({
      id,
      title: file.name.replace(/\.[^.]+$/, ''),
      artist: '未知艺术家',
      album: '本地音乐',
      duration: 0,
      source: `indexeddb:${id}`,
      kind: 'local',
      artwork: ['forest', 'ocean', 'sunset'][tracks.length % 3],
      format: file.name.split('.').pop()!.toUpperCase(),
      addedAt: Date.now(),
    });
  }
  library.tracks.push(...tracks);
  return { tracks, skipped };
}

export function addNetworkTrack(url: string, title: string, artist: string) {
  const source = validateAudioUrl(url);
  const existing = library.tracks.find((track) => track.source === source);
  if (existing) return existing;
  const track: Track = {
    id: crypto.randomUUID(),
    title:
      title.trim() || decodeURIComponent(new URL(source).pathname.split('/').pop() || '网络音频'),
    artist: artist.trim() || '网络资源',
    album: '网络音乐',
    source,
    duration: 0,
    artwork: 'ocean',
    format: 'STREAM',
    kind: 'network',
    addedAt: Date.now(),
  };
  library.tracks.push(track);
  return track;
}

export function addRemoteTrack(track: Track) {
  if (!track.remote) throw new Error('音乐源信息缺失，请重新搜索');
  const id = gdTrackId(track.remote);
  const existing = library.tracks.find((item) => item.id === id);
  if (existing) return existing;
  library.tracks.push({ ...track, id, source: id, kind: 'network', addedAt: Date.now() });
  return library.tracks.find((item) => item.id === id)!;
}

export function createPlaylist(name: string) {
  const playlist: Playlist = {
    id: crypto.randomUUID(),
    name: name.trim(),
    description: '每一首，都是心情的注脚。',
    artwork: ['forest', 'sunset', 'ocean', 'space'][library.playlists.length % 4],
    trackIds: [],
  };
  library.playlists.push(playlist);
  return playlist;
}

export async function removeTrack(id: string) {
  const track = library.tracks.find((item) => item.id === id);
  if (!track || track.kind === 'demo') return { fileDeleted: false };
  let fileDeleted = false;
  if (track.kind === 'local') {
    if (window.desktop) fileDeleted = (await window.desktop.library.remove(id)).fileDeleted;
    else {
      await deleteFile(id);
      fileDeleted = true;
    }
  }
  library.tracks = library.tracks.filter((item) => item.id !== id);
  library.favorites = library.favorites.filter((favorite) => favorite !== id);
  library.history = library.history.filter((history) => history !== id);
  for (const playlist of library.playlists)
    playlist.trackIds = playlist.trackIds.filter((trackId) => trackId !== id);
  delete library.lyrics[id];
  return { fileDeleted };
}

/** 用下载好的本地曲目原位替换在线曲目，喜欢、歌单、播放历史一并继承。 */
function inheritTrack(previousId: string, next: Track) {
  const index = library.tracks.findIndex((item) => item.id === previousId);
  if (index >= 0) library.tracks.splice(index, 1, next);
  else library.tracks.push(next);
  library.favorites = [
    ...new Set(library.favorites.map((id) => (id === previousId ? next.id : id))),
  ];
  library.history = [...new Set(library.history.map((id) => (id === previousId ? next.id : id)))];
  for (const playlist of library.playlists)
    playlist.trackIds = [
      ...new Set(playlist.trackIds.map((id) => (id === previousId ? next.id : id))),
    ];
  if (library.lyrics[previousId]) {
    library.lyrics[next.id] = library.lyrics[previousId];
    delete library.lyrics[previousId];
  }
}

/** 把在线歌曲下载进本地音乐库（含歌词），成功后替换原在线曲目。 */
export async function downloadToLibrary(track: Track) {
  if (!window.desktop) throw new Error('下载到本地需要在桌面应用中操作');
  if (!track.remote && !/^https?:\/\//i.test(track.source))
    throw new Error('这首歌没有可下载的地址');
  const request: LibraryDownloadRequest = {
    quality: 320,
    suggestedName: `${track.artist} - ${track.title}`,
    format: track.format,
    title: track.title,
    artist: track.artist,
    album: track.album === '网络音乐' ? '' : track.album,
  };
  if (track.remote) request.remote = { ...track.remote };
  else request.url = track.source;
  const downloaded = await window.desktop.library.download(request);
  inheritTrack(track.id, downloaded);
  return downloaded;
}
