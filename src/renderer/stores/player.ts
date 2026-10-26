import { computed, reactive, watch } from 'vue';
import type { Track } from '../../shared/types';
import { demoSource } from '../lib/demo';
import { loadFile, readState } from '../lib/storage';
import { shuffled } from '../lib/music';
import { library, rememberTrack } from './library';

const saved = readState<{
  volume: number;
  repeat: string;
  shuffle: boolean;
  trackId: string;
  queue: string[];
}>('abner:player', {
  volume: 0.65,
  repeat: 'all',
  shuffle: false,
  trackId: 'demo-1',
  queue: library.tracks.map((track) => track.id),
});
const localAudio = new Audio();
localAudio.crossOrigin = 'anonymous';
const networkAudio = new Audio();
export let audio = localAudio;
audio.preload = 'metadata';
export const player = reactive({
  trackId: saved.trackId || 'demo-1',
  queue: saved.queue || library.tracks.map((track) => track.id),
  playing: false,
  loading: false,
  currentTime: 0,
  duration: 0,
  volume: Number.isFinite(saved.volume) ? Math.max(0, Math.min(1, saved.volume)) : 0.65,
  muted: false,
  repeat: ['all', 'one', 'off'].includes(saved.repeat)
    ? (saved.repeat as 'all' | 'one' | 'off')
    : 'all',
  shuffle: saved.shuffle || false,
  error: '',
  sleepMinutes: 0,
  rate: 1,
  equalizer: [0, 0, 0, 0, 0, 0],
  eqPreset: '原声',
});
export const currentTrack = computed(() =>
  library.tracks.find((track) => track.id === player.trackId),
);
export const queueTracks = computed(() =>
  player.queue
    .map((id) => library.tracks.find((track) => track.id === id))
    .filter((track): track is Track => Boolean(track)),
);
let generation = 0;
let loadedId = '';
let importedUrl = '';
let sleepTimer: ReturnType<typeof setTimeout> | undefined;
let sleepEndsAt = 0;
let audioContext: AudioContext | undefined;
let filters: BiquadFilterNode[] = [];
let originalQueue: string[] = [];
let retryCount = 0;

audio.volume = player.volume;
for (const element of [localAudio, networkAudio]) {
  element.addEventListener('timeupdate', () => {
    if (audio === element) player.currentTime = audio.currentTime;
  });
  element.addEventListener('durationchange', () => {
    if (audio !== element) return;
    player.duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    if (currentTrack.value && player.duration) currentTrack.value.duration = player.duration;
  });
  element.addEventListener('playing', () => {
    if (audio !== element) return;
    player.playing = true;
    player.loading = false;
    player.error = '';
    retryCount = 0;
    updateMediaState();
  });
  element.addEventListener('pause', () => {
    if (audio !== element) return;
    player.playing = false;
    updateMediaState();
  });
  element.addEventListener('waiting', () => {
    if (audio === element) player.loading = true;
  });
  element.addEventListener('canplay', () => {
    if (audio === element) player.loading = false;
  });
  element.addEventListener('error', () => {
    if (audio !== element) return;
    player.loading = false;
    player.playing = false;
    player.error = '这首歌暂时无法播放，请检查文件、音频格式或网络链接';
    if (retryCount < Math.min(3, player.queue.length - 1)) {
      retryCount++;
      window.dispatchEvent(
        new CustomEvent('abner:notice', { detail: '音频无法播放，正在尝试下一首' }),
      );
      void nextTrack(true);
    }
  });
  element.addEventListener('ended', () => {
    if (audio !== element) return;
    if (player.repeat === 'one') {
      audio.currentTime = 0;
      void audio.play().catch(handleError);
    } else void nextTrack(true);
  });
}

watch(
  () => player.volume,
  (volume) => {
    audio.volume = Math.max(0, Math.min(1, volume));
  },
);
watch(
  () => player.muted,
  (muted) => {
    audio.muted = muted;
  },
);
watch(
  () => player.rate,
  (rate) => {
    audio.playbackRate = rate;
  },
);
watch(
  () => [player.volume, player.repeat, player.shuffle, player.trackId, player.queue.slice()],
  () => {
    try {
      localStorage.setItem(
        'abner:player',
        JSON.stringify({
          volume: player.volume,
          repeat: player.repeat,
          shuffle: player.shuffle,
          trackId: player.trackId,
          queue: player.queue,
        }),
      );
    } catch {}
  },
  { deep: true },
);

function handleError(error: unknown) {
  if (error instanceof DOMException && error.name === 'AbortError') return;
  player.loading = false;
  player.playing = false;
  player.error = error instanceof Error ? error.message : '无法播放音频';
}

function updateMediaState() {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.playbackState = player.playing ? 'playing' : 'paused';
  const track = currentTrack.value;
  if (track)
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: track.album,
      ...(track.artwork.startsWith('data:') ? { artwork: [{ src: track.artwork }] } : {}),
    });
}

