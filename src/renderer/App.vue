<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch, type Component } from 'vue';
import {
  ArrowDownToLine,
  ArrowRight,
  AudioLines,
  Camera,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  Folder,
  FolderOpen,
  Headphones,
  Heart,
  Info,
  LayoutGrid,
  Link2,
  ListMusic,
  LoaderCircle,
  Maximize2,
  Minus,
  Music2,
  Palette,
  Pause,
  Play,
  Plus,
  Search,
  Settings2,
  Shuffle,
  SlidersHorizontal,
  Timer,
  Trash2,
  X,
} from '@lucide/vue';
import type { LibraryStorageInfo, MusicPlatform, Track, UpdateStatus } from '../shared/types';
import packageInfo from '../../package.json';
import AppSelect from './components/AppSelect.vue';
import CoverArt from './components/CoverArt.vue';
import TrackTable from './components/TrackTable.vue';
import PlayerBar from './components/PlayerBar.vue';
import WindowControls from './components/WindowControls.vue';
import OnlineMusic from './components/OnlineMusic.vue';
import { collections, formatTime, parseLyrics } from './lib/music';
import { readPlaylistArtwork } from './lib/artwork';
import { readState } from './lib/storage';
import {
  addNetworkTrack,
  createPlaylist,
  demoEnabled,
  downloadToLibrary,
  favoriteTracks,
  importBrowserFiles,
  importMusic,
  initializeLibrary,
  library,
  recentTracks,
  removeTrack,
  toggleFavorite,
} from './stores/library';
import {
  addToQueue,
  currentTrack,
  nextTrack,
  playTrack,
  player,
  previousTrack,
  queueTracks,
  removeFromQueue,
  replaceQueueTrack,
  seek,
  setEqualizer,
  setSleepTimer,
  stopPlayback,
  togglePlay,
} from './stores/player';

const window = globalThis.window;
type Modal =
  | ''
  | 'network'
  | 'playlist'
  | 'add-playlist'
  | 'settings'
  | 'update'
  | 'equalizer'
  | 'timer'
  | 'edit-lyrics'
  | 'delete-playlist';
const page = ref('discover');
const search = ref('');
const filter = ref('all');
const networkTab = ref('library');
const sort = ref('default');
const modal = ref<Modal>('');
const queueOpen = ref(false);
const lyricsOpen = ref(false);
const mini = ref(false);
const importing = ref(false);
const dragging = ref(false);
const notice = ref('');
const formError = ref('');
const networkUrl = ref('');
const networkTitle = ref('');
const networkArtist = ref('');
const playlistName = ref('');
const lyricDraft = ref('');
const selectedTrack = ref<Track>();
const downloadingTrack = ref('');
const contextMenu = ref<{ track: Track; x: number; y: number }>();
const fileInput = ref<HTMLInputElement>();
const coverInput = ref<HTMLInputElement>();
const changingCover = ref(false);
const searchInput = ref<HTMLInputElement>();
const importMenu = ref(false);
const version = ref(packageInfo.version);
const openingRelease = ref(false);
const update = ref<UpdateStatus>({
  state: 'idle',
  message: window.desktop
    ? '检查新版本，查看更新日志并前往 GitHub 下载'
    : '浏览器预览模式；请在桌面应用中检查更新',
});
const releaseDate = computed(() => {
  const date = new Date(update.value.release?.publishedAt || '');
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString('zh-CN') : '';
});
const preferences = ref(
  readState<{
    theme: 'light' | 'dark' | 'system';
    showDemos: boolean;
    sidebarWidth: number;
    sidebarCompact: boolean;
  }>('abner:preferences', {
    theme: 'system',
    showDemos: demoEnabled,
    sidebarWidth: 218,
    sidebarCompact: false,
  }),
);
const sidebarWidth = ref(
  Math.min(380, Math.max(150, Number(preferences.value.sidebarWidth) || 218)),
);
const sidebarCompact = ref(Boolean(preferences.value.sidebarCompact));
const sidebarElement = ref<HTMLElement>();
const sidebarStyle = computed(
  () => `--sidebar-width: ${sidebarCompact.value ? 68 : sidebarWidth.value}px`,
);
let resizingSidebar = false;
type SettingsTab = 'appearance' | 'playback' | 'storage' | 'window' | 'about';
const settingsTab = ref<SettingsTab>('appearance');
const systemAppearance = window.matchMedia('(prefers-color-scheme: dark)');
const systemDark = ref(systemAppearance.matches);
const resolvedTheme = computed(() =>
  preferences.value.theme === 'system'
    ? systemDark.value
      ? 'dark'
      : 'light'
    : preferences.value.theme,
);
const now = new Date();
const dateLabel = `${String(now.getMonth() + 1).padStart(2, '0')} / ${String(now.getDate()).padStart(2, '0')} · ${['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][now.getDay()]}`;
let noticeTimeout: ReturnType<typeof setTimeout>;
const cleanup: Array<() => void> = [];
const navigationHistory = ref(['discover']);
const historyIndex = ref(0);
const isDesktop = Boolean(window.desktop);
const desktop = window.desktop;
const platform = window.desktop?.platform || 'browser';
const settingsTabs: Array<{ value: SettingsTab; label: string; icon: Component }> = [
  { value: 'appearance', label: '外观', icon: Palette },
  { value: 'playback', label: '播放', icon: Headphones },
  ...(isDesktop ? [{ value: 'storage' as const, label: '存储', icon: Folder }] : []),
  ...(isDesktop ? [{ value: 'window' as const, label: '窗口', icon: Maximize2 }] : []),
  { value: 'about', label: '关于', icon: Info },
];
const storage = ref<LibraryStorageInfo>();
const showDemos = computed(() => demoEnabled && preferences.value.showDemos);
const allTracks = computed(() =>
  library.tracks.filter((track) => showDemos.value || track.kind !== 'demo'),
);
const matchingTracks = computed(() => {
  const query = search.value.toLocaleLowerCase().trim();
  return allTracks.value.filter((track) =>
    `${track.title} ${track.artist} ${track.album}`.toLocaleLowerCase().includes(query),
  );
});
const submittedSearch = ref('');
const searchRevision = ref(0);
const searchPlatform = ref<MusicPlatform>('netease');
const searchOnline = computed(() => Boolean(submittedSearch.value));
watch(search, () => {
  submittedSearch.value = '';
});
function submitOnlineSearch(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229 || !search.value.trim()) return;
  event.preventDefault();
  submittedSearch.value = search.value.trim();
  searchRevision.value++;
}
const selectedPlaylist = computed(() =>
  library.playlists.find((playlist) => `playlist:${playlist.id}` === page.value),
);
const selectedCollection = computed(() =>
  collections.find((collection) => `collection:${collection.id}` === page.value),
);
const title = computed(() =>
  search.value.trim()
    ? '搜索结果'
    : selectedPlaylist.value?.name ||
      selectedCollection.value?.name ||
      {
        library: '我的音乐',
        favorites: '我喜欢的音乐',
        recent: '最近播放',
        network: '网络音乐',
        playlists: '我的歌单',
        discover: '发现音乐',
      }[page.value] ||
      '我的音乐',
);
const pageTracks = computed(() => {
  let tracks = allTracks.value;
  if (search.value.trim()) {
    tracks = matchingTracks.value;
  } else if (page.value === 'favorites')
    tracks = favoriteTracks.value.filter((track) => allTracks.value.includes(track));
  else if (page.value === 'recent')
    tracks = recentTracks.value.filter((track) => allTracks.value.includes(track));
  else if (page.value === 'network') tracks = tracks.filter((track) => track.kind === 'network');
  else if (selectedPlaylist.value || selectedCollection.value) {
    const ids = (selectedPlaylist.value || selectedCollection.value)!.trackIds;
    tracks = ids
      .map((id) => allTracks.value.find((track) => track.id === id))
      .filter((track): track is Track => Boolean(track));
  }
  if (!search.value.trim() && filter.value !== 'all')
    tracks = tracks.filter((track) => track.kind === filter.value);
  if (sort.value === 'title')
    tracks = [...tracks].sort((first, second) => first.title.localeCompare(second.title, 'zh-CN'));
  else if (sort.value === 'duration')
    tracks = [...tracks].sort((first, second) => second.duration - first.duration);
  else if (sort.value === 'added')
    tracks = [...tracks].sort((first, second) => second.addedAt - first.addedAt);
  return tracks;
});
const discoveryTracks = computed(() =>
  (recentTracks.value.length ? recentTracks.value : allTracks.value)
    .filter((track) => allTracks.value.includes(track))
    .slice(0, 4),
);
const localCount = computed(() => library.tracks.filter((track) => track.kind === 'local').length);
const lyricsValue = computed(() =>
  currentTrack.value
    ? library.lyrics[currentTrack.value.id] || currentTrack.value.lyrics || ''
    : '',
);
const lyricLines = computed(() => parseLyrics(lyricsValue.value));
const activeLyric = computed(() => {
  let index = -1;
  lyricLines.value.forEach((line, lineIndex) => {
    if (line.time <= player.currentTime) index = lineIndex;
  });
  return index;
});
const lyricContainer = ref<HTMLElement>();
const queueDuration = computed(() =>
  queueTracks.value.reduce((total, track) => total + track.duration, 0),
);
const equalizerPresets: Record<string, number[]> = {
  原声: [0, 0, 0, 0, 0, 0],
  流行: [2, 1, -1, 2, 3, 1],
  爵士: [3, 2, 0, 1, 2, 2],
  摇滚: [5, 3, -1, 2, 4, 3],
  人声: [-2, -1, 3, 4, 1, -1],
  低音增强: [6, 4, 1, 0, -1, 0],
};

