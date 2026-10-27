import { createGdMusicClient } from '../../shared/gd-music';
import type { MusicBridge } from '../../shared/types';

const browserClient = createGdMusicClient();

function invoke<Value>(
  operation: (bridge: MusicBridge, requestId: string) => Promise<Value>,
  signal?: AbortSignal,
): Promise<Value> {
  const bridge = window.desktop!.music;
  const requestId = crypto.randomUUID();
  if (signal?.aborted) return Promise.reject(new DOMException('请求已取消', 'AbortError'));
  return new Promise<Value>((resolve, reject) => {
    const cancel = () => {
      bridge.cancel(requestId);
      reject(new DOMException('请求已取消', 'AbortError'));
    };
    signal?.addEventListener('abort', cancel, { once: true });
    void operation(bridge, requestId)
      .then(resolve, reject)
      .finally(() => signal?.removeEventListener('abort', cancel));
  });
}

export const gdMusic: ReturnType<typeof createGdMusicClient> = {
  search: (input, signal) =>
    window.desktop
      ? invoke((bridge, id) => bridge.search(input, id), signal)
      : browserClient.search(input, signal),
  resolve: (input, signal) =>
    window.desktop
      ? invoke(
          (bridge, id) => bridge.resolve({ ...input, remote: { ...input.remote } }, id),
          signal,
        )
      : browserClient.resolve(input, signal),
  picture: (remote, signal) =>
    window.desktop
      ? invoke((bridge, id) => bridge.picture({ ...remote }, id), signal)
      : browserClient.picture(remote, signal),
  lyrics: (remote, signal) =>
    window.desktop
      ? invoke((bridge, id) => bridge.lyrics({ ...remote }, id), signal)
      : browserClient.lyrics(remote, signal),
};
