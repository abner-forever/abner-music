<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Heart,
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

const emit = defineEmits<{ add: [track: Track]; notice: [message: string] }>();
const platform = ref<MusicPlatform>('netease');
const keyword = ref('');
const results = ref<Track[]>([]);
const loading = ref(false);
const error = ref('');
const searched = ref(false);
const page = ref(1);
const query = ref('');
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

watch(platform, () => {
  request?.abort();
  loading.value = false;
  results.value = [];
  searched.value = false;
  error.value = '';
  page.value = 1;
});
onUnmounted(() => request?.abort());
</script>

<template>
  <section class="online-music" aria-label="在线音乐搜索">
    <form class="online-search" @submit.prevent="search()">
      <AppSelect v-model="platform" label="音乐平台" :options="musicPlatforms" />
      <label class="online-keyword">
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
    <p class="online-attribution">
      音乐源：GD音乐台(music.gdstudio.xyz) · 仅限非商业学习使用 · 可用性取决于上游平台
    </p>
    <p v-if="platform !== 'netease'" class="online-attribution">
      实验平台可能返回空结果或无法播放的歌曲。
    </p>
    <div v-if="error" class="online-error" role="alert">
      <span>{{ error }}</span
      ><button class="text-button" :disabled="loading" @click="search()">重试</button>
    </div>
    <div v-if="!searched" class="empty-state">
      <Music2 :size="34" :stroke-width="1.2" />
      <h3>找到下一首喜欢的歌</h3>
      <p>搜索后可以播放、收藏或加入歌单。</p>
    </div>
    <template v-else>
      <div class="online-results-heading">
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
            class="icon-button"
            :aria-label="`加入音乐库 ${track.title}`"
            :disabled="library.tracks.some((item) => item.id === track.id)"
            @click="save(track)"
          >
            <Check v-if="library.tracks.some((item) => item.id === track.id)" :size="17" /><Plus
              v-else
              :size="17"
            />
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
            class="icon-button"
            :aria-label="`在线歌曲加入歌单 ${track.title}`"
            @click="emit('add', addRemoteTrack(track))"
          >
            <Plus :size="17" />
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
</style>
