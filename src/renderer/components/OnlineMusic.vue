<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Heart,
  LibraryBig,
  ListPlus,
  LoaderCircle,
  Music2,
  Play,
  Plus,
  Search,
} from '@lucide/vue';
import type { MusicPlatform, Track } from '../../shared/types';
import { musicPlatforms } from '../../shared/gd-music';
import { gdMusic } from '../lib/gd-music';
import { addRemoteTrack, library, toggleFavorite } from '../stores/library';
import { playTrack } from '../stores/player';
import AppSelect from './AppSelect.vue';
import CoverArt from './CoverArt.vue';

const props = defineProps<{ searchTerm?: string; searchRevision?: number }>();
const emit = defineEmits<{ add: [track: Track]; notice: [message: string] }>();
const platform = defineModel<MusicPlatform>('platform', { default: 'netease' });
const keyword = ref('');
const results = ref<Track[]>([]);
const loading = ref(false);
const error = ref('');
const searched = ref(false);
const page = ref(1);
const query = ref('');
const downloadingId = ref('');
let request: AbortController | undefined;

async function search(targetPage = 1, submittedQuery = keyword.value.trim()) {
  request?.abort();
  const current = new AbortController();
  request = current;
  if (!submittedQuery) {
    loading.value = false;
    error.value = '请输入歌曲、艺术家或专辑名称';
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const tracks = await gdMusic.search(
      { platform: platform.value, keyword: submittedQuery, page: targetPage },
      current.signal,
    );
    if (current.signal.aborted) return;
    results.value = tracks;
    page.value = targetPage;
    query.value = submittedQuery;
    searched.value = true;
  } catch (reason) {
    if (!current.signal.aborted)
      error.value = reason instanceof Error ? reason.message : '搜索失败，请重试';
  } finally {
    if (!current.signal.aborted) loading.value = false;
  }
}

function save(track: Track) {
  const existing = library.tracks.some((item) => item.id === track.id);
  const saved = addRemoteTrack(track);
  emit('notice', existing ? '这首歌已在音乐库中' : '已加入音乐库');
  return saved;
}

function favorite(track: Track) {
  const saved = addRemoteTrack(track);
  toggleFavorite(saved.id);
}

function play(track: Track) {
  const saved = addRemoteTrack(track);
  void playTrack(saved, [saved]);
}

function browserDownloadName(track: Track, url: string) {
  const invalid = '<>:"/\\\\|?*';
  const stem =
    [...(track.artist + ' - ' + track.title)]
      .map((letter) => invalid.includes(letter) || (letter.charCodeAt(0) < 32 ? ' ' : letter))
      .join('')
      .replace(/\\s+/g, ' ')
      .trim()
      .replace(/[. ]+$/g, '')
      .slice(0, 100) || '在线音乐';
  const supported = ['aac', 'flac', 'm4a', 'mp3', 'ogg', 'opus', 'wav'];
  let extension = '';
  try {
    extension = new URL(url).pathname.split('.').pop()?.toLowerCase() || '';
  } catch {}
  const format = track.format.toLowerCase();
  if (!supported.includes(extension)) extension = supported.includes(format) ? format : 'mp3';
  return stem + '.' + extension;
}

async function download(track: Track) {
  if (!track.remote || downloadingId.value) return;
  downloadingId.value = track.id;
  try {
    if (window.desktop?.download) {
      const result = await window.desktop.download.audio({
        remote: { ...track.remote },
        quality: 320,
        suggestedName: track.artist + ' - ' + track.title,
        format: track.format,
      });
      emit('notice', result.saved ? '已下载：' + result.fileName : '已取消下载');
      return;
    }
    const resolved = await gdMusic.resolve({ remote: track.remote, quality: 320, refresh: true });
    const link = document.createElement('a');
    link.href = resolved.url;
    link.download = browserDownloadName(track, resolved.url);
    link.rel = 'noopener';
    document.body.append(link);
    link.click();
    link.remove();
    emit('notice', '已开始下载：' + track.title);
  } catch (reason) {
    emit('notice', reason instanceof Error ? reason.message : '下载失败，请稍后重试');
  } finally {
    downloadingId.value = '';
  }
}

watch(platform, () => {
  request?.abort();
  loading.value = false;
  results.value = [];
  searched.value = false;
  error.value = '';
  page.value = 1;
  if (props.searchTerm?.trim()) void search();
});
watch(
  () => [props.searchTerm, props.searchRevision],
  () => {
    request?.abort();
    if (!props.searchTerm?.trim()) return;
    keyword.value = props.searchTerm.trim();
    results.value = [];
    searched.value = false;
    error.value = '';
    page.value = 1;
    void search();
  },
  { immediate: true },
);
onUnmounted(() => request?.abort());
</script>

