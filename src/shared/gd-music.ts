import type {
  GdMusicReference,
  MusicLyrics,
  MusicPlatform,
  MusicQuality,
  MusicResolution,
  MusicSearch,
  Track,
} from './types.ts';

export const gdApiUrl = 'https://music-api.gdstudio.xyz/api.php';
/**
 * 酷我走自己的接口：GD 音乐台的公开 API 目前不再开放 `source=kuwo`，
 * 而酷我自家的搜索 / 直链 / 歌词端点仍然可用。
 */
export const kuwoSearchUrl = 'https://search.kuwo.cn/r.s';
export const kuwoStreamUrl = 'https://antiserver.kuwo.cn/anti.s';
export const kuwoLyricsUrl = 'https://m.kuwo.cn/newh5/singles/songinfoandlrc';
export const kuwoArtworkUrl = 'https://img1.kuwo.cn/star/albumcover/';
export const musicPlatforms: { value: MusicPlatform; label: string }[] = [
  { value: 'netease', label: '网易云音乐' },
  { value: 'kuwo', label: '酷我音乐' },
  { value: 'joox', label: 'JOOX（实验）' },
];

export function isMusicPlatform(value: unknown): value is MusicPlatform {
  return musicPlatforms.some((item) => item.value === value);
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('音乐源返回了无效数据，请稍后重试');
  return value as Record<string, unknown>;
}

function textId(value: unknown) {
  if ((typeof value !== 'string' && typeof value !== 'number') || !String(value).trim())
    throw new Error('音乐资源 ID 无效');
  const result = String(value);
  if (result.length > 512 || /[\u0000-\u001f]/.test(result)) throw new Error('音乐资源 ID 无效');
  return result;
}

function platform(value: unknown): MusicPlatform {
  // 旧版本保存过已下线的平台（如 bilibili），这里给出可操作的提示。
  if (!isMusicPlatform(value)) throw new Error('该音乐平台已下线，请重新搜索这首歌');
  return value;
}

function reference(value: unknown): GdMusicReference {
  const input = record(value);
  if (input.provider !== 'gd') throw new Error('不支持的音乐源');
  return {
    provider: 'gd',
    platform: platform(input.platform),
    trackId: textId(input.trackId),
    ...(input.pictureId ? { pictureId: textId(input.pictureId) } : {}),
    ...(input.lyricId ? { lyricId: textId(input.lyricId) } : {}),
  };
}

function mediaUrl(value: unknown) {
  if (typeof value !== 'string' || !value.trim())
    throw new Error('该歌曲暂不可用，请稍后重试或切换音乐平台');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('音乐源返回的资源地址无效');
  }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password)
    throw new Error('音乐源返回的资源地址无效');
  return url.href;
}

/** 上游在缺少目标音质时返回空地址，按以下顺序回退到兼容音质。 */
const qualityFallbacks: MusicQuality[] = [320, 192, 128];
/** 上游会间歇返回空响应体或 5xx 错误页，先重试再判定结果。 */
const maxAttempts = 3;

/** 上游临时故障（空响应、非 JSON、5xx），可以安全重试。 */
class TransientSourceError extends Error {}

function pause(ms: number, signal: AbortSignal) {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', cancel);
      resolve();
    }, ms);
    const cancel = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    signal.addEventListener('abort', cancel, { once: true });
  });
}

/** 空地址代表当前音质没有音源，需交给音质回退处理，而不是当作请求失败。 */
function audioStream(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const item = body as Record<string, unknown>;
  const raw = typeof item.url === 'string' ? item.url.trim() : '';
  if (!raw) return null;
  return { url: mediaUrl(raw), quality: Number(item.br) || 0 };
}

const kuwoBitrates: Record<MusicQuality, string> = {
  128: '128kmp3',
  192: '192kmp3',
  320: '320kmp3',
  740: '2000kflac',
  999: '2000kflac',
};

