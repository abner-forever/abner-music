import { gt, prerelease, rcompare, valid } from 'semver';
import type { ReleaseInfo } from './types.ts';

export const updateRepository = 'abner-forever/abner-music';

export interface GitHubRelease {
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  html_url: string;
  name: string | null;
  body: string | null;
  published_at: string | null;
}

export function updateChannel(version: string) {
  return prerelease(version)?.[0] === 'beta' ? 'beta' : 'stable';
}

export function selectUpdate(
  releases: GitHubRelease[],
  currentVersion: string,
): ReleaseInfo | undefined {
  if (!valid(currentVersion)) throw new Error('当前应用版本号无效');
  const candidates = releases
    .filter((release) => {
      const version = valid(release.tag_name);
      if (release.draft || !version || !gt(version, currentVersion)) return false;
      if (release.html_url !== releasePageUrl(release.tag_name)) return false;
      const preview = prerelease(version);
      if (preview && (updateChannel(currentVersion) !== 'beta' || preview[0] !== 'beta'))
        return false;
      return release.prerelease === Boolean(preview);
    })
    .sort((first, second) => rcompare(first.tag_name, second.tag_name));
  const release = candidates[0];
  if (!release) return;
  return {
    version: release.tag_name.replace(/^v/, ''),
    title: release.name || release.tag_name,
    notes: release.body?.slice(0, 100000) || '此版本暂无更新日志。',
    publishedAt: release.published_at || '',
    url: release.html_url,
  };
}

export function releasePageUrl(tag: string) {
  return `https://github.com/${updateRepository}/releases/tag/${encodeURIComponent(tag)}`;
}

export function parseReleases(value: unknown): GitHubRelease[] {
  if (!Array.isArray(value)) throw new Error('GitHub 返回了无效的发布列表');
  return value.filter(
    (release): release is GitHubRelease =>
      release &&
      typeof release.tag_name === 'string' &&
      typeof release.draft === 'boolean' &&
      typeof release.prerelease === 'boolean' &&
      typeof release.html_url === 'string' &&
      (release.name === null || typeof release.name === 'string') &&
      (release.body === null || typeof release.body === 'string') &&
      (release.published_at === null || typeof release.published_at === 'string'),
  );
}
