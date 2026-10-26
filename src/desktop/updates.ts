import type { UpdateStatus } from '../shared/types.ts';
import { parseReleases, selectUpdate, updateChannel, updateRepository } from '../shared/updates.ts';

export function createUpdateController(options: {
  version: string;
  request: (url: string, options?: RequestInit) => Promise<Response>;
  onStatus: (status: UpdateStatus) => void;
}) {
  let pending: Promise<UpdateStatus> | undefined;
  const channel = updateChannel(options.version) === 'beta' ? 'Beta' : '正式版';
  async function perform(): Promise<UpdateStatus> {
    options.onStatus({ state: 'checking', message: `正在检查${channel}更新…` });
    let status: UpdateStatus;
    try {
      const response = await options.request(
        `https://api.github.com/repos/${updateRepository}/releases?per_page=100`,
        {
          headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Abner-Music' },
          signal: AbortSignal.timeout(30000),
        },
      );
      if (!response.ok) {
        throw new Error(
          [403, 429].includes(response.status)
            ? 'GitHub 请求过于频繁，请稍后重试'
            : `GitHub HTTP ${response.status}`,
        );
      }
      const release = selectUpdate(parseReleases(await response.json()), options.version);
      status = release
        ? { state: 'available', message: `发现 v${release.version}，可查看更新日志`, release }
        : { state: 'idle', message: `当前已是最新${channel}（v${options.version}）` };
    } catch (error) {
      status = {
        state: 'error',
        message: `检查更新失败：${error instanceof Error ? error.message : String(error)}`,
      };
    }
    options.onStatus(status);
    return status;
  }
  return {
    check() {
      if (!pending) pending = perform().finally(() => (pending = undefined));
      return pending;
    },
  };
}