<template>
  <section class="online-music" aria-label="在线音乐搜索">
    <div v-if="searchTerm" class="online-result-toolbar">
      <div class="online-result-summary">
        <strong>在线歌曲</strong>
        <span>{{ loading ? '搜索中…' : error ? '搜索未完成' : `本页 ${results.length} 首` }}</span>
      </div>
      <div class="online-source-tabs" role="group" aria-label="音乐来源">
        <button
          v-for="source in musicPlatforms"
          :key="source.value"
          :class="{ active: platform === source.value }"
          :aria-pressed="platform === source.value"
          @click="platform = source.value"
        >
          {{ source.label.replace('（实验）', '') }}
        </button>
      </div>
    </div>
    <form v-else class="online-search" @submit.prevent="search()">
      <AppSelect v-model="platform" label="音乐平台" :options="musicPlatforms" />
      <label v-if="!searchTerm" class="online-keyword">
        <Search :size="17" />
        <input
          v-model="keyword"
          aria-label="在线搜索关键词"
          placeholder="搜索在线歌曲、艺术家、专辑"
          maxlength="120"
        />
      </label>
      <button type="submit" class="button button-dark" :disabled="loading">
        <LoaderCircle v-if="loading" :size="16" class="spin" /><Search v-else :size="16" />
        {{ loading ? '搜索中' : '搜索在线音乐' }}
      </button>
    </form>
    <p v-if="!searchTerm" class="online-attribution">
      音乐源：GD音乐台(music.gdstudio.xyz) · 仅限非商业学习使用 · 可用性取决于上游平台
    </p>
    <p v-if="!searchTerm && platform !== 'netease'" class="online-attribution">
      实验平台可能返回空结果或无法播放的歌曲。
    </p>
    <div v-if="error" class="online-error" role="alert">
      <span>{{ error }}</span
      ><button class="text-button" :disabled="loading" @click="search()">重试</button>
    </div>
    <div v-if="loading" class="empty-state" role="status">
      <LoaderCircle :size="28" class="spin" />
      <p>正在搜索「{{ keyword }}」…</p>
    </div>
    <div v-else-if="!searched && !error" class="empty-state">
      <Music2 :size="34" :stroke-width="1.2" />
      <h3>找到下一首喜欢的歌</h3>
      <p>搜索后可以播放、收藏或加入歌单。</p>
    </div>
    <template v-else-if="searched">
      <div v-if="!searchTerm" class="online-results-heading">
        <span>「{{ query }}」· 第 {{ page }} 页 · {{ results.length }} 首</span>
      </div>
      <div v-if="!results.length" class="empty-state">
        <Music2 :size="34" />
        <h3>没有找到相关音乐</h3>
        <p>试试其他关键词或音乐平台。</p>
      </div>
      <div
        v-for="track in results"
        :key="track.id"
        class="online-track"
        :aria-label="`${track.title} · ${track.artist}`"
      >
        <button
          class="online-play icon-button"
          :aria-label="`在线播放 ${track.title}`"
          @click="play(track)"
        >
          <Play :size="17" fill="currentColor" />
        </button>
        <CoverArt
          :artwork="library.tracks.find((item) => item.id === track.id)?.artwork || track.artwork"
        />
        <div class="online-track-copy">
          <strong>{{ track.title }}</strong
          ><span>{{ track.artist }}</span>
        </div>
        <span class="online-album">{{ track.album }}</span>
        <div class="online-track-actions">
          <button
            class="icon-button library-action"
            :aria-label="`加入音乐库 ${track.title}`"
            title="加入音乐库"
            :disabled="library.tracks.some((item) => item.id === track.id)"
            @click="save(track)"
          >
            <Check v-if="library.tracks.some((item) => item.id === track.id)" :size="17" />
            <LibraryBig v-else :size="17" />
          </button>
          <button
            class="icon-button"
            :class="{ 'is-favorite': library.favorites.includes(track.id) }"
            :aria-label="`${library.favorites.includes(track.id) ? '取消在线收藏' : '在线收藏'} ${track.title}`"
            @click="favorite(track)"
          >
            <Heart
              :size="17"
              :fill="library.favorites.includes(track.id) ? 'currentColor' : 'none'"
            />
          </button>
          <button
            class="icon-button playlist-action"
            :aria-label="`在线歌曲加入歌单 ${track.title}`"
            title="加入歌单"
            @click="emit('add', addRemoteTrack(track))"
          >
            <ListPlus :size="17" />
          </button>
          <button
            class="icon-button download-button"
            :aria-label="`下载 ${track.title}`"
            title="下载"
            :disabled="downloadingId === track.id"
            @click="download(track)"
          >
            <LoaderCircle v-if="downloadingId === track.id" :size="17" class="spin" />
            <Download v-else :size="17" />
          </button>
        </div>
      </div>
      <div class="online-pagination">
        <button class="button" :disabled="page === 1 || loading" @click="search(page - 1, query)">
          <ChevronLeft :size="16" />上一页
        </button>
        <span>第 {{ page }} 页</span>
        <button
          class="button"
          :disabled="!results.length || loading || platform === 'joox' || page >= 100"
          @click="search(page + 1, query)"
        >
          下一页<ChevronRight :size="16" />
        </button>
      </div>
    </template>
    <p v-if="searchTerm" class="online-attribution online-results-footer">
      音乐源：GD音乐台(music.gdstudio.xyz) · 仅限非商业学习使用
      <span v-if="platform !== 'netease'"> · 实验来源，歌曲可能暂不可用</span>
    </p>
  </section>
