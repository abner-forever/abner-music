import { createGdMusicClient } from '../shared/gd-music.ts';

export function createGdMusicController(
  request: (url: string, init: RequestInit) => Promise<Response>,
) {
  const client = createGdMusicClient({ request });
  const requests = new Map<string, AbortController>();
  return {
    client,
    async run<Value>(requestId: unknown, operation: (signal: AbortSignal) => Promise<Value>) {
      if (typeof requestId !== 'string' || !/^[\w-]{1,80}$/.test(requestId))
        throw new Error('音乐请求 ID 无效');
      if (requests.has(requestId) || requests.size >= 24)
        throw new Error('音乐请求过多，请稍后重试');
      const controller = new AbortController();
      requests.set(requestId, controller);
      try {
        return await operation(controller.signal);
      } finally {
        requests.delete(requestId);
      }
    },
    cancel(requestId: unknown) {
      if (typeof requestId === 'string') requests.get(requestId)?.abort();
    },
    dispose() {
      for (const controller of requests.values()) controller.abort();
      requests.clear();
    },
  };
}