function toast(message: string) {
  notice.value = message;
  clearTimeout(noticeTimeout);
  noticeTimeout = setTimeout(() => (notice.value = ''), 3600);
}
function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '操作失败，请重试';
}
function navigate(target: string, fromHistory = false) {
  lyricsOpen.value = false;
  search.value = '';
  filter.value = 'all';
  sort.value = 'default';
  page.value = target;
  contextMenu.value = undefined;
  if (!fromHistory && navigationHistory.value[historyIndex.value] !== target) {
    navigationHistory.value = navigationHistory.value.slice(0, historyIndex.value + 1);
    navigationHistory.value.push(target);
    historyIndex.value++;
  }
}
function goHistory(direction: number) {
  historyIndex.value += direction;
  navigate(navigationHistory.value[historyIndex.value], true);
}
function openModal(value: Modal) {
  formError.value = '';
  modal.value = value;
  importMenu.value = false;
  contextMenu.value = undefined;
  if (value === 'settings') void refreshStorage();
}
function closeModal() {
  modal.value = '';
  formError.value = '';
}
function syncSidebarPreference() {
  preferences.value.sidebarWidth = sidebarWidth.value;
  preferences.value.sidebarCompact = sidebarCompact.value;
}
function startSidebarResize(event: PointerEvent) {
  if (event.button !== 0) return;
  resizingSidebar = true;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  document.body.classList.add('is-resizing-sidebar');
}
function moveSidebarResize(event: PointerEvent) {
  if (!resizingSidebar) return;
  const left = sidebarElement.value?.getBoundingClientRect().left ?? 0;
  const raw = event.clientX - left;
  // 拖到阈值以内直接收成窄边，方便一键回到图标模式
  if (raw < 150) sidebarCompact.value = true;
  else {
    sidebarCompact.value = false;
    sidebarWidth.value = Math.min(380, Math.round(raw));
  }
}
function endSidebarResize(event: PointerEvent) {
  if (!resizingSidebar) return;
  resizingSidebar = false;
  try {
    (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
  } catch {
    /* 指针可能已经释放 */
  }
  document.body.classList.remove('is-resizing-sidebar');
  syncSidebarPreference();
}
function toggleSidebarCompact() {
  sidebarCompact.value = !sidebarCompact.value;
  syncSidebarPreference();
}
async function refreshStorage() {
  if (!window.desktop) return;
  try {
    storage.value = await window.desktop.library.storage();
  } catch {
    storage.value = undefined;
  }
}
async function openStorageFolder() {
  try {
    await window.desktop?.library.openStorage();
  } catch (error) {
    toast(errorMessage(error));
  }
}
async function changeStorage() {
  if (!window.desktop) return;
  try {
    const next = await window.desktop.library.chooseStorage();
    if (!next.directory || next.directory === storage.value?.directory) return;
    storage.value = next;
    toast('下载保存位置已更新');
  } catch (error) {
    toast(errorMessage(error));
  }
}
async function revealTrack(track: Track) {
  contextMenu.value = undefined;
  if (!window.desktop) {
    toast('打开文件位置需要在桌面应用中操作');
    return;
  }
  try {
    await window.desktop.library.reveal(track.id);
  } catch (error) {
    toast(errorMessage(error));
  }
}
async function importLocal(folder = false) {
  importMenu.value = false;
  if (!isDesktop) {
    fileInput.value?.click();
    return;
  }
  importing.value = true;
  try {
    const result = await importMusic(folder);
    if (result.tracks.length || result.skipped) {
      toast(
        `已导入 ${result.tracks.length} 首歌曲${result.skipped ? `，跳过 ${result.skipped} 个重复或不支持的文件` : ''}`,
      );
      navigate('library');
    }
  } catch (error) {
    toast(errorMessage(error));
  } finally {
    importing.value = false;
  }
}
async function handleFiles(files?: FileList | File[]) {
  if (!files?.length) return;
  importing.value = true;
  try {
    const result = await importBrowserFiles(files);
    toast(
      `已导入 ${result.tracks.length} 首歌曲${result.skipped ? `，跳过 ${result.skipped} 个不支持的文件` : ''}`,
    );
    navigate('library');
  } catch (error) {
    toast(errorMessage(error));
  } finally {
    importing.value = false;
    if (fileInput.value) fileInput.value.value = '';
  }
}
/** 只有真正拖入文件时才当作导入，拖链接/图片/文字不会触发。 */
function isFileDrag(event: DragEvent) {
  return Boolean(event.dataTransfer && [...event.dataTransfer.types].includes('Files'));
}
function onDragOver(event: DragEvent) {
  if (isFileDrag(event)) dragging.value = true;
}
function onDragLeave(event: DragEvent) {
  // 鼠标在子元素之间移动也会触发 dragleave，只有移出窗口时才收起遮罩
  if (!event.relatedTarget) dragging.value = false;
}
function onDrop(event: DragEvent) {
  event.preventDefault();
  dragging.value = false;
  if (!isFileDrag(event)) return;
  if (isDesktop) {
    toast('请在打开的系统窗口中选择音乐文件');
    void importLocal();
  } else void handleFiles(event.dataTransfer?.files);
}
function submitNetwork(play = true) {
  try {
    const track = addNetworkTrack(networkUrl.value, networkTitle.value, networkArtist.value);
    closeModal();
    networkUrl.value = '';
    networkTitle.value = '';
    networkArtist.value = '';
    networkTab.value = 'library';
    navigate('network');
    toast('网络资源已加入音乐库');
    if (play) void playTrack(track, [track]);
  } catch (error) {
    formError.value = errorMessage(error);
  }
}
function submitPlaylist() {
  if (!playlistName.value.trim()) {
    formError.value = '给歌单起个名字吧';
    return;
  }
  const playlist = createPlaylist(playlistName.value.slice(0, 40));
  if (modal.value === 'add-playlist' && selectedTrack.value)
    playlist.trackIds.push(selectedTrack.value.id);
  playlistName.value = '';
  closeModal();
  navigate(`playlist:${playlist.id}`);
  toast('歌单创建成功');
}
async function changePlaylistCover(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  const playlist = selectedPlaylist.value;
  if (!file || !playlist || changingCover.value) return;
  changingCover.value = true;
  try {
    const artwork = await readPlaylistArtwork(file);
    if (library.playlists.includes(playlist)) {
      playlist.artwork = artwork;
      toast('歌单封面已更新');
    }
  } catch (error) {
    toast(errorMessage(error));
  } finally {
    changingCover.value = false;
    input.value = '';
  }
}
function addPlaylist(track: Track) {
  selectedTrack.value = track;
  openModal('add-playlist');
}
function putInPlaylist(id: string) {
  const playlist = library.playlists.find((item) => item.id === id);
  if (!playlist || !selectedTrack.value) return;
  if (!playlist.trackIds.includes(selectedTrack.value.id)) {
    playlist.trackIds.push(selectedTrack.value.id);
    toast(`已加入「${playlist.name}」`);
  } else toast('这首歌已经在歌单中了');
  closeModal();
}
function openContextMenu(track: Track, event: MouseEvent) {
  contextMenu.value = {
    track,
    x: Math.min(event.clientX - 166, window.innerWidth - 215),
    y: Math.min(event.clientY + 8, window.innerHeight - 360),
  };
}
async function downloadTrackLocally(track: Track) {
  contextMenu.value = undefined;
  if (downloadingTrack.value) {
    toast('还有一首歌正在下载，请稍候');
    return;
  }
  if (!window.desktop) {
    toast('下载到本地需要在桌面应用中操作');
    return;
  }
  downloadingTrack.value = track.id;
  toast(`正在下载「${track.title}」…`);
  try {
    const local = await downloadToLibrary(track);
    replaceQueueTrack(track.id, local.id);
    toast(local.lyrics ? `已下载到本地（含歌词）：${local.title}` : `已下载到本地：${local.title}`);
  } catch (error) {
    toast(errorMessage(error));
  } finally {
    downloadingTrack.value = '';
  }
}
async function deleteTrack(track: Track) {
  contextMenu.value = undefined;
  try {
    const result = await removeTrack(track.id);
    removeFromQueue(track.id);
    if (player.trackId === track.id) {
      stopPlayback();
      player.trackId = queueTracks.value[0]?.id || '';
    }
    toast(
      result.fileDeleted
        ? '已从音乐库移除，本地文件已删除'
        : track.kind === 'network'
          ? '已从音乐库移除'
          : '已从音乐库移除，原文件保留',
    );
  } catch (error) {
    toast(errorMessage(error));
  }
}
function removePlaylistTrack(track: Track) {
  if (selectedPlaylist.value)
    selectedPlaylist.value.trackIds = selectedPlaylist.value.trackIds.filter(
      (id) => id !== track.id,
    );
  contextMenu.value = undefined;
  toast('已从歌单移除');
}
function deletePlaylist() {
  const id = selectedPlaylist.value?.id;
  library.playlists = library.playlists.filter((playlist) => playlist.id !== id);
  closeModal();
  navigate('playlists');
  toast('歌单已删除');
}
function playCollection(ids: string[]) {
  const tracks = ids
    .map((id) => allTracks.value.find((track) => track.id === id))
    .filter((track): track is Track => Boolean(track));
  if (tracks[0]) void playTrack(tracks[0], tracks);
}
function playPage(shuffle = false) {
  if (!pageTracks.value[0]) {
    toast('先添加几首喜欢的歌曲吧');
    return;
  }
  player.shuffle = shuffle;
  void playTrack(
    shuffle
      ? pageTracks.value[Math.floor(Math.random() * pageTracks.value.length)]
      : pageTracks.value[0],
    pageTracks.value,
  );
}
function toggleMini() {
  if (!isDesktop) {
    toast('迷你播放器可在桌面应用中使用');
    return;
  }
  mini.value = !mini.value;
  window.desktop?.window.mini(mini.value);
}
function openLyricEditor() {
  lyricDraft.value = lyricsValue.value;
  openModal('edit-lyrics');
}
function saveLyrics() {
  if (currentTrack.value) library.lyrics[currentTrack.value.id] = lyricDraft.value.slice(0, 200000);
  closeModal();
  toast('歌词已保存');
}
async function applyEqualizer(values: number[], preset?: string) {
  try {
    await setEqualizer(values, preset);
  } catch (error) {
    toast(errorMessage(error));
  }
}
async function checkUpdate() {
  if (!window.desktop) return;
  try {
    update.value = await window.desktop.app.checkUpdate();
    if (update.value.release) openModal('update');
  } catch (error) {
    update.value = { state: 'error', message: `检查更新失败：${errorMessage(error)}` };
  }
}
async function downloadUpdate() {
  if (!window.desktop || openingRelease.value) return;
  openingRelease.value = true;
  try {
    await window.desktop.app.openRelease();
  } catch (error) {
    toast(`无法打开下载页面：${errorMessage(error)}`);
  } finally {
    openingRelease.value = false;
  }
}
function clearQueue() {
  player.queue = currentTrack.value ? [currentTrack.value.id] : [];
  toast('已清除待播歌曲');
}
function keyboard(event: KeyboardEvent) {
  const target = event.target as HTMLElement;
  if (event.key === 'Escape') {
    closeModal();
    queueOpen.value = false;
    lyricsOpen.value = false;
    contextMenu.value = undefined;
    importMenu.value = false;
    return;
  }
  if ((event.metaKey || event.ctrlKey) && ['f', 'k'].includes(event.key.toLowerCase())) {
    event.preventDefault();
    searchInput.value?.focus();
    return;
  }
  if (
    target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName) ||
    modal.value
  )
    return;
  if (event.code === 'Space') {
    event.preventDefault();
    togglePlay();
  }
  if (event.altKey && event.key === 'ArrowRight') {
    event.preventDefault();
    void nextTrack();
  }
  if (event.altKey && event.key === 'ArrowLeft') {
    event.preventDefault();
    previousTrack();
  }
  if (event.key === 'ArrowRight' && !event.altKey) {
    event.preventDefault();
    seek(player.currentTime + 5);
  }
  if (event.key === 'ArrowLeft' && !event.altKey) {
    event.preventDefault();
    seek(player.currentTime - 5);
  }
}
function backgroundClick() {
  contextMenu.value = undefined;
  importMenu.value = false;
}
function onNotice(event: Event) {
  toast((event as CustomEvent<string>).detail);
}
function trapFocus(event: KeyboardEvent) {
  const elements = Array.from(
    (event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>(
      'button:not(:disabled), input, textarea, select',
    ),
  );
  const first = elements[0];
  const last = elements[elements.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}

watch(modal, async (value) => {
  if (value) {
    await nextTick();
    (
      document.querySelector('.modal input, .modal textarea, .modal button') as HTMLElement
    )?.focus();
  }
});
watch(activeLyric, async () => {
  await nextTick();
  lyricContainer.value
    ?.querySelector('.lyric-active')
    ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
});
watch(
  resolvedTheme,
  (theme) => {
    document.documentElement.dataset.theme = theme;
  },
  { immediate: true },
);
watch(
  preferences,
  () => {
    try {
      localStorage.setItem('abner:preferences', JSON.stringify(preferences.value));
    } catch {
      toast('偏好设置暂时无法保存');
    }
  },
  { deep: true, immediate: true },
);
onMounted(async () => {
  const onAppearanceChange = (event: MediaQueryListEvent) => {
    systemDark.value = event.matches;
  };
  systemAppearance.addEventListener('change', onAppearanceChange);
  cleanup.push(() => systemAppearance.removeEventListener('change', onAppearanceChange));
  document.addEventListener('keydown', keyboard);
  window.addEventListener('abner:notice', onNotice);
  try {
    await initializeLibrary();
  } catch (error) {
    toast(errorMessage(error));
  }
  player.queue = player.queue.filter((id) => library.tracks.some((track) => track.id === id));
  if (!currentTrack.value) player.trackId = allTracks.value[0]?.id || '';
  if (window.desktop) {
    version.value = await window.desktop.app.version();
    cleanup.push(window.desktop.app.onUpdate((status) => (update.value = status)));
    cleanup.push(
      window.desktop.app.onMediaKey((action) => {
        if (action === 'import') void importLocal();
        else if (action === 'toggle') togglePlay();
        else if (action === 'next') void nextTrack();
        else if (action === 'previous') previousTrack();
      }),
    );
  }
});
onUnmounted(() => {
  document.removeEventListener('keydown', keyboard);
  window.removeEventListener('abner:notice', onNotice);
  cleanup.forEach((dispose) => dispose());
  clearTimeout(noticeTimeout);
});
</script>

<template>
  <div
    class="app-shell"
    :class="{
      'is-mini': mini,
      'is-desktop': isDesktop,
      'is-windows': platform === 'win32',
      'is-compact-sidebar': sidebarCompact,
    }"
    :style="sidebarStyle"
    @click="backgroundClick"
    @dragover.prevent="onDragOver"
    @dragleave="onDragLeave"
    @dragend="dragging = false"
    @drop="onDrop"
  >
    <aside ref="sidebarElement" class="sidebar">
      <div class="sidebar-top-drag">
        <div v-if="!isDesktop" class="traffic-lights"><i /><i /><i /></div>
      </div>
      <a href="#" class="brand" @click.prevent="navigate('discover')"
        ><span class="brand-icon"><AudioLines :size="24" :stroke-width="2.5" /></span
        ><span>abner<span class="brand-music">music</span><i /></span
      ></a>
      <div class="sidebar-navigation">
        <div class="sidebar-group">
          <span class="nav-caption">探索</span
          ><button
            class="nav-item"
            :class="{ selected: page === 'discover' && !search }"
            @click="navigate('discover')"
          >
            <LayoutGrid :size="18" /><span>发现音乐</span><i />
          </button>
        </div>
        <div class="sidebar-group library-nav">
          <span class="nav-caption">我的音乐库</span
          ><button
            class="nav-item"
            :class="{ selected: page === 'library' && !search }"
            @click="navigate('library')"
          >
            <Music2 :size="18" /><span>全部音乐</span><small>{{ allTracks.length }}</small></button
          ><button
            class="nav-item"
            :class="{ selected: page === 'favorites' && !search }"
            @click="navigate('favorites')"
          >
            <Heart :size="18" /><span>我喜欢的</span
            ><small>{{ favoriteTracks.length }}</small></button
          ><button
            class="nav-item"
            :class="{ selected: page === 'recent' && !search }"
            @click="navigate('recent')"
          >
            <Clock3 :size="18" /><span>最近播放</span></button
          ><button
            class="nav-item"
            :class="{ selected: page === 'network' && !search }"
            @click="navigate('network')"
          >
            <Link2 :size="18" /><span>网络音乐</span>
          </button>
        </div>
        <div class="sidebar-group playlist-nav">
          <div class="caption-row">
            <button class="nav-caption" @click="navigate('playlists')">我的歌单</button
            ><button class="icon-button" aria-label="创建歌单" @click="openModal('playlist')">
              <Plus :size="16" />
            </button>
          </div>
          <button
            v-for="playlist in library.playlists"
            :key="playlist.id"
            class="nav-item playlist-nav-item"
            :class="{ selected: page === `playlist:${playlist.id}` }"
            @click="navigate(`playlist:${playlist.id}`)"
          >
            <ListMusic :size="18" /><span>{{ playlist.name }}</span></button
          ><button class="new-playlist" @click="openModal('playlist')">
            <Plus :size="16" />创建新歌单
          </button>
        </div>
      </div>
      <div class="sidebar-bottom">
        <button
          class="settings-nav"
          :aria-label="`设置 v${version}`"
          title="设置"
          @click="openModal('settings')"
        >
          <Settings2 :size="17" /><span>设置</span><small>v{{ version }}</small>
        </button>
      </div>
      <div
        class="sidebar-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="拖动调整侧边栏宽度"
        title="拖动调整宽度，拖到最窄或双击收起"
        @pointerdown.prevent="startSidebarResize"
        @pointermove="moveSidebarResize"
        @pointerup="endSidebarResize"
        @pointercancel="endSidebarResize"
        @dblclick="toggleSidebarCompact"
      />
    </aside>

    <div class="main-shell">
      <header class="topbar">
        <div class="history-buttons">
          <button
            class="icon-button"
            aria-label="后退"
            :disabled="historyIndex === 0"
            @click="goHistory(-1)"
          >
            <ChevronLeft :size="20" /></button
          ><button
            class="icon-button"
            aria-label="前进"
            :disabled="historyIndex >= navigationHistory.length - 1"
            @click="goHistory(1)"
          >
            <ChevronRight :size="20" />
          </button>
        </div>
        <label class="search-box"
          ><Search :size="17" /><input
            ref="searchInput"
            v-model="search"
            placeholder="搜索歌曲、艺术家、专辑"
            aria-label="搜索音乐"
            aria-description="输入关键词匹配音乐库，按回车搜索在线音乐"
            maxlength="120"
            @keydown.enter="submitOnlineSearch"
          /><button v-if="search" class="icon-button" aria-label="清空搜索" @click="search = ''">
            <X :size="14" /></button
          ><kbd v-else>{{ platform === 'darwin' ? '⌘' : 'Ctrl' }} K</kbd></label
        >
        <div class="topbar-actions">
          <div class="import-dropdown" @click.stop>
            <button
              class="button import-button"
              :aria-label="importing ? '正在导入' : '导入音乐'"
              title="导入音乐"
              :disabled="importing"
              @click="importMenu = !importMenu"
            >
              <LoaderCircle v-if="importing" :size="16" class="spin" /><Plus
                v-else
                :size="17"
              /><span>{{ importing ? '正在导入' : '导入音乐' }}</span
              ><ChevronDown :size="13" />
            </button>
            <div v-if="importMenu" class="dropdown import-options">
              <button @click="importLocal()"><Music2 :size="16" />选择音乐文件</button
              ><button v-if="isDesktop" @click="importLocal(true)">
                <FolderOpen :size="16" />导入整个文件夹</button
              ><button @click="openModal('network')"><Link2 :size="16" />添加网络链接</button>
            </div>
          </div>
          <span class="topbar-divider" /><button
            class="avatar"
            aria-label="打开设置"
            @click="openModal('settings')"
          >
            a<span />
          </button>
        </div>
        <WindowControls v-if="platform === 'win32'" />
      </header>

      <main class="main-content" :key="page + (search ? 'search' : '')">
        <template v-if="page === 'discover' && !search">
          <div class="page-greeting">
            <div>
              <div class="eyebrow">YOUR DAILY SOUNDTRACK</div>
              <h1>发现音乐<span class="heading-dot">.</span></h1>
            </div>
            <span class="date-label">{{ dateLabel }}<span>今天，也有好音乐。</span></span>
          </div>
          <section class="hero-banner">
            <div class="hero-copy">
              <div class="hero-eyebrow"><span /><span>给生活一点留白</span><i>VOL. 01</i></div>
              <h2>把日子，调成<br />喜欢的频率<span>。</span></h2>
              <p>暂时放下忙碌，让旋律带你去远方。<br />这里有音乐，也有属于自己的片刻。</p>
              <div class="hero-actions">
                <button
                  class="button button-dark"
                  @click="
                    allTracks.length
                      ? playCollection(allTracks.map((track) => track.id))
                      : importLocal()
                  "
                >
                  <Play v-if="allTracks.length" :size="15" fill="currentColor" /><Plus
                    v-else
                    :size="15"
                  />{{ allTracks.length ? '即刻聆听' : '导入第一首音乐' }}</button
                ><span
                  >{{ showDemos ? '6 首原创轻音乐' : '收藏喜欢的声音'
                  }}<span class="small-divider">/</span>让心情慢下来</span
                >
              </div>
            </div>
            <div class="hero-art" aria-hidden="true">
              <div class="hero-orbit orbit-one" />
              <div class="hero-orbit orbit-two" />
              <span class="hero-star star-one">✳</span><span class="hero-star star-two">✦</span>
              <div class="vinyl-record">
                <div class="record-grooves" />
                <div class="record-label"><span>ABNER</span><i /><span>SIDE A · 33 RPM</span></div>
              </div>
              <div class="hero-sleeve">
                <CoverArt artwork="forest" /><span class="sleeve-title"
                  >a slower<br /><i>kind of day.</i></span
                ><span class="sleeve-footer">MUSIC FOR YOUR EVERYDAY</span>
              </div>
              <div class="hero-sticker">
                <span>LESS NOISE</span><Headphones :size="24" :stroke-width="1.4" /><span
                  >MORE MUSIC</span
                >
              </div>
              <span class="hero-art-caption">SOMEWHERE BETWEEN SOUND & SILENCE</span>
            </div>
          </section>
          <section v-if="showDemos" class="collections-section">
            <div class="section-heading">
              <div>
                <h2>听见此刻</h2>
                <span>总有一种旋律，刚好懂你</span>
              </div>
              <button class="text-button" @click="navigate('playlists')">
                我的歌单<ArrowRight :size="15" />
              </button>
            </div>
            <div class="collection-grid">
              <article
                v-for="(collection, index) in collections"
                :key="collection.id"
                class="collection-card"
              >
                <div class="collection-art">
                  <button
                    class="collection-open"
                    :aria-label="`查看歌单 ${collection.name}`"
                    @click="navigate(`collection:${collection.id}`)"
                  >
                    <CoverArt :artwork="collection.artwork" />
                    <span class="collection-number">0{{ index + 1 }} / MIXTAPE</span>
                    <span class="collection-cover-label">{{
                      [
                        'slow living',
                        'into the woods',
                        'ocean escape',
                        'golden hour',
                        'after hours',
                      ][index]
                    }}</span>
                  </button>
                  <button
                    class="collection-play"
                    :aria-label="`播放歌单 ${collection.name}`"
                    @click.stop="playCollection(collection.trackIds)"
                  >
                    <Play :size="18" fill="currentColor" />
                  </button>
                </div>
                <button class="collection-title" @click="navigate(`collection:${collection.id}`)">
                  {{ collection.name }}
                </button>
                <p>{{ collection.subtitle }}</p>
              </article>
            </div>
          </section>
          <section class="recent-section">
            <div class="section-heading">
              <div>
                <h2>{{ recentTracks.length ? '最近聆听' : '为你精选' }}</h2>
                <span>{{
                  recentTracks.length
                    ? '喜欢的旋律，值得再听一遍'
                    : '从一首轻音乐，开始今天的好心情'
                }}</span>
              </div>
              <button
                class="text-button"
                @click="navigate(recentTracks.length ? 'recent' : 'library')"
              >
                查看全部<ArrowRight :size="15" />
              </button>
            </div>
            <TrackTable :tracks="discoveryTracks" @menu="openContextMenu" @add="addPlaylist" />
          </section>
          <div class="discovery-footer">
            <AudioLines :size="14" /><span>音乐，自在发生。</span><i /><span
              >MADE FOR THE LOVE OF MUSIC</span
            >
          </div>
        </template>

        <template v-else-if="page === 'playlists' && !search">
          <div class="page-heading">
            <div>
              <div class="eyebrow">CURATED BY YOU</div>
              <h1>我的歌单<span class="heading-dot">.</span></h1>
              <p>把喜欢的声音，收藏成生活的切片。</p>
            </div>
            <button class="button button-dark" @click="openModal('playlist')">
              <Plus :size="17" />创建歌单
            </button>
          </div>
          <div class="playlist-grid">
            <button
              v-for="playlist in library.playlists"
              :key="playlist.id"
              class="playlist-card"
              @click="navigate(`playlist:${playlist.id}`)"
            >
              <CoverArt :artwork="playlist.artwork" />
              <h3>{{ playlist.name }}</h3>
              <p>{{ playlist.trackIds.length }} 首歌曲</p></button
            ><button class="playlist-create-card" @click="openModal('playlist')">
              <span><Plus :size="30" :stroke-width="1" /></span>
              <h3>创建新的声音收藏</h3>
              <p>每一首，都有你的故事。</p>
            </button>
          </div>
        </template>

        <template v-else>
          <section
            v-if="
              !search.trim() && (selectedPlaylist || selectedCollection || page === 'favorites')
            "
            class="library-hero"
          >
            <div class="library-hero-art">
              <div v-if="page === 'favorites'" class="favorite-art">
                <Heart :size="70" :stroke-width="1" />
              </div>
              <CoverArt v-else :artwork="(selectedPlaylist || selectedCollection)?.artwork" />
              <button
                v-if="selectedPlaylist"
                class="playlist-cover-button"
                :disabled="changingCover"
                aria-label="修改歌单封面"
                @click="coverInput?.click()"
              >
                <LoaderCircle v-if="changingCover" :size="16" class="spin" />
                <Camera v-else :size="16" />{{ changingCover ? '处理中…' : '修改封面' }}
              </button>
            </div>
            <div class="library-hero-copy">
              <div class="eyebrow">
                {{
                  page === 'favorites'
                    ? 'LOVED BY YOU'
                    : selectedCollection
                      ? 'ABNER ORIGINALS · 精选歌单'
                      : 'YOUR PERSONAL MIXTAPE'
                }}
              </div>
              <h1>{{ title }}</h1>
              <p>
                {{
                  page === 'favorites'
                    ? '按下喜欢的那一刻，音乐就有了特别的意义。'
                    : selectedPlaylist?.description || selectedCollection?.subtitle
                }}
              </p>
              <span
                >{{ pageTracks.length }} 首歌曲 ·
                {{ Math.ceil(pageTracks.reduce((total, track) => total + track.duration, 0) / 60) }}
                分钟</span
              >
            </div>
            <button
              v-if="selectedPlaylist"
              class="icon-button delete-playlist"
              aria-label="删除歌单"
              @click="openModal('delete-playlist')"
            >
              <Trash2 :size="19" />
            </button>
          </section>
          <div v-else class="page-heading">
            <div>
              <div class="eyebrow">
                {{
                  search
                    ? 'FIND YOUR SOUND'
                    : page === 'recent'
                      ? 'ON REPEAT'
                      : page === 'network'
                        ? 'SOUNDS WITHOUT BORDERS'
                        : 'YOUR MUSIC, YOUR WAY'
                }}
              </div>
              <h1>{{ title }}<span class="heading-dot">.</span></h1>
              <p>
                {{
                  search
                    ? searchOnline
                      ? `「${submittedSearch}」的音乐库与在线结果`
                      : `音乐库匹配到 ${pageTracks.length} 首歌曲 · 按回车搜索在线音乐`
                    : page === 'recent'
                      ? '音乐会记得，那些曾经共鸣的时刻。'
                      : page === 'network'
                        ? '在线搜索喜欢的歌曲，或连接电台与音频直链。'
                        : '每一首喜欢的歌，都在这里。'
                }}
              </p>
            </div>
            <button
              v-if="page === 'network' && !search.trim()"
              class="button button-dark"
              @click="openModal('network')"
            >
              <Plus :size="17" />添加网络音乐</button
            ><button
              v-else-if="page === 'library' && !search.trim()"
              class="button button-dark"
              @click="importLocal()"
            >
              <Plus :size="17" />导入音乐
            </button>
          </div>
          <div
            v-if="page === 'network' && !search"
            class="filter-tabs network-tabs"
            style="margin-bottom: 24px"
          >
            <button :class="{ active: networkTab === 'library' }" @click="networkTab = 'library'">
              已添加音乐
            </button>
            <button :class="{ active: networkTab === 'online' }" @click="networkTab = 'online'">
              在线搜索
            </button>
          </div>
          <section
            v-if="searchOnline && pageTracks.length"
            class="search-library-results"
            aria-label="音乐库匹配结果"
          >
            <div class="search-library-heading">
              <h2>音乐库</h2>
              <span>{{ pageTracks.length }} 首歌曲</span>
            </div>
            <TrackTable :tracks="pageTracks" @menu="openContextMenu" @add="addPlaylist" />
          </section>
          <OnlineMusic
            v-if="searchOnline || (page === 'network' && !search && networkTab === 'online')"
            :key="searchOnline ? 'global-search' : 'network-search'"
            v-model:platform="searchPlatform"
            :search-term="submittedSearch"
            :search-revision="searchRevision"
            @add="addPlaylist"
            @notice="toast"
          />
          <template v-else>
            <div class="library-toolbar">
              <div class="library-toolbar-left">
                <button
                  class="button button-dark"
                  :disabled="!pageTracks.length"
                  @click="playPage()"
                >
                  <Play :size="15" fill="currentColor" />播放全部</button
                ><button
                  class="icon-button shuffle-all"
                  aria-label="随机播放全部"
                  :disabled="!pageTracks.length"
                  @click="playPage(true)"
                >
                  <Shuffle :size="19" /></button
                ><span>{{ pageTracks.length }} 首音乐</span>
              </div>
              <div class="library-toolbar-right">
                <div
                  v-if="!search.trim() && page !== 'network' && page !== 'recent'"
                  class="filter-tabs"
                >
                  <button :class="{ active: filter === 'all' }" @click="filter = 'all'">全部</button
                  ><button :class="{ active: filter === 'local' }" @click="filter = 'local'">
                    本地</button
                  ><button :class="{ active: filter === 'network' }" @click="filter = 'network'">
                    网络
                  </button>
                </div>
                <AppSelect
                  v-model="sort"
                  label="歌曲排序"
                  :options="[
                    { value: 'default', label: '默认排序' },
                    { value: 'title', label: '歌曲名称' },
                    { value: 'added', label: '最近添加' },
                    { value: 'duration', label: '歌曲时长' },
                  ]"
                />
              </div>
            </div>
            <TrackTable
              :tracks="pageTracks"
              :empty-text="
                search
                  ? '音乐库中没有匹配的歌曲'
                  : page === 'favorites'
                    ? '收藏你的第一首心动'
                    : undefined
              "
              :empty-description="search.trim() ? '按回车搜索在线音乐，发现更多歌曲。' : undefined"
              @menu="openContextMenu"
              @add="addPlaylist"
            />
            <button
              v-if="!pageTracks.length && !search"
              class="empty-import button"
              @click="page === 'network' ? openModal('network') : importLocal()"
            >
              <Plus :size="16" />{{ page === 'network' ? '添加网络资源' : '导入音乐' }}
            </button>
          </template>
        </template>
      </main>
    </div>

    <aside v-if="queueOpen && !mini" class="queue-drawer">
      <div class="drawer-header">
        <div>
          <h2>
            播放队列<span>{{ queueTracks.length }}</span>
          </h2>
          <p>音乐继续，好心情也继续。</p>
        </div>
        <button class="icon-button" aria-label="关闭队列" @click="queueOpen = false">
          <X :size="20" />
        </button>
      </div>
      <div class="queue-subheader">
        <span>总时长 {{ formatTime(queueDuration) }}</span
        ><button class="text-button" @click="clearQueue"><Trash2 :size="13" />清空待播</button>
      </div>
      <div class="queue-list">
        <div
          v-for="(track, index) in queueTracks"
          :key="track.id"
          class="queue-track"
          :class="{ active: player.trackId === track.id }"
        >
          <span class="queue-index">{{ index + 1 }}</span
          ><button
            class="queue-cover"
            :aria-label="`播放 ${track.title}`"
            @click="playTrack(track)"
          >
            <CoverArt :artwork="track.artwork" /><Play :size="15" fill="currentColor" /></button
          ><button class="queue-track-copy" @click="playTrack(track)">
            <strong>{{ track.title }}</strong
            ><span>{{ track.artist }}</span></button
          ><span v-if="player.trackId === track.id && player.playing" class="equalizer-bars"
            ><i /><i /><i /></span
          ><button
            v-else
            class="icon-button"
            aria-label="从队列移除"
            @click="removeFromQueue(track.id)"
          >
            <X :size="14" />
          </button>
        </div>
        <div v-if="!queueTracks.length" class="empty-state">
          <ListMusic :size="32" />
          <h3>下一首，听什么？</h3>
          <p>从音乐库添加喜欢的歌曲。</p>
        </div>
      </div>
      <div class="queue-bottom"><Headphones :size="15" />戴上耳机，世界只剩音乐。</div>
    </aside>

    <section v-if="lyricsOpen && !mini" class="lyrics-view">
      <div class="lyrics-top">
        <button class="text-button" @click="lyricsOpen = false">
          <ChevronDown :size="20" />返回音乐</button
        ><button class="text-button" @click="openLyricEditor">
          <Plus :size="16" />添加 / 编辑歌词
        </button>
        <WindowControls v-if="platform === 'win32'" class="lyrics-window-controls" />
      </div>
      <div class="lyrics-body">
        <div class="lyrics-album">
          <div
            class="vinyl"
            :class="{ 'is-spinning': player.playing }"
            role="button"
            tabindex="0"
            :aria-label="player.playing ? '暂停' : '播放'"
            :aria-pressed="player.playing"
            @click="togglePlay"
            @keydown.enter.prevent="togglePlay"
            @keydown.space.prevent="togglePlay"
          >
            <div class="vinyl-disc">
              <div class="vinyl-label">
                <CoverArt :artwork="currentTrack?.artwork" :title="currentTrack?.title" />
              </div>
              <span class="vinyl-hole" aria-hidden="true" />
            </div>
            <span class="vinyl-sheen" aria-hidden="true" />
            <span v-if="currentTrack" class="vinyl-play-hint" aria-hidden="true">
              <Pause v-if="player.playing" :size="26" fill="currentColor" /><Play
                v-else
                :size="26"
                fill="currentColor"
              />
            </span>
            <div class="tonearm" aria-hidden="true">
              <span class="tonearm-base" />
              <span class="tonearm-arm">
                <i class="tonearm-head" />
              </span>
            </div>
          </div>
          <h2>{{ currentTrack?.title }}</h2>
          <p>{{ currentTrack?.artist }} · {{ currentTrack?.album }}</p>
          <div v-if="currentTrack" class="lyrics-actions">
            <button
              class="icon-button"
              :class="{ active: library.favorites.includes(currentTrack.id) }"
              aria-label="喜欢这首歌"
              @click="toggleFavorite(currentTrack.id)"
            >
              <Heart
                :size="20"
                :fill="library.favorites.includes(currentTrack.id) ? 'currentColor' : 'none'"
              />
            </button>
            <button class="icon-button" aria-label="添加到歌单" @click="addPlaylist(currentTrack)">
              <Plus :size="20" />
            </button>
            <button
              v-if="currentTrack.kind === 'network'"
              class="icon-button"
              :disabled="downloadingTrack === currentTrack.id"
              aria-label="下载到本地"
              title="下载到本地"
              @click="downloadTrackLocally(currentTrack)"
            >
              <LoaderCircle v-if="downloadingTrack === currentTrack.id" :size="19" class="spin" />
              <Download v-else :size="19" />
            </button>
          </div>
        </div>
        <div ref="lyricContainer" class="lyrics-lines">
          <template v-if="lyricLines.length"
            ><button
              v-for="(line, index) in lyricLines"
              :key="index"
              :class="{ 'lyric-active': index === activeLyric }"
              @click="seek(line.time)"
            >
              {{ line.text || '♪' }}
            </button></template
          >
          <div v-else-if="lyricsValue" class="plain-lyrics">{{ lyricsValue }}</div>
          <div v-else class="lyrics-empty">
            <AudioLines :size="38" :stroke-width="1" />
            <h3>
              {{ currentTrack?.kind === 'demo' ? '此刻无词，只有旋律。' : '还没有这首歌的歌词' }}
            </h3>
            <p>
              {{
                currentTrack?.kind === 'demo'
                  ? '让心情，跟着音乐走。'
                  : '支持粘贴纯文本或 LRC 时间轴歌词'
              }}
            </p>
            <button v-if="currentTrack?.kind !== 'demo'" class="button" @click="openLyricEditor">
              添加歌词
            </button>
          </div>
        </div>
      </div>
    </section>

    <PlayerBar
      :queue-open="queueOpen"
      :mini="mini"
      @queue="queueOpen = !queueOpen"
      @lyrics="lyricsOpen = !lyricsOpen"
      @equalizer="openModal('equalizer')"
      @mini="toggleMini"
    />
    <input
      ref="fileInput"
      type="file"
      accept=".mp3,.wav,.flac,.m4a,.aac,.ogg,.opus,.aiff,.aif"
      multiple
      hidden
      @change="handleFiles(($event.target as HTMLInputElement).files || undefined)"
    />
    <input
      ref="coverInput"
      type="file"
      accept="image/png,image/jpeg,image/webp,image/gif"
      aria-label="选择歌单封面"
      hidden
      @change="changePlaylistCover"
    />

    <Transition name="toast"
      ><div v-if="notice" class="toast-notice" role="status">
        <CheckCheck :size="17" />{{ notice }}
      </div></Transition
    >
    <div v-if="dragging" class="drop-overlay">
      <div>
        <ArrowDownToLine :size="42" :stroke-width="1.3" />
        <h2>把喜欢的音乐，放进来。</h2>
        <p>支持 MP3、FLAC、WAV、M4A 等常见音频</p>
      </div>
    </div>

    <div
      v-if="contextMenu"
      class="dropdown track-context-menu"
      :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
      @click.stop
    >
      <div class="context-track-title">{{ contextMenu.track.title }}</div>
      <button
        @click="
          playTrack(contextMenu.track);
          contextMenu = undefined;
        "
      >
        <Play :size="15" />立即播放</button
      ><button
        @click="
          addToQueue(contextMenu.track);
          toast('已加入播放队列');
          contextMenu = undefined;
        "
      >
        <ListMusic :size="16" />加入播放队列</button
      ><button @click="addPlaylist(contextMenu.track)"><Plus :size="16" />添加到歌单</button
      ><button
        @click="
          toggleFavorite(contextMenu.track.id);
          contextMenu = undefined;
        "
      >
        <Heart :size="15" />{{
          library.favorites.includes(contextMenu.track.id) ? '取消喜欢' : '添加到喜欢'
        }}</button
      ><button v-if="selectedPlaylist" @click="removePlaylistTrack(contextMenu.track)">
        <Minus :size="16" />从当前歌单移除</button
      ><button v-if="contextMenu.track.kind === 'local'" @click="revealTrack(contextMenu.track)">
        <FolderOpen :size="16" />打开所在文件夹</button
      ><button
        v-if="contextMenu.track.kind === 'network'"
        :disabled="Boolean(downloadingTrack)"
        @click="downloadTrackLocally(contextMenu.track)"
      >
        <LoaderCircle
          v-if="downloadingTrack === contextMenu.track.id"
          :size="15"
          class="spin"
        /><Download v-else :size="16" />{{ downloadingTrack ? '正在下载…' : '下载到本地' }}</button
      ><button
        v-if="contextMenu.track.kind !== 'demo'"
        class="danger"
        @click="deleteTrack(contextMenu.track)"
      >
        <Trash2 :size="15" />{{ contextMenu.track.downloaded ? '删除本地文件' : '从音乐库移除' }}
      </button>
    </div>

    <div v-if="modal" class="modal-backdrop" @click.self="closeModal" @keydown.tab="trapFocus">
      <section
        class="modal"
        :class="{ 'settings-modal': modal === 'settings', 'eq-modal': modal === 'equalizer' }"
        role="dialog"
        aria-modal="true"
        :aria-label="
          (
            {
              network: '添加网络音乐',
              playlist: '创建歌单',
              'add-playlist': '添加到歌单',
              settings: '设置',
              update: '发现新版本',
              equalizer: '声音均衡器',
              timer: '睡眠定时',
              'edit-lyrics': '编辑歌词',
              'delete-playlist': '删除歌单',
            } as const
          )[modal]
        "
        @click.stop
      >
        <button class="modal-close icon-button" aria-label="关闭弹窗" @click="closeModal">
          <X :size="20" />
        </button>
        <template v-if="modal === 'network'"
          ><div class="modal-symbol"><Link2 :size="25" /></div>
          <div class="eyebrow">A WORLD OF SOUND</div>
          <h2>连接你喜欢的声音</h2>
          <p class="modal-subtitle">添加音频直链或网络电台，随时随地继续聆听。</p>
          <form @submit.prevent="submitNetwork()">
            <label class="form-label"
              >音频链接 <span>*</span
              ><input
                v-model="networkUrl"
                type="url"
                required
                placeholder="https://example.com/music.mp3"
                autofocus
            /></label>
            <div class="form-two-col">
              <label class="form-label"
                >歌曲名称<input
                  v-model="networkTitle"
                  placeholder="为这首歌起个名字"
                  maxlength="120" /></label
              ><label class="form-label"
                >艺术家<input
                  v-model="networkArtist"
                  placeholder="艺术家或电台名称"
                  maxlength="120"
              /></label>
            </div>
            <div class="form-hint">
              <Link2 :size="14" /><span
                >支持 HTTP / HTTPS 音频直链、直播流；平台分享页和 DRM 音乐无法直接播放。</span
              >
            </div>
            <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>
            <div class="modal-actions">
              <button type="button" class="button" @click="submitNetwork(false)">
                仅添加到音乐库</button
              ><button class="button button-dark" type="submit">
                <Play :size="15" fill="currentColor" />添加并播放
              </button>
            </div>
          </form></template
        >
        <template v-else-if="modal === 'playlist' || modal === 'add-playlist'"
          ><div class="modal-symbol"><ListMusic :size="25" /></div>
          <div class="eyebrow">COLLECT THE MOMENTS</div>
          <h2>{{ modal === 'playlist' ? '为喜欢的音乐，留个位置' : '添加到你的歌单' }}</h2>
          <p class="modal-subtitle">
            {{
              modal === 'playlist'
                ? '一张歌单，一种心情，一段属于你的故事。'
                : `把「${selectedTrack?.title}」收藏到一起。`
            }}
          </p>
          <div v-if="modal === 'add-playlist'" class="playlist-picker">
            <button
              v-for="playlist in library.playlists"
              :key="playlist.id"
              @click="putInPlaylist(playlist.id)"
            >
              <CoverArt :artwork="playlist.artwork" /><span
                ><strong>{{ playlist.name }}</strong
                ><small>{{ playlist.trackIds.length }} 首歌曲</small></span
              ><Check
                v-if="selectedTrack && playlist.trackIds.includes(selectedTrack.id)"
                :size="18"
              /><Plus v-else :size="18" />
            </button>
          </div>
          <form @submit.prevent="submitPlaylist">
            <label class="form-label"
              >{{ modal === 'playlist' ? '歌单名称' : '或创建新歌单'
              }}<input v-model="playlistName" placeholder="比如：一个人的好天气" maxlength="40"
            /></label>
            <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>
            <div class="modal-actions">
              <button type="button" class="button" @click="closeModal">取消</button
              ><button type="submit" class="button button-dark">
                <Plus :size="16" />{{ modal === 'playlist' ? '创建歌单' : '创建并添加' }}
              </button>
            </div>
          </form></template
        >
        <div v-else-if="modal === 'settings'" class="settings-layout">
          <header class="settings-head">
            <h2>设置</h2>
          </header>
          <div class="settings-columns">
            <nav class="settings-tabs" aria-label="设置分类">
              <button
                v-for="tab in settingsTabs"
                :key="tab.value"
                :class="{ active: settingsTab === tab.value }"
                :aria-current="settingsTab === tab.value ? 'true' : undefined"
                @click="settingsTab = tab.value"
              >
                <component :is="tab.icon" :size="16" /><span>{{ tab.label }}</span>
              </button>
            </nav>
            <div class="settings-content">
              <div v-if="settingsTab === 'appearance'" class="settings-section">
                <h3>外观</h3>
                <div class="setting-row">
                  <div><strong>界面主题</strong><span>选择更适合此刻的色调</span></div>
                  <div class="segmented-control" role="group" aria-label="界面主题">
                    <button
                      :class="{ active: preferences.theme === 'light' }"
                      :aria-pressed="preferences.theme === 'light'"
                      @click="preferences.theme = 'light'"
                    >
                      浅色</button
                    ><button
                      :class="{ active: preferences.theme === 'dark' }"
                      :aria-pressed="preferences.theme === 'dark'"
                      @click="preferences.theme = 'dark'"
                    >
                      深色
                    </button>
                    <button
                      :class="{ active: preferences.theme === 'system' }"
                      :aria-pressed="preferences.theme === 'system'"
                      @click="preferences.theme = 'system'"
                    >
                      跟随系统
                    </button>
                  </div>
                </div>
                <div v-if="demoEnabled" class="setting-row">
                  <div>
                    <strong>显示原创试听</strong><span>6 首内置音乐，无需网络即可聆听</span>
                  </div>
                  <button
                    class="switch"
                    :class="{ on: preferences.showDemos }"
                    role="switch"
                    :aria-checked="preferences.showDemos"
                    aria-label="显示原创试听"
                    @click="preferences.showDemos = !preferences.showDemos"
                  >
                    <span />
                  </button>
                </div>
              </div>
              <div v-else-if="settingsTab === 'playback'" class="settings-section">
                <h3>播放</h3>
                <div class="setting-row">
                  <div>
                    <strong>睡眠定时</strong
                    ><span>{{
                      player.sleepMinutes
                        ? `约 ${player.sleepMinutes} 分钟后停止播放`
                        : '让音乐陪你安心入睡'
                    }}</span>
                  </div>
                  <button class="text-button" @click="openModal('timer')">
                    {{ player.sleepMinutes ? '修改定时' : '设置定时' }}<ChevronRight :size="15" />
                  </button>
                </div>
                <div class="setting-row">
                  <div><strong>播放速度</strong><span>按自己的节奏聆听</span></div>
                  <AppSelect
                    v-model="player.rate"
                    label="播放速度"
                    :options="[
                      { value: 0.75, label: '0.75×' },
                      { value: 1, label: '1.0×' },
                      { value: 1.25, label: '1.25×' },
                      { value: 1.5, label: '1.5×' },
                      { value: 2, label: '2.0×' },
                    ]"
                  />
                </div>
              </div>
              <div v-else-if="settingsTab === 'storage'" class="settings-section">
                <h3>存储</h3>
                <div class="setting-row">
                  <div>
                    <strong>下载保存位置</strong>
                    <span>「下载到本地」的歌曲存放在这里，歌词会保存为同名 .lrc 文件</span>
                  </div>
                  <button class="text-button" @click="openStorageFolder">
                    打开文件夹<ChevronRight :size="15" />
                  </button>
                </div>
                <div class="storage-path">
                  <code :title="storage?.directory">{{ storage?.directory || '读取中…' }}</code
                  ><span v-if="storage" class="storage-tag">{{
                    storage.isDefault ? '默认位置' : '自定义位置'
                  }}</span>
                </div>
                <div class="setting-row">
                  <div>
                    <strong>更换保存位置</strong>
                    <span>只影响之后的下载，已经下载的歌曲不会移动</span>
                  </div>
                  <button class="button" @click="changeStorage">选择文件夹</button>
                </div>
                <p class="storage-hint">
                  手动导入的音乐不会被复制或移动，仍留在你原本的文件夹里；想找到某首歌的文件，可以在歌曲列表右键「打开所在文件夹」。
                </p>
              </div>
              <div v-else-if="settingsTab === 'window'" class="settings-section">
                <h3>窗口与后台</h3>
                <div class="setting-row">
                  <div>
                    <strong>关闭窗口后继续播放</strong>
                    <span>关闭后保留在后台，点击托盘图标可重新打开</span>
                  </div>
                  <button
                    class="button"
                    @click="
                      desktop?.window.close();
                      closeModal();
                    "
                  >
                    转入后台
                  </button>
                </div>
                <div class="setting-row">
                  <div><strong>退出 Abner Music</strong><span>停止播放并彻底退出应用</span></div>
                  <button class="button" @click="desktop?.app.quit()">退出应用</button>
                </div>
              </div>
              <div v-else class="settings-section">
                <h3>
                  关于 Abner Music <small>v{{ version }}</small>
                </h3>
                <div class="setting-row update-setting">
                  <div>
                    <strong>{{
                      update.release ? `发现 v${update.release.version}` : '保持新鲜，继续聆听'
                    }}</strong
                    ><span role="status">{{ update.message }}</span>
                  </div>
                  <button v-if="update.release" class="button" @click="openModal('update')">
                    查看更新</button
                  ><button
                    v-else
                    class="button"
                    :disabled="!isDesktop || update.state === 'checking'"
                    @click="checkUpdate"
                  >
                    {{ update.state === 'checking' ? '检查中…' : '检查更新' }}
                  </button>
                </div>
                <div class="setting-stats">
                  <span><Folder :size="14" />{{ localCount }} 首本地音乐</span
                  ><span><Heart :size="14" />{{ library.favorites.length }} 首心动收藏</span>
                </div>
                <div class="keyboard-hints">
                  <span>空格 <kbd>播放 / 暂停</kbd></span
                  ><span>← / → <kbd>快退 / 快进 5 秒</kbd></span
                  ><span>Alt + ← / → <kbd>切歌</kbd></span
                  ><span>Ctrl / ⌘ + F <kbd>搜索</kbd></span>
                </div>
                <div class="settings-footer">
                  <AudioLines :size="17" />音乐，自在发生。<span
                    >github.com/abner-forever/abner-music</span
                  >
                </div>
              </div>
            </div>
          </div>
        </div>
        <template v-else-if="modal === 'update' && update.release">
          <div class="modal-symbol"><ArrowDownToLine :size="25" /></div>
          <div class="eyebrow">SOMETHING NEW TO HEAR</div>
          <h2>发现新版本</h2>
          <p class="modal-subtitle">{{ update.release.title }}</p>
          <div class="release-meta">
            <span>v{{ version }} <ArrowRight :size="13" /> v{{ update.release.version }}</span>
            <span v-if="releaseDate">{{ releaseDate }}</span>
          </div>
          <h3 class="release-notes-title">更新日志</h3>
          <div class="release-notes" tabindex="0" aria-label="更新日志">
            {{ update.release.notes }}
          </div>
          <p class="form-hint">前往 GitHub 发布页，选择适合你设备的安装包。</p>
          <div class="modal-actions">
            <button class="button" @click="openModal('settings')">稍后再说</button>
            <button class="button button-dark" :disabled="openingRelease" @click="downloadUpdate">
              <Link2 :size="15" />{{ openingRelease ? '正在打开…' : '前往 GitHub 下载' }}
            </button>
          </div>
        </template>
        <template v-else-if="modal === 'equalizer'"
          ><div class="modal-symbol"><SlidersHorizontal :size="25" /></div>
          <div class="eyebrow">FIND YOUR BALANCE</div>
          <h2>声音，也可以很合拍</h2>
          <p class="modal-subtitle">六段均衡器，让每个音符恰到好处。</p>
          <div class="eq-presets">
            <button
              v-for="(_, name) in equalizerPresets"
              :key="name"
              :class="{ active: player.eqPreset === name }"
              @click="applyEqualizer(equalizerPresets[name], String(name))"
            >
              {{ name }}
            </button>
          </div>
          <div class="equalizer-sliders">
            <label
              v-for="(frequency, index) in ['60', '230', '910', '3.6k', '8k', '14k']"
              :key="frequency"
              ><span
                >{{ player.equalizer[index] > 0 ? '+' : '' }}{{ player.equalizer[index]
                }}<small>dB</small></span
              ><input
                type="range"
                min="-12"
                max="12"
                step="1"
                :value="player.equalizer[index]"
                :aria-label="`均衡器 ${frequency} Hz`"
                @input="
                  applyEqualizer(
                    player.equalizer.map((value, band) =>
                      band === index ? Number(($event.target as HTMLInputElement).value) : value,
                    ),
                  )
                "
              /><span>{{ frequency }}<small>Hz</small></span></label
            >
          </div>
          <p class="form-hint">均衡器支持本地音乐与原创试听，网络音频使用原始音效。</p>
          <div class="modal-actions">
            <button class="text-button" @click="applyEqualizer(equalizerPresets.原声, '原声')">
              恢复原声</button
            ><button class="button button-dark" @click="closeModal">完成</button>
          </div></template
        >
        <template v-else-if="modal === 'timer'"
          ><div class="modal-symbol"><Timer :size="26" /></div>
          <div class="eyebrow">REST EASY</div>
          <h2>让音乐，陪你说晚安</h2>
          <p class="modal-subtitle">时间到了会自动暂停播放，安心休息吧。</p>
          <div class="timer-options">
            <button
              v-for="minutes in [15, 30, 45, 60, 90]"
              :key="minutes"
              :class="{ active: player.sleepMinutes === minutes }"
              @click="
                setSleepTimer(minutes);
                toast(`将在 ${minutes} 分钟后停止播放`);
                closeModal();
              "
            >
              <Clock3 :size="18" /><strong>{{ minutes }}</strong
              ><span>分钟</span>
            </button>
          </div>
          <button
            class="button timer-cancel"
            @click="
              setSleepTimer(0);
              toast('已关闭睡眠定时');
              closeModal();
            "
          >
            关闭定时
          </button></template
        >
        <template v-else-if="modal === 'edit-lyrics'"
          ><div class="eyebrow">WORDS THAT RESONATE</div>
          <h2>为旋律，添上文字</h2>
          <p class="modal-subtitle">支持纯文本与 LRC 格式，例如 [00:12.50] 第一行歌词。</p>
          <textarea
            v-model="lyricDraft"
            class="lyrics-textarea"
            aria-label="歌词内容"
            placeholder="[00:00.00] 音乐响起的那一刻…"
            maxlength="200000"
          />
          <div class="modal-actions">
            <button class="button" @click="closeModal">取消</button
            ><button class="button button-dark" @click="saveLyrics">保存歌词</button>
          </div></template
        >
        <template v-else-if="modal === 'delete-playlist'"
          ><div class="modal-symbol"><Trash2 :size="25" /></div>
          <h2>删除这张歌单？</h2>
          <p class="modal-subtitle">
            「{{ selectedPlaylist?.name }}」将被删除，音乐库里的歌曲会保留。
          </p>
          <div class="modal-actions">
            <button class="button" @click="closeModal">取消</button
            ><button class="button button-danger" @click="deletePlaylist">删除歌单</button>
          </div></template
        >
      </section>
    </div>
  </div>
</template>
