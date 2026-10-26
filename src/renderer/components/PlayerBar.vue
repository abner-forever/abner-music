<script setup lang="ts">
import {
  Heart,
  Shuffle,
  SkipBack,
  SkipForward,
  Play,
  Pause,
  Repeat,
  Repeat1,
  Volume2,
  VolumeX,
  ListMusic,
  Mic2,
  SlidersHorizontal,
  LoaderCircle,
  PanelTop,
  Expand,
  X,
} from '@lucide/vue';
import {
  currentTrack,
  player,
  togglePlay,
  nextTrack,
  previousTrack,
  seek,
  toggleShuffle,
  cycleRepeat,
} from '../stores/player';
import { library, toggleFavorite } from '../stores/library';
import { formatTime } from '../lib/music';
import CoverArt from './CoverArt.vue';
defineProps<{ queueOpen: boolean; mini: boolean }>();
defineEmits<{ queue: []; lyrics: []; equalizer: []; mini: [] }>();
</script>

<template>
  <footer class="player-bar" :class="{ 'mini-bar': mini }" aria-label="音乐播放控制">
    <div class="player-song">
      <button class="player-cover" aria-label="查看歌词" @click="$emit('lyrics')">
        <CoverArt :artwork="currentTrack?.artwork" />
      </button>
      <div class="player-song-copy">
        <strong>{{ currentTrack?.title || '此刻，想听什么？' }}</strong
        ><span
          >{{ currentTrack?.artist || '选择一首喜欢的音乐'
          }}<i v-if="currentTrack?.kind === 'demo'">原创试听</i></span
        >
      </div>
      <button
        v-if="currentTrack"
        class="icon-button player-like"
        :class="{ active: library.favorites.includes(currentTrack.id) }"
        aria-label="喜欢当前歌曲"
        @click="toggleFavorite(currentTrack.id)"
      >
        <Heart
          :size="19"
          :fill="library.favorites.includes(currentTrack.id) ? 'currentColor' : 'none'"
        />
      </button>
      <button
        v-if="mini"
        class="icon-button mini-expand"
        aria-label="退出迷你播放器"
        @click="$emit('mini')"
      >
        <Expand :size="17" />
      </button>
    </div>
    <div class="player-center">
      <div class="transport-controls">
        <button
          class="icon-button mode-button"
          :class="{ active: player.shuffle }"
          :aria-pressed="player.shuffle"
          aria-label="随机播放"
          @click="toggleShuffle"
        >
          <Shuffle :size="17" />
        </button>
        <button class="icon-button skip-button" aria-label="上一首" @click="previousTrack">
          <SkipBack :size="20" fill="currentColor" />
        </button>
        <button
          class="play-toggle"
          :aria-label="player.loading ? '取消加载' : player.playing ? '暂停' : '播放'"
          @click="togglePlay"
        >
          <LoaderCircle v-if="player.loading" :size="20" class="spin" /><Pause
            v-else-if="player.playing"
            :size="20"
            fill="currentColor"
          /><Play v-else :size="20" fill="currentColor" class="play-icon" />
        </button>
        <button class="icon-button skip-button" aria-label="下一首" @click="nextTrack()">
          <SkipForward :size="20" fill="currentColor" />
        </button>
        <button
          class="icon-button mode-button"
          :class="{ active: player.repeat !== 'off' }"
          :aria-label="
            player.repeat === 'all' ? '列表循环' : player.repeat === 'one' ? '单曲循环' : '顺序播放'
          "
          @click="cycleRepeat"
        >
          <Repeat1 v-if="player.repeat === 'one'" :size="18" /><Repeat v-else :size="18" /><span
            v-if="player.repeat !== 'off'"
            class="mode-dot"
          />
        </button>
      </div>
      <div class="timeline">
        <span>{{ formatTime(player.currentTime) }}</span
        ><input
          aria-label="播放进度"
          type="range"
          min="0"
          :max="player.duration || currentTrack?.duration || 1"
          step="0.1"
          :value="player.currentTime"
          :style="{ '--progress': `${(player.currentTime / (player.duration || 1)) * 100}%` }"
          @input="seek(Number(($event.target as HTMLInputElement).value))"
        /><span>{{ formatTime(player.duration || currentTrack?.duration || 0) }}</span>
      </div>
    </div>
    <div class="player-tools">
      <button class="icon-button" aria-label="歌词" @click="$emit('lyrics')">
        <Mic2 :size="18" /></button
      ><button class="icon-button" aria-label="均衡器" @click="$emit('equalizer')">
        <SlidersHorizontal :size="18" /></button
      ><span class="tool-divider" /><button
        class="icon-button volume-icon"
        :aria-label="player.muted ? '取消静音' : '静音'"
        @click="player.muted = !player.muted"
      >
        <VolumeX v-if="player.muted || player.volume === 0" :size="19" /><Volume2
          v-else
          :size="19"
        /></button
      ><input
        class="volume-slider"
        type="range"
        min="0"
        max="1"
        step="0.01"
        :value="player.muted ? 0 : player.volume"
        :style="{ '--progress': `${(player.muted ? 0 : player.volume) * 100}%` }"
        aria-label="音量"
        @input="
          player.volume = Number(($event.target as HTMLInputElement).value);
          player.muted = false;
        "
      /><button
        class="icon-button queue-button"
        :class="{ active: queueOpen }"
        aria-label="播放队列"
        @click="$emit('queue')"
      >
        <ListMusic :size="21" /></button
      ><button class="icon-button mini-button" aria-label="迷你播放器" @click="$emit('mini')">
        <PanelTop :size="18" />
      </button>
    </div>
    <div v-if="player.error" class="player-error" role="alert">
      <span>{{ player.error }}</span
      ><button class="icon-button" aria-label="关闭播放提示" @click="player.error = ''">
        <X :size="15" />
      </button>
    </div>
  </footer>
</template>