function requestUrl(base: string, parameters: Record<string, string>) {
  const url = new URL(base);
  url.search = new URLSearchParams(parameters).toString();
  return url.href;
}

function kuwoSearchHref(keyword: string, page: number) {
  return requestUrl(kuwoSearchUrl, {
    all: keyword,
    ft: 'music',
    itemset: 'web_2013',
    client: 'kt',
    pn: String(page),
    rn: '20',
    rformat: 'json',
    encoding: 'utf8',
    mobi: '1',
  });
}

function kuwoStreamHref(trackId: string, quality: MusicQuality) {
  return requestUrl(kuwoStreamUrl, {
    type: 'convert_url',
    br: kuwoBitrates[quality],
    format: 'mp3',
    response: 'url',
    rid: /^MUSIC_/i.test(trackId) ? trackId : `MUSIC_${trackId}`,
  });
}

/** 酷我直链接口只返回一行纯文本地址，其它内容都代表没有音源。 */
function kuwoStream(body: unknown) {
  const raw = typeof body === 'string' ? body.trim() : '';
  if (!/^https?:\/\//i.test(raw)) return null;
  return { url: mediaUrl(raw), quality: 0 };
}

function plainText(value: unknown) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/&nbsp;?/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function kuwoArtists(value: unknown) {
  const names = plainText(value)
    .split('&')
    .map((name) => name.trim())
    .filter(Boolean);
  return names.length ? names.join(' / ') : '未知艺术家';
}

function kuwoTracks(body: unknown, source: MusicPlatform): Track[] {
  const data = record(body);
  if (!Array.isArray(data.abslist)) throw new Error('音乐源搜索结果无效，请重试');
  const tracks = new Map<string, Track>();
  for (const value of data.abslist) {
    try {
      const item = record(value);
      const trackId = textId(
        item.DC_TARGETID ?? String(item.MUSICRID || '').replace(/^MUSIC_/i, ''),
      );
      const title = plainText(item.SONGNAME) || plainText(item.NAME);
      if (!title) continue;
      const pictureId = plainText(item.web_albumpic_short);
      const remote: GdMusicReference = {
        provider: 'gd',
        platform: source,
        trackId,
        lyricId: trackId,
        ...(pictureId ? { pictureId } : {}),
      };
      const id = gdTrackId(remote);
      tracks.set(id, {
        id,
        remote,
        title,
        artist: kuwoArtists(item.ARTIST),
        album: plainText(item.ALBUM),
        duration: Number(item.DURATION) || 0,
        source: id,
        kind: 'network',
        artwork: 'ocean',
        format: 'STREAM',
        addedAt: Date.now(),
      });
    } catch {}
  }
  return [...tracks.values()];
}

function kuwoArtwork(short: string) {
  if (/^https?:\/\//i.test(short)) return mediaUrl(short);
  return mediaUrl(kuwoArtworkUrl + short.replace(/^\/+/, ''));
}

function lrcStamp(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${(seconds - minutes * 60).toFixed(2).padStart(5, '0')}`;
}

/** 酷我歌词是 JSON 时间轴，转换成播放器使用的 LRC 文本。 */
function kuwoLyrics(body: unknown): MusicLyrics {
  const data = body && typeof body === 'object' ? (body as Record<string, unknown>).data : null;
  const list = data && typeof data === 'object' ? (data as Record<string, unknown>).lrclist : null;
  if (!Array.isArray(list)) return { lyric: '', translation: '' };
  const lines: string[] = [];
  for (const value of list) {
    if (!value || typeof value !== 'object') continue;
    const item = value as Record<string, unknown>;
    const text = typeof item.lineLyric === 'string' ? item.lineLyric.trim() : '';
    const time = Number(item.time);
    if (!text || !Number.isFinite(time) || time < 0) continue;
    lines.push(`[${lrcStamp(time)}]${text}`);
  }
  return { lyric: lines.join('\n'), translation: '' };
}

export function gdTrackId(remote: GdMusicReference) {
  return `gd:${remote.platform}:${remote.trackId}`;
}

interface PendingRequest {
  controller: AbortController;
  promise: Promise<unknown>;
  subscribers: number;
}

interface RequestJob {
  priority: number;
  signal: AbortSignal;
  run(): void;
  reject(error: unknown): void;
}

export function createGdMusicClient(
  options: {
    request?: (url: string, init: RequestInit) => Promise<Response>;
    now?: () => number;
    /** 重试前的退避等待，测试可注入以跳过真实延时。 */
    wait?: (ms: number, signal: AbortSignal) => Promise<void>;
  } = {},
) {
  const fetchResource = options.request || ((url, init) => fetch(url, init));
  const wait = options.wait || pause;
  const now = options.now || Date.now;
  const cache = new Map<string, { expires: number; value: unknown }>();
  const pending = new Map<string, PendingRequest>();
  const jobs: RequestJob[] = [];
  let timestamps: number[] = [];
  let active = 0;

  function drain() {
    jobs.sort((first, second) => first.priority - second.priority);
    while (active < 2 && jobs.length) {
      const job = jobs.shift()!;
      if (job.signal.aborted) {
        job.reject(new DOMException('请求已取消', 'AbortError'));
        continue;
      }
      timestamps = timestamps.filter((time) => now() - time < 300_000);
      if (timestamps.length >= (job.priority === 0 ? 50 : 45)) {
        job.reject(new Error('音乐源请求频繁，请稍后重试（每 5 分钟最多 50 次）'));
        continue;
      }
      timestamps.push(now());
      active++;
      job.run();
    }
  }

  function request<Value>(
    target: string,
    options: {
      kind: 'url' | 'search' | 'metadata';
      ttl: number;
      parse: (value: unknown) => Value;
      signal?: AbortSignal;
      refresh?: boolean;
      /** 上游返回纯文本（酷我直链）而不是 JSON。 */
      text?: boolean;
    },
  ): Promise<Value> {
    const { kind, ttl, parse, signal, refresh = false, text = false } = options;
    if (signal?.aborted) return Promise.reject(new DOMException('请求已取消', 'AbortError'));
    const key = target;
    if (refresh) cache.delete(key);
    const cached = cache.get(key);
    if (cached && cached.expires > now()) return Promise.resolve(cached.value as Value);
    let entry = pending.get(key);
    if (!entry) {
      if (pending.size >= 24) return Promise.reject(new Error('音乐源繁忙，请稍后重试'));
      const controller = new AbortController();
      const promise = new Promise<Value>((resolve, reject) => {
        jobs.push({
          priority: kind === 'url' ? 0 : kind === 'search' ? 1 : 2,
          signal: controller.signal,
          reject,
          run() {
            const timeout = setTimeout(
              () => controller.abort(new Error('音乐源请求超时，请重试')),
              15_000,
            );
            const attempt = async (): Promise<Value> => {
              let lastError: unknown = new TransientSourceError('音乐源暂不可用，请稍后重试');
              for (let index = 0; index < maxAttempts; index++) {
                if (index) {
                  await wait(300 * index, controller.signal);
                  // 重试同样计入配额，避免抖动时把共享上游打满。
                  timestamps = timestamps.filter((time) => now() - time < 300_000);
                  if (timestamps.length >= 50)
                    throw new Error('音乐源请求频繁，请稍后重试（每 5 分钟最多 50 次）');
                  timestamps.push(now());
                }
                try {
                  const response = await fetchResource(key, {
                    signal: controller.signal,
                    credentials: 'omit',
                    redirect: 'error',
                  });
                  if (response.status === 429) throw new Error('音乐源请求频繁，请稍后重试');
                  if (!response.ok) {
                    const message = `音乐源暂不可用（HTTP ${response.status}）`;
                    if (response.status >= 500) throw new TransientSourceError(message);
                    throw new Error(message);
                  }
                  let body: unknown;
                  if (text) {
                    body = await response.text();
                  } else {
                    try {
                      body = await response.json();
                    } catch {
                      throw new TransientSourceError('音乐源返回了非 JSON 响应，请稍后重试');
                    }
                  }
                  controller.signal.throwIfAborted();
                  return parse(body);
                } catch (error) {
                  controller.signal.throwIfAborted();
                  if (!(error instanceof TransientSourceError) && !(error instanceof TypeError))
                    throw error;
                  lastError = error;
                }
              }
              throw lastError;
            };
            void (async () => {
              try {
                const value = await attempt();
                // 无音源（null）不写缓存，用户重试时仍会重新询问上游。
                if (value !== null && value !== undefined) {
                  cache.delete(key);
                  cache.set(key, { value, expires: now() + ttl });
                  if (cache.size > 200) cache.delete(cache.keys().next().value!);
                }
                resolve(value);
              } catch (error) {
                reject(controller.signal.aborted ? controller.signal.reason : error);
              } finally {
                clearTimeout(timeout);
                active--;
                drain();
              }
            })();
          },
        });
      });
      controller.signal.addEventListener(
        'abort',
        () => {
          const index = jobs.findIndex((job) => job.signal === controller.signal);
          if (index >= 0) jobs.splice(index, 1)[0].reject(controller.signal.reason);
        },
        { once: true },
      );
      entry = { controller, promise, subscribers: 0 };
      pending.set(key, entry);
      const current = entry;
      const clear = () => {
        if (pending.get(key) === current) pending.delete(key);
      };
      void promise.then(clear, clear);
      drain();
    }
    const current = entry;
    current.subscribers++;
    return new Promise<Value>((resolve, reject) => {
      let settled = false;
      const finish = (error: unknown, value?: unknown) => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener('abort', cancel);
        current.subscribers--;
        if (error) reject(error);
        else resolve(value as Value);
      };
      const cancel = () => {
        finish(new DOMException('请求已取消', 'AbortError'));
        if (!current.subscribers) {
          current.controller.abort();
          if (pending.get(key) === current) pending.delete(key);
          drain();
        }
      };
      signal?.addEventListener('abort', cancel, { once: true });
      void current.promise.then(
        (value) => finish(undefined, value),
        (error) => finish(error),
      );
    });
  }

  return {
    search(input: MusicSearch, signal?: AbortSignal) {
      const values = record(input);
      const source = platform(values.platform);
      if (
        typeof values.keyword !== 'string' ||
        !values.keyword.trim() ||
        values.keyword.length > 120
      )
        throw new Error('请输入 1–120 字的搜索内容');
      if (!Number.isInteger(values.page) || Number(values.page) < 1 || Number(values.page) > 100)
        throw new Error('搜索页码无效');
      const keyword = values.keyword.trim();
      if (source === 'kuwo')
        return request(kuwoSearchHref(keyword, Number(values.page)), {
          kind: 'search',
          ttl: 120_000,
          signal,
          parse: (body) => kuwoTracks(body, source),
        });
      return request(
        requestUrl(gdApiUrl, {
          types: 'search',
          source,
          name: keyword,
          count: '20',
          pages: String(values.page),
        }),
        {
          kind: 'search',
          ttl: 120_000,
          signal,
          parse: (body): Track[] => {
            if (!Array.isArray(body)) throw new Error('音乐源搜索结果无效，请重试');
            const tracks = new Map<string, Track>();
            for (const value of body) {
              try {
                const item = record(value);
                const remote = reference({
                  provider: 'gd',
                  platform: item.source,
                  trackId: item.id,
                  pictureId: item.pic_id,
                  lyricId: item.lyric_id,
                });
                if (
                  remote.platform !== source ||
                  typeof item.name !== 'string' ||
                  !item.name.trim()
                )
                  continue;
                const id = gdTrackId(remote);
                tracks.set(id, {
                  id,
                  remote,
                  title: item.name,
                  artist: Array.isArray(item.artist)
                    ? item.artist.filter((artist) => typeof artist === 'string').join(' / ')
                    : typeof item.artist === 'string'
                      ? item.artist
                      : '未知艺术家',
                  album: typeof item.album === 'string' ? item.album : '',
                  duration: 0,
                  source: id,
                  kind: 'network',
                  artwork: 'ocean',
                  format: 'STREAM',
                  addedAt: now(),
                });
              } catch {}
            }
            if (body.length && !tracks.size) throw new Error('音乐源搜索结果无效，请重试');
            return [...tracks.values()];
          },
        },
      );
    },
    /**
     * 解析播放地址：先重试上游抖动，再按音质逐级回退，
     * 只有在所有音质都拿不到地址时才判定歌曲不可用。
     */
    resolve(input: MusicResolution, signal?: AbortSignal) {
      const values = record(input);
      const remote = reference(values.remote);
      if (
        ![128, 192, 320, 740, 999].includes(Number(values.quality)) ||
        typeof values.quality !== 'number'
      )
        throw new Error('不支持的音质');
      if (values.refresh !== undefined && typeof values.refresh !== 'boolean')
        throw new Error('刷新参数无效');
      const qualities: MusicQuality[] = [values.quality as MusicQuality];
      for (const quality of qualityFallbacks)
        if (!qualities.includes(quality)) qualities.push(quality);
      const refresh = values.refresh === true;
      return (async (): Promise<{ url: string; quality: number }> => {
        for (const quality of qualities) {
          const found =
            remote.platform === 'kuwo'
              ? await request(kuwoStreamHref(remote.trackId, quality), {
                  kind: 'url',
                  ttl: 30_000,
                  parse: kuwoStream,
                  signal,
                  refresh,
                  text: true,
                })
              : await request(
                  requestUrl(gdApiUrl, {
                    types: 'url',
                    source: remote.platform,
                    id: remote.trackId,
                    br: String(quality),
                  }),
                  { kind: 'url', ttl: 30_000, parse: audioStream, signal, refresh },
                );
          if (found) return { ...found, quality: found.quality || quality };
        }
        throw new Error('该歌曲暂不可用，请稍后重试或切换音乐平台');
      })();
    },
    picture(value: GdMusicReference, signal?: AbortSignal) {
      const remote = reference(value);
      if (!remote.pictureId) return Promise.resolve('');
      if (remote.platform === 'kuwo') return Promise.resolve(kuwoArtwork(remote.pictureId));
      return request(
        requestUrl(gdApiUrl, {
          types: 'pic',
          source: remote.platform,
          id: remote.pictureId,
          size: '300',
        }),
        {
          kind: 'metadata',
          ttl: 3_600_000,
          signal,
          parse: (body) => {
            const item = record(body);
            return item.url ? mediaUrl(item.url) : '';
          },
        },
      );
    },
    lyrics(value: GdMusicReference, signal?: AbortSignal) {
      const remote = reference(value);
      const id = remote.lyricId || remote.trackId;
      const target =
        remote.platform === 'kuwo'
          ? requestUrl(kuwoLyricsUrl, {
              musicId: id.replace(/^MUSIC_/i, ''),
              httpsStatus: '1',
            })
          : requestUrl(gdApiUrl, { types: 'lyric', source: remote.platform, id });
      return request(target, {
        kind: 'metadata',
        ttl: 3_600_000,
        signal,
        parse:
          remote.platform === 'kuwo'
            ? kuwoLyrics
            : (body): MusicLyrics => {
                const item = record(body);
                return {
                  lyric: typeof item.lyric === 'string' ? item.lyric : '',
                  translation: typeof item.tlyric === 'string' ? item.tlyric : '',
                };
              },
      });
    },
  };
}
