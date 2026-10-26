<script setup lang="ts">
import { Heart, Play, Pause, Plus, MoreHorizontal, Music2 } from '@lucide/vue';
import type { Track } from '../../shared/types';
import { formatTime } from '../lib/music';
import { library, toggleFavorite } from '../stores/library';
import { player, playTrack, togglePlay } from '../stores/player';
import CoverArt from './CoverArt.vue';
defineProps<{ tracks: Track[]; emptyText?: string }>();
defineEmits<{ menu: [track: Track, event: MouseEvent]; add: [track: Track] }>();
</script>

<template>
  <div class="track-table" role="table" aria-label="歌曲列表">
    <div class="track-table-head" role="row">
      <span>#</span><span>歌曲 / 艺术家</span><span>专辑</span><span>来源</span><span>时长</span
      ><span></span>
    </div>
    <div
      v-for="(track, index) in tracks"
      :key="track.id"
      class="track-row"
      :class="{ 'is-current': track.id === player.trackId }"
      role="row"
      tabindex="0"
      @dblclick="playTrack(track, tracks)"
      @keydown.enter="playTrack(track, tracks)"
    >
      <button
        class="track-index icon-button"
        :aria-label="`${track.id === player.trackId && player.playing ? '暂停' : '播放'} ${track.title}`"
        @click="track.id === player.trackId ? togglePlay() : playTrack(track, tracks)"
      >
        <span v-if="track.id === player.trackId && player.playing" class="equalizer-bars"
          ><i /><i /><i
        /></span>
        <span v-else class="index-number">{{ String(index + 1).padStart(2, '0') }}</span>
        <Pause
          v-if="track.id === player.trackId && player.playing"
          class="hover-play"
          :size="14"
          fill="currentColor"
        /><Play v-else class="hover-play" :size="14" fill="currentColor" />
      </button>
      <div class="track-name-cell">
        <CoverArt :artwork="track.artwork" />
        <div>
          <span class="track-title">{{ track.title }}</span
          ><span class="track-artist">{{ track.artist }}</span>
        </div>
        <span v-if="track.format === 'FLAC'" class="quality-tag">无损</span>
      </div>
      <span class="track-album">{{ track.album }}</span>
      <span class="source-label" :class="track.kind">{{
        track.kind === 'demo' ? '原创试听' : track.kind === 'local' ? '本地' : '网络'
      }}</span>
      <span class="track-duration">{{ track.duration ? formatTime(track.duration) : '—' }}</span>
      <div class="track-actions">
        <button
          class="icon-button favorite-button"
          :class="{ active: library.favorites.includes(track.id) }"
          :aria-label="library.favorites.includes(track.id) ? '取消喜欢' : '喜欢歌曲'"
          @click="toggleFavorite(track.id)"
        >
          <Heart
            :size="16"
            :fill="library.favorites.includes(track.id) ? 'currentColor' : 'none'"
          /></button
        ><button class="icon-button row-add" aria-label="加入歌单" @click="$emit('add', track)">
          <Plus :size="17" /></button
        ><button
          class="icon-button"
          aria-label="歌曲更多操作"
          @click.stop="$emit('menu', track, $event)"
        >
          <MoreHorizontal :size="19" />
        </button>
      </div>
    </div>
    <div v-if="!tracks.length" class="empty-state">
      <Music2 :size="34" :stroke-width="1.2" />
      <h3>{{ emptyText || '这里还没有音乐' }}</h3>
      <p>导入喜欢的歌曲，让音乐慢慢填满这里。</p>
    </div>
  </div>
</template>
