import type {
  GdMusicReference,
  MusicLyrics,
  MusicPlatform,
  MusicResolution,
  MusicSearch,
  Track,
} from './types.ts';

export const gdApiUrl = 'https://music-api.gdstudio.xyz/api.php';
export const musicPlatforms: { value: MusicPlatform; label: string }[] = [
  { value: 'netease', label: '网易云音乐' },
  { value: 'joox', label: 'JOOX（实验）' },
  { value: 'bilibili', label: 'Bilibili（实验）' },
];

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
  if (!musicPlatforms.some((item) => item.value === value)) throw new Error('不支持的音乐平台');
  return value as MusicPlatform;
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
  } = {},
) {
  const fetchResource = options.request || ((url, init) => fetch(url, init));
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
    parameters: Record<string, string>,
    ttl: number,
    parse: (value: unknown) => Value,
    signal?: AbortSignal,
    refresh = false,
  ): Promise<Value> {
    if (signal?.aborted) return Promise.reject(new DOMException('请求已取消', 'AbortError'));
    const url = new URL(gdApiUrl);
    url.search = new URLSearchParams(parameters).toString();
    const key = url.href;
    if (refresh) cache.delete(key);
    const cached = cache.get(key);
    if (cached && cached.expires > now()) return Promise.resolve(cached.value as Value);
    let entry = pending.get(key);
    if (!entry) {
      if (pending.size >= 24) return Promise.reject(new Error('音乐源繁忙，请稍后重试'));
      const controller = new AbortController();
      const promise = new Promise<Value>((resolve, reject) => {
        jobs.push({
          priority: parameters.types === 'url' ? 0 : parameters.types === 'search' ? 1 : 2,
          signal: controller.signal,
          reject,
          run() {
            const timeout = setTimeout(
              () => controller.abort(new Error('音乐源请求超时，请重试')),
              15_000,
            );
            void (async () => {
              try {
                const response = await fetchResource(key, {
                  signal: controller.signal,
                  credentials: 'omit',
                  redirect: 'error',
                });
                if (!response.ok)
                  throw new Error(
                    response.status === 429
                      ? '音乐源请求频繁，请稍后重试'
                      : `音乐源暂不可用（HTTP ${response.status}）`,
                  );
                let body: unknown;
                try {
                  body = await response.json();
                } catch {
                  throw new Error('音乐源返回了非 JSON 响应，请稍后重试');
                }
                controller.signal.throwIfAborted();
                const value = parse(body);
                cache.delete(key);
                cache.set(key, { value, expires: now() + ttl });
                if (cache.size > 200) cache.delete(cache.keys().next().value!);
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
      return request(
        {
          types: 'search',
          source,
          name: values.keyword.trim(),
          count: '20',
          pages: String(values.page),
        },
        120_000,
        (body): Track[] => {
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
              if (remote.platform !== source || typeof item.name !== 'string' || !item.name.trim())
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
        signal,
      );
    },
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
      return request(
        { types: 'url', source: remote.platform, id: remote.trackId, br: String(values.quality) },
        30_000,
        (body) => {
          const item = record(body);
          return { url: mediaUrl(item.url), quality: Number(item.br) || 0 };
        },
        signal,
        values.refresh === true,
      );
    },
    picture(value: GdMusicReference, signal?: AbortSignal) {
      const remote = reference(value);
      if (!remote.pictureId) return Promise.resolve('');
      return request(
        { types: 'pic', source: remote.platform, id: remote.pictureId, size: '300' },
        3_600_000,
        (body) => {
          const item = record(body);
          return item.url ? mediaUrl(item.url) : '';
        },
        signal,
      );
    },
    lyrics(value: GdMusicReference, signal?: AbortSignal) {
      const remote = reference(value);
      return request(
        { types: 'lyric', source: remote.platform, id: remote.lyricId || remote.trackId },
        3_600_000,
        (body): MusicLyrics => {
          const item = record(body);
          return {
            lyric: typeof item.lyric === 'string' ? item.lyric : '',
            translation: typeof item.tlyric === 'string' ? item.tlyric : '',
          };
        },
        signal,
      );
    },
  };
}
