import type { Track } from '../../shared/types';

export const demoTracks: Track[] = [
  {
    id: 'demo-1',
    title: '日光慢行',
    artist: 'Abner Studio',
    album: '留一点时间给自己',
    duration: 72,
    artwork: 'sunset',
    format: 'ORIGINAL',
    source: 'demo:1',
    kind: 'demo',
    addedAt: 6,
  },
  {
    id: 'demo-2',
    title: '森林来信',
    artist: 'Abner Studio',
    album: '森呼吸',
    duration: 64,
    artwork: 'forest',
    format: 'ORIGINAL',
    source: 'demo:2',
    kind: 'demo',
    addedAt: 5,
  },
  {
    id: 'demo-3',
    title: '蓝色时刻',
    artist: 'Abner Studio',
    album: '沿着海岸线',
    duration: 80,
    artwork: 'ocean',
    format: 'ORIGINAL',
    source: 'demo:3',
    kind: 'demo',
    addedAt: 4,
  },
  {
    id: 'demo-4',
    title: '微醺落日',
    artist: 'Abner Studio',
    album: '日落以后',
    duration: 68,
    artwork: 'dusk',
    format: 'ORIGINAL',
    source: 'demo:4',
    kind: 'demo',
    addedAt: 3,
  },
  {
    id: 'demo-5',
    title: '雨落之前',
    artist: 'Abner Studio',
    album: '一个人的咖啡馆',
    duration: 76,
    artwork: 'rain',
    format: 'ORIGINAL',
    source: 'demo:5',
    kind: 'demo',
    addedAt: 2,
  },
  {
    id: 'demo-6',
    title: '星际漂流',
    artist: 'Abner Studio',
    album: '晚安，宇宙',
    duration: 84,
    artwork: 'space',
    format: 'ORIGINAL',
    source: 'demo:6',
    kind: 'demo',
    addedAt: 1,
  },
];

export const collections = [
  {
    id: 'slow',
    name: '把生活调成慢速',
    subtitle: '轻音乐 / 放松 / 独处',
    artwork: 'sunset',
    trackIds: ['demo-1', 'demo-4', 'demo-5'],
    color: '#eee6d7',
  },
  {
    id: 'forest',
    name: '去有风的地方',
    subtitle: '自然 / 氛围 / 治愈',
    artwork: 'forest',
    trackIds: ['demo-2', 'demo-3', 'demo-1'],
    color: '#e0e7db',
  },
  {
    id: 'ocean',
    name: '一场蓝色的逃离',
    subtitle: '海边 / 纯音乐 / 漫游',
    artwork: 'ocean',
    trackIds: ['demo-3', 'demo-6', 'demo-2'],
    color: '#dde7ea',
  },
  {
    id: 'dusk',
    name: '日落是温柔的告白',
    subtitle: '爵士 / 松弛 / 黄昏',
    artwork: 'dusk',
    trackIds: ['demo-4', 'demo-1', 'demo-5'],
    color: '#f0dfd6',
  },
  {
    id: 'night',
    name: '晚安，整个世界',
    subtitle: '助眠 / 环境 / 夜晚',
    artwork: 'space',
    trackIds: ['demo-6', 'demo-5', 'demo-2'],
    color: '#e4dfee',
  },
];

export function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

export function validateAudioUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('请输入完整的 HTTP 或 HTTPS 音频链接');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new Error('仅支持不包含用户名和密码的 HTTP / HTTPS 音频链接');
  return url.href;
}

export interface LyricLine {
  time: number;
  text: string;
}

export function parseLyrics(value: string): LyricLine[] {
  const result: LyricLine[] = [];
  const offset = Number(value.match(/\[offset:([+-]?\d+)\]/i)?.[1] || 0) / 1000;
  for (const line of value.split(/\r?\n/)) {
    const text = line.replace(/\[[^\]]*\]/g, '').trim();
    for (const stamp of line.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)) {
      const fraction = stamp[3] ? Number(`0.${stamp[3]}`) : 0;
      result.push({
        time: Math.max(0, Number(stamp[1]) * 60 + Number(stamp[2]) + fraction - offset),
        text,
      });
    }
  }
  return result.sort((first, second) => first.time - second.time);
}

export function shuffled<T>(items: T[], random = Math.random): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}