</template>

<style scoped>
.online-search,
.online-keyword,
.online-track,
.online-track-actions,
.online-pagination,
.online-error {
  display: flex;
  align-items: center;
  gap: 14px;
}
.online-search {
  margin: 8px 0 14px;
  flex-wrap: wrap;
}
.online-result-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 52px;
  margin-bottom: 8px;
  border-bottom: 1px solid var(--line);
}
.online-result-summary {
  display: flex;
  align-items: baseline;
  gap: 10px;
  white-space: nowrap;
}
.online-result-summary strong {
  font-size: 14px;
  font-weight: 600;
}
.online-result-summary span {
  color: var(--muted);
  font-size: 11px;
}
.online-source-tabs {
  display: flex;
  align-self: stretch;
  gap: 24px;
}
.online-source-tabs button {
  position: relative;
  color: var(--muted);
  font-size: 12px;
  white-space: nowrap;
  transition: color 0.18s ease;
}
.online-source-tabs button:hover,
.online-source-tabs button.active {
  color: var(--green);
}
.online-source-tabs button.active {
  font-weight: 600;
}
.online-source-tabs button.active::after {
  content: '';
  position: absolute;
  right: 0;
  bottom: -1px;
  left: 0;
  height: 2px;
  border-radius: 2px;
  background: var(--green);
}
.online-results-footer {
  padding-top: 16px;
  border-top: 1px solid var(--line);
}
.online-keyword {
  flex: 1;
  min-width: 180px;
  padding: 10px 12px;
  border: 1px solid var(--control-border);
  border-radius: 7px;
  background: var(--surface);
  color: var(--muted);
}
.online-keyword input {
  width: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text);
  font-size: 12px;
}
.online-keyword:focus-within {
  border-color: var(--focus);
}
.online-attribution {
  margin: 6px 0;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.7;
}
.online-error {
  justify-content: space-between;
  margin: 18px 0;
  color: var(--text);
  font-size: 12px;
}
.online-results-heading {
  margin: 28px 0 12px;
  color: var(--muted);
  font-size: 12px;
}
.online-track {
  min-height: 74px;
  padding: 12px 6px;
  border-bottom: 1px solid var(--line);
}
.online-track .cover-art {
  width: 42px;
  height: 42px;
  border-radius: 6px;
  flex-shrink: 0;
}
.online-track-copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.online-track-copy strong,
.online-track-copy span,
.online-album {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.online-track-copy strong {
  font-size: 13px;
  font-weight: 500;
}
.online-track-copy span,
.online-album {
  font-size: 11px;
  color: var(--muted);
}
.online-album {
  width: 24%;
}
.online-track-actions {
  gap: 8px;
}
.online-track-actions .is-favorite {
  color: var(--green);
}
.online-track-actions .library-action,
.online-track-actions .playlist-action,
.online-track-actions .download-button {
  color: var(--muted);
}
.online-track-actions button:not(:disabled):hover {
  background: var(--hover);
  color: var(--green);
}
.online-pagination {
  justify-content: center;
  margin: 24px 0;
  font-size: 12px;
  color: var(--muted);
}
@media (max-width: 1100px) {
  .online-album {
    display: none;
  }
}
@media (max-width: 600px) {
  .online-result-toolbar {
    align-items: stretch;
    flex-direction: column;
    gap: 8px;
    padding-top: 8px;
  }
  .online-source-tabs {
    min-height: 38px;
    gap: 22px;
  }
  .online-track {
    display: grid;
    grid-template-columns: 28px 42px minmax(0, 1fr);
    gap: 8px 9px;
  }
  .online-track-actions {
    grid-column: 2 / -1;
    justify-self: end;
    gap: 4px;
  }
  .online-results-footer {
    font-size: 10px;
  }
}
</style>