export async function playTrack(track: Track, tracks?: Track[]) {
  const token = ++generation;
  const nextElement = track.kind === 'network' ? networkAudio : localAudio;
  if (audio !== nextElement) {
    audio.pause();
    audio = nextElement;
    loadedId = '';
    audio.volume = player.volume;
    audio.muted = player.muted;
  }
  if (tracks) {
    originalQueue = tracks.map((item) => item.id);
    player.queue = player.shuffle
      ? [track.id, ...shuffled(originalQueue.filter((id) => id !== track.id))]
      : [...originalQueue];
  }
  if (!player.queue.includes(track.id)) player.queue.push(track.id);
  player.trackId = track.id;
  player.error = '';
  player.loading = true;
  if (loadedId !== track.id) {
    audio.pause();
    player.currentTime = 0;
    player.duration = track.duration;
    if (importedUrl) {
      URL.revokeObjectURL(importedUrl);
      importedUrl = '';
    }
    let source = track.source;
    try {
      if (track.kind === 'demo') source = demoSource(track.id, track.duration);
      else if (track.source.startsWith('indexeddb:')) {
        const file = await loadFile(track.id);
        if (!file) throw new Error('原音频文件已不存在，请重新导入');
        if (token !== generation) return;
        source = URL.createObjectURL(file);
        importedUrl = source;
      }
      if (token !== generation) return;
      audio.src = source;
      loadedId = track.id;
      audio.playbackRate = player.rate;
    } catch (error) {
      handleError(error);
      return;
    }
  }
  if (audioContext?.state === 'suspended') await audioContext.resume();
  try {
    await audio.play();
    if (token !== generation) return;
    rememberTrack(track.id);
    updateMediaState();
  } catch (error) {
    if (token === generation) handleError(error);
  }
}

export function togglePlay() {
  if (player.loading) {
    generation++;
    audio.pause();
    player.loading = false;
    return;
  }
  if (player.playing) audio.pause();
  else if (currentTrack.value) void playTrack(currentTrack.value);
}

export async function nextTrack(automatic = false) {
  const tracks = queueTracks.value;
  if (!tracks.length) return;
  const index = tracks.findIndex((track) => track.id === player.trackId);
  if (automatic && index === tracks.length - 1 && player.repeat === 'off') {
    audio.pause();
    player.loading = false;
    return;
  }
  const next = tracks[(index + 1) % tracks.length];
  await playTrack(next);
}

export function previousTrack() {
  if (audio.currentTime > 3) {
    seek(0);
    return;
  }
  const tracks = queueTracks.value;
  if (!tracks.length) return;
  const index = tracks.findIndex((track) => track.id === player.trackId);
  void playTrack(tracks[(index - 1 + tracks.length) % tracks.length]);
}

export function seek(time: number) {
  if (!loadedId || !Number.isFinite(time) || !Number.isFinite(audio.duration)) return;
  audio.currentTime = Math.max(0, Math.min(time, audio.duration));
  player.currentTime = audio.currentTime;
}

export function toggleShuffle() {
  player.shuffle = !player.shuffle;
  if (player.shuffle) {
    originalQueue = [...player.queue];
    player.queue = [
      player.trackId,
      ...shuffled(player.queue.filter((id) => id !== player.trackId)),
    ];
  } else if (originalQueue.length) {
    player.queue = [
      ...new Set([...originalQueue.filter((id) => player.queue.includes(id)), ...player.queue]),
    ];
  }
}

export function cycleRepeat() {
  player.repeat = player.repeat === 'all' ? 'one' : player.repeat === 'one' ? 'off' : 'all';
}
export function addToQueue(track: Track) {
  if (!player.queue.includes(track.id)) player.queue.push(track.id);
}
export function removeFromQueue(id: string) {
  player.queue = player.queue.filter((item) => item !== id);
}
export function stopPlayback() {
  generation++;
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
  loadedId = '';
  player.currentTime = 0;
  player.duration = 0;
  player.loading = false;
}

export function setSleepTimer(minutes: number) {
  clearTimeout(sleepTimer);
  player.sleepMinutes = minutes;
  sleepEndsAt = minutes ? Date.now() + minutes * 60000 : 0;
  if (minutes)
    sleepTimer = setTimeout(() => {
      audio.pause();
      player.sleepMinutes = 0;
      sleepEndsAt = 0;
    }, minutes * 60000);
}

setInterval(() => {
  if (sleepEndsAt) player.sleepMinutes = Math.max(0, Math.ceil((sleepEndsAt - Date.now()) / 60000));
}, 10000);

export async function setEqualizer(values: number[], preset = '自定义') {
  if (currentTrack.value?.kind === 'network')
    throw new Error('网络资源暂不启用均衡器；本地音乐与内置试听支持音效调节');
  if (!audioContext) {
    audioContext = new AudioContext();
    let previous: AudioNode = audioContext.createMediaElementSource(localAudio);
    filters = [60, 230, 910, 3600, 8000, 14000].map((frequency) => {
      const filter = audioContext!.createBiquadFilter();
      filter.type = 'peaking';
      filter.frequency.value = frequency;
      filter.Q.value = 0.8;
      previous.connect(filter);
      previous = filter;
      return filter;
    });
    previous.connect(audioContext.destination);
  }
  await audioContext.resume();
  filters.forEach((filter, index) => {
    filter.gain.value = Math.max(-12, Math.min(12, values[index] || 0));
  });
  player.equalizer = [...values];
  player.eqPreset = preset;
}

if ('mediaSession' in navigator) {
  navigator.mediaSession.setActionHandler('play', () => {
    if (currentTrack.value) void playTrack(currentTrack.value);
  });
  navigator.mediaSession.setActionHandler('pause', () => audio.pause());
  navigator.mediaSession.setActionHandler('nexttrack', () => void nextTrack());
  navigator.mediaSession.setActionHandler('previoustrack', previousTrack);
  navigator.mediaSession.setActionHandler('seekto', (details) => seek(details.seekTime || 0));
}
