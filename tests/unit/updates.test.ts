import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createUpdateController } from '../../src/desktop/updates.ts';
import { parseReleases, releasePageUrl, selectUpdate } from '../../src/shared/updates.ts';
import type { GitHubRelease } from '../../src/shared/updates.ts';
import type { UpdateStatus } from '../../src/shared/types.ts';

function release(version: string, overrides: Partial<GitHubRelease> = {}): GitHubRelease {
  return {
    tag_name: `v${version}`,
    draft: false,
    prerelease: version.includes('-'),
    html_url: releasePageUrl(`v${version}`),
    name: `Abner Music v${version}`,
    body: '更新日志\n- 新增手动更新\n- 优化播放体验',
    published_at: '2026-10-26T08:00:00Z',
    ...overrides,
  };
}

describe('release selection', () => {
  it('orders Beta versions numerically and ignores drafts, older versions and other preview channels', () => {
    const target = selectUpdate(
      [
        release('0.1.0-beta.2'),
        release('0.1.0-beta.10'),
        release('0.2.0-alpha.1'),
        release('0.2.0-beta.1', { draft: true }),
        release('0.1.0-beta.1'),
      ],
      '0.1.0-beta.1',
    );
    assert.equal(target?.version, '0.1.0-beta.10');
    assert.equal(target?.url, releasePageUrl('v0.1.0-beta.10'));
    assert.match(target?.notes || '', /新增手动更新/);
  });
  it('keeps stable users on stable releases and allows Beta users to graduate to stable', () => {
    const releases = [release('0.2.0-beta.1'), release('0.1.1')];
    assert.equal(selectUpdate(releases, '0.1.0')?.version, '0.1.1');
    assert.equal(selectUpdate([release('0.1.0')], '0.1.0-beta.1')?.version, '0.1.0');
    assert.equal(selectUpdate([release('0.1.0-beta.1')], '0.1.0-beta.1'), undefined);
  });
  it('rejects malformed versions, mismatched preview flags and external or credential-bearing URLs', () => {
    const releases = [
      release('invalid'),
      release('0.2.0-beta.1', { prerelease: false }),
      release('0.2.0', { html_url: 'https://example.com/download' }),
      release('0.2.0', {
        html_url: 'https://user:password@github.com/abner-forever/abner-music/releases/tag/v0.2.0',
      }),
    ];
    assert.equal(selectUpdate(releases, '0.1.0-beta.1'), undefined);
    assert.throws(() => selectUpdate([], 'invalid'));
    assert.throws(() => parseReleases({ message: 'rate limited' }));
    assert.deepEqual(parseReleases([null, {}, 'release']), []);
  });
  it('provides a fallback for missing notes', () => {
    assert.equal(
      selectUpdate([release('0.2.0', { body: null })], '0.1.0')?.notes,
      '此版本暂无更新日志。',
    );
  });
});

describe('manual update checks', () => {
  it('returns changelog metadata from a real-shaped API response and makes only one concurrent request', async () => {
    const statuses: UpdateStatus[] = [];
    let calls = 0;
    const controller = createUpdateController({
      version: '0.1.0-beta.1',
      request: async (url) => {
        calls++;
        assert.equal(
          url,
          'https://api.github.com/repos/abner-forever/abner-music/releases?per_page=100',
        );
        return Response.json([release('0.1.0-beta.2')]);
      },
      onStatus: (status) => statuses.push(status),
    });
    const [first, second] = await Promise.all([controller.check(), controller.check()]);
    assert.equal(calls, 1);
    assert.equal(first, second);
    assert.equal(first.state, 'available');
    assert.equal(first.release?.version, '0.1.0-beta.2');
    assert.deepEqual(
      statuses.map((status) => status.state),
      ['checking', 'available'],
    );
  });
  it('reports rate limiting and recovers on retry without retaining an old release', async () => {
    let attempts = 0;
    const controller = createUpdateController({
      version: '0.1.0',
      request: async () =>
        ++attempts === 1 ? new Response(null, { status: 403 }) : Response.json([]),
      onStatus: () => {},
    });
    const failed = await controller.check();
    assert.equal(failed.state, 'error');
    assert.match(failed.message, /过于频繁/);
    assert.equal((await controller.check()).state, 'idle');
  });
  it('reports network failures instead of claiming the application is up to date', async () => {
    const controller = createUpdateController({
      version: '0.1.0-beta.1',
      request: async () => {
        throw new Error('offline');
      },
      onStatus: () => {},
    });
    assert.deepEqual(await controller.check(), {
      state: 'error',
      message: '检查更新失败：offline',
    });
  });
});
