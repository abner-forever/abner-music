import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

function audioFixture() {
  const sampleRate = 22050;
  const wav = Buffer.alloc(44 + sampleRate * 20 * 2);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(wav.length - 44, 40);
  for (let index = 0; index < sampleRate * 20; index++)
    wav.writeInt16LE(
      Math.round(Math.sin((index / sampleRate) * Math.PI * 440 * 2) * 3000),
      44 + index * 2,
    );
  return wav;
}

async function fixtures(
  page: Page,
  options: { brokenAttempts?: number; delayTrack?: string } = {},
) {
  const requests: { type: string; id: string; platform: string; page: string; keyword: string }[] =
    [];
  let resolutions = 0;
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  const wav = audioFixture();
  await page.route('https://music-api.gdstudio.xyz/api.php?*', async (route) => {
    const parameters = new URL(route.request().url()).searchParams;
    const type = parameters.get('types')!;
    const id = parameters.get('id') || '';
    const platform = parameters.get('source')!;
    requests.push({
      type,
      id,
      platform,
      page: parameters.get('pages') || '',
      keyword: parameters.get('name') || '',
    });
    if (type === 'search') {
      await route.fulfill({
        json:
          parameters.get('name') === '没有结果'
            ? []
            : [
                {
                  id: '123',
                  name: '在线晚风',
                  artist: ['测试艺术家'],
                  album: '夜色',
                  source: platform,
                  pic_id: 'cover',
                  lyric_id: 'words',
                },
                {
                  id: '456',
                  name: '慢速曲目',
                  artist: ['另一位歌手'],
                  album: '等待',
                  source: platform,
                  pic_id: 'other',
                  lyric_id: 'other',
                },
                { id: '789', name: '暂不可用', artist: ['未知歌手'], source: platform },
              ],
      });
    } else if (type === 'url') {
      resolutions++;
      if (id === options.delayTrack) await delayed;
      await route
        .fulfill({
          json: {
            url:
              id === '789' || id === options.delayTrack
                ? ''
                : `http://127.0.0.1:5173/gd-${resolutions <= (options.brokenAttempts || 0) ? 'broken' : 'sample'}.wav?v=${resolutions}`,
            br: 320,
          },
        })
        .catch(() => undefined);
    } else if (type === 'pic') {
      await route.fulfill({ json: { url: 'https://artwork.example/gd-cover.png' } });
    } else {
      await route.fulfill({
        json: {
          lyric: '[00:00]在线歌词第一句\n[00:04]在线歌词第二句',
          tlyric: '[00:00]Translation',
        },
      });
    }
  });
  await page.route('https://artwork.example/**', (route) => route.fulfill({ status: 404 }));
  await page.route('**/gd-broken.wav?*', (route) => route.fulfill({ status: 404 }));
  await page.route('**/gd-sample.wav?*', (route) => {
    const range = route
      .request()
      .headers()
      .range?.match(/bytes=(\d+)-(\d*)/);
    const start = range ? Number(range[1]) : 0;
    const end = range?.[2] ? Math.min(Number(range[2]), wav.length - 1) : wav.length - 1;
    return route.fulfill({
      status: range ? 206 : 200,
      body: wav.subarray(start, end + 1),
      contentType: 'audio/wav',
      headers: {
        'Accept-Ranges': 'bytes',
        'Content-Length': String(end - start + 1),
        ...(range ? { 'Content-Range': `bytes ${start}-${end}/${wav.length}` } : {}),
      },
    });
  });
  return {
    requests,
    release,
    get resolutions() {
      return resolutions;
    },
  };
}

async function openSearch(page: Page) {
  await page.goto('/');
  await page.locator('.sidebar').getByRole('button', { name: '网络音乐', exact: true }).click();
  await page.getByRole('button', { name: '在线搜索', exact: true }).click();
  await page.getByRole('textbox', { name: '在线搜索关键词' }).fill('晚风');
  await page.getByRole('button', { name: '搜索在线音乐', exact: true }).click();
  await expect(page.locator('.online-track')).toHaveCount(3);
}

test('online search saves only selected tracks, plays, seeks and restores stable references', async ({
  page,
}) => {
  const fixture = await fixtures(page);
  await openSearch(page);
  expect(fixture.requests.map((request) => request.type)).toEqual(['search']);
  expect(await page.evaluate(() => localStorage.getItem('abner:library') || '')).not.toContain(
    'gd:netease:',
  );
  await page.getByRole('button', { name: '在线收藏 在线晚风', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '加入音乐库 在线晚风', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: '在线歌曲加入歌单 在线晚风', exact: true }).click();
  await page
    .locator('.playlist-picker')
    .getByRole('button', { name: /给自己的留白/ })
    .click();
  await page.getByRole('button', { name: '在线播放 在线晚风', exact: true }).click();
  await expect(page.locator('.play-toggle')).toHaveAttribute('aria-label', '暂停');
  await expect
    .poll(() => fixture.requests.filter((request) => request.type === 'lyric').length)
    .toBe(1);
  await page.getByRole('slider', { name: '播放进度' }).fill('6');
  await expect(page.locator('.timeline > span').first()).toHaveText('0:06');
  await page.getByRole('button', { name: '歌词', exact: true }).click();
  await expect(page.locator('.lyrics-lines button')).toHaveCount(2);
  await page.locator('.sidebar').getByRole('button', { name: '网络音乐', exact: true }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('abner:library')!));
  expect(saved.tracks).toHaveLength(1);
  expect(saved.tracks[0].source).toBe('gd:netease:123');
  expect(saved.tracks[0].remote.trackId).toBe('123');
  expect(JSON.stringify(saved)).not.toContain('gd-sample.wav');
  await page.reload();
  await page.locator('.sidebar').getByRole('button', { name: '给自己的留白', exact: true }).click();
  const row = page.locator('.track-row').filter({ hasText: '在线晚风' });
  await expect(row.locator('.favorite-button')).toHaveClass(/active/);
  await row.getByRole('button', { name: '播放 在线晚风', exact: true }).click();
  await expect(page.locator('.play-toggle')).toHaveAttribute('aria-label', '暂停');
  expect(fixture.resolutions).toBe(2);
  await expect(page.locator('.player-error')).toHaveCount(0);
});

test('cancelled resolution cannot overwrite a newer song and unavailable media remains retryable', async ({
  page,
}) => {
  const fixture = await fixtures(page, { delayTrack: '456' });
  await openSearch(page);
  await page.getByRole('button', { name: '在线播放 慢速曲目', exact: true }).click();
  await expect.poll(() => fixture.resolutions).toBe(1);
  await page.getByRole('button', { name: '在线播放 在线晚风', exact: true }).click();
  await expect(page.locator('.play-toggle')).toHaveAttribute('aria-label', '暂停');
  fixture.release();
  await expect(page.locator('.player-song-copy strong')).toHaveText('在线晚风');
  await expect(page.locator('.player-error')).toHaveCount(0);
  await page.getByRole('button', { name: '在线播放 暂不可用', exact: true }).click();
  await expect(page.locator('.player-error')).toContainText('暂不可用');
  await expect(page.locator('.play-toggle')).toHaveAttribute('aria-label', '播放');
  expect(fixture.resolutions).toBe(3);
  await page.locator('.play-toggle').click();
  await expect.poll(() => fixture.resolutions).toBe(4);
  await expect(page.locator('.player-song-copy strong')).toHaveText('暂不可用');
});

test('failed audio refreshes its address once and a long pause refreshes before resuming', async ({
  page,
}) => {
  const fixture = await fixtures(page, { brokenAttempts: 1 });
  await openSearch(page);
  await page.getByRole('button', { name: '在线播放 在线晚风', exact: true }).click();
  await expect(page.locator('.play-toggle')).toHaveAttribute('aria-label', '暂停');
  expect(fixture.resolutions).toBe(2);
  await page.getByRole('slider', { name: '播放进度' }).fill('8');
  await page.locator('.play-toggle').click();
  await page.evaluate(() => {
    const now = Date.now();
    Date.now = () => now + 310_000;
  });
  await page.locator('.play-toggle').click();
  await expect(page.locator('.play-toggle')).toHaveAttribute('aria-label', '暂停');
  await expect.poll(() => fixture.resolutions).toBe(3);
  await expect(page.locator('.timeline > span').first()).toHaveText(/0:0[89]/);
  await expect(page.locator('.player-error')).toHaveCount(0);
});

test('repeated media failures stop after one refresh', async ({ page }) => {
  const fixture = await fixtures(page, { brokenAttempts: 20 });
  await openSearch(page);
  await page.getByRole('button', { name: '在线播放 在线晚风', exact: true }).click();
  await expect(page.locator('.player-error')).toBeVisible();
  await expect(page.locator('.play-toggle')).toHaveAttribute('aria-label', '播放');
  expect(fixture.resolutions).toBe(2);
});

test('platform and pagination requests remain separate from the library search', async ({
  page,
}) => {
  const fixture = await fixtures(page);
  await openSearch(page);
  await page.getByRole('button', { name: '下一页', exact: true }).click();
  await expect(page.locator('.online-pagination')).toContainText('第 2 页');
  expect(fixture.requests.at(-1)?.page).toBe('2');
  await page.getByRole('combobox', { name: '音乐平台' }).click();
  await page.getByRole('option', { name: 'JOOX（实验）', exact: true }).click();
  await expect(page.locator('.online-track')).toHaveCount(0);
  await page.getByRole('button', { name: '搜索在线音乐', exact: true }).click();
  await expect(page.locator('.online-track')).toHaveCount(3);
  expect(fixture.requests.at(-1)?.platform).toBe('joox');
  await expect(page.getByRole('button', { name: '下一页', exact: true })).toBeDisabled();
  await page.getByRole('textbox', { name: '在线搜索关键词' }).fill('没有结果');
  await page.getByRole('button', { name: '搜索在线音乐', exact: true }).click();
  await expect(page.getByRole('heading', { name: '没有找到相关音乐', exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: '搜索音乐', exact: true }).fill('日光');
  await expect(page.locator('.track-title')).toHaveText('日光慢行');
});

test('top search matches the library while typing and Enter searches online even with matches', async ({
  page,
}) => {
  const fixture = await fixtures(page);
  await page.goto('/');
  await page
    .locator('.sidebar')
    .getByRole('button', { name: /全部音乐/ })
    .click();
  await page.getByRole('button', { name: '本地', exact: true }).click();
  await expect(page.locator('.track-row')).toHaveCount(0);
  const search = page.getByRole('textbox', { name: '搜索音乐', exact: true });
  await search.fill('日光');
  await expect(page.locator('.track-title')).toHaveText('日光慢行');
  await expect(page.locator('.online-music')).toHaveCount(0);
  expect(fixture.requests).toEqual([]);
  await search.press('Enter');
  await expect(page.locator('.online-track')).toHaveCount(3);
  await expect(
    page.getByRole('region', { name: '音乐库匹配结果' }).locator('.track-title'),
  ).toHaveText('日光慢行');
  expect(fixture.requests.map((request) => request.keyword)).toEqual(['日光']);
  await expect(page.getByRole('textbox', { name: '在线搜索关键词' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '搜索在线音乐', exact: true })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: '音乐平台' })).toHaveCount(0);
  await page.getByRole('button', { name: '在线播放 在线晚风', exact: true }).click();
  await expect(page.locator('.play-toggle')).toHaveAttribute('aria-label', '暂停');
  await expect(page.locator('.online-track')).toHaveCount(3);
  await page.getByRole('button', { name: '在线收藏 在线晚风', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '取消在线收藏 在线晚风', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.online-track')).toHaveCount(3);
  await page.getByRole('button', { name: 'JOOX', exact: true }).click();
  await expect(page.locator('.online-track')).toHaveCount(3);
  await expect(
    page.getByRole('region', { name: '音乐库匹配结果' }).locator('.track-title'),
  ).toHaveText('日光慢行');
  expect(fixture.requests.filter((request) => request.type === 'search').at(-1)).toMatchObject({
    platform: 'joox',
    keyword: '日光',
  });
  await search.fill('森林');
  await expect(page.locator('.track-title')).toHaveText('森林来信');
  await expect(page.locator('.online-music')).toHaveCount(0);
  await search.press('Enter');
  await expect(page.locator('.online-track')).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'JOOX', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(fixture.requests.filter((request) => request.type === 'search').at(-1)).toMatchObject({
    platform: 'joox',
    keyword: '森林',
    page: '1',
  });
  await search.clear();
  await expect(page.locator('.main-content h1')).toContainText('我的音乐');
});

test('top search does not request online resources until Enter and handles empty results', async ({
  page,
}) => {
  const fixture = await fixtures(page);
  await page.goto('/');
  const search = page.getByRole('textbox', { name: '搜索音乐', exact: true });
  await search.fill('正在输入');
  await search.fill('没有结果');
  await expect(page.locator('.online-music')).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: '音乐库中没有匹配的歌曲', exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(500);
  expect(fixture.requests).toEqual([]);
  await search.press('Enter');
  await expect(page.getByRole('heading', { name: '没有找到相关音乐', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: '音乐库匹配结果' })).toHaveCount(0);
  expect(fixture.requests.map((request) => request.keyword)).toEqual(['没有结果']);
  await search.fill('应当取消的搜索');
  await search.clear();
  await search.press('Enter');
  await expect(page.locator('.online-music')).toHaveCount(0);
  await page.waitForTimeout(500);
  expect(fixture.requests.map((request) => request.keyword)).toEqual(['没有结果']);
});

test('top online search reports failures and retries the same keyword', async ({ page }) => {
  const fixture = await fixtures(page);
  let failed = false;
  await page.route('https://music-api.gdstudio.xyz/api.php?*', async (route) => {
    if (!failed) {
      failed = true;
      await route.fulfill({ status: 503, body: 'Unavailable' });
    } else await route.fallback();
  });
  await page.goto('/');
  await page.getByRole('textbox', { name: '搜索音乐', exact: true }).fill('日光');
  await page.getByRole('textbox', { name: '搜索音乐', exact: true }).press('Enter');
  await expect(page.locator('.online-error')).toBeVisible();
  await expect(
    page.getByRole('region', { name: '音乐库匹配结果' }).locator('.track-title'),
  ).toHaveText('日光慢行');
  await page.getByRole('button', { name: '重试', exact: true }).click();
  await expect(page.locator('.online-track')).toHaveCount(3);
  expect(fixture.requests[0].keyword).toBe('日光');
});

test('imported matches remain playable during online loading and empty results', async ({
  page,
}) => {
  await fixtures(page);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('https://music-api.gdstudio.xyz/api.php?*', async (route) => {
    await pending;
    await route.fulfill({ json: [] });
  });
  await page.goto('/');
  await page.locator('input[type=file][multiple]').setInputFiles({
    name: '喜欢你.wav',
    mimeType: 'audio/wav',
    buffer: audioFixture(),
  });
  const search = page.getByRole('textbox', { name: '搜索音乐', exact: true });
  await search.fill('喜欢你');
  await search.press('Enter');
  const libraryResults = page.getByRole('region', { name: '音乐库匹配结果' });
  await expect(libraryResults.locator('.track-title')).toHaveText('喜欢你');
  await expect(page.locator('.online-music [role=status]')).toBeVisible();
  await libraryResults.getByRole('button', { name: '播放 喜欢你', exact: true }).click();
  await expect(page.locator('.play-toggle')).toHaveAttribute('aria-label', '暂停');
  release();
  await expect(page.getByRole('heading', { name: '没有找到相关音乐', exact: true })).toBeVisible();
  await expect(libraryResults.locator('.track-title')).toHaveText('喜欢你');
  await libraryResults.getByRole('button', { name: '喜欢歌曲', exact: true }).click();
  await expect(libraryResults.locator('.favorite-button')).toHaveClass(/active/);
});

test('top search ignores Enter during Chinese composition', async ({ page }) => {
  const fixture = await fixtures(page);
  await page.goto('/');
  const search = page.getByRole('textbox', { name: '搜索音乐', exact: true });
  await search.fill('日光');
  await search.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true });
  await expect(page.locator('.online-music')).toHaveCount(0);
  expect(fixture.requests).toEqual([]);
  await search.press('Enter');
  await expect(page.locator('.online-track')).toHaveCount(3);
});

test('editing a submitted query cancels old results and pagination starts over on source changes', async ({
  page,
}) => {
  const fixture = await fixtures(page);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('https://music-api.gdstudio.xyz/api.php?*', async (route) => {
    if (new URL(route.request().url()).searchParams.get('name') === '延迟搜索') await pending;
    await route.fallback().catch(() => undefined);
  });
  await page.goto('/');
  const search = page.getByRole('textbox', { name: '搜索音乐', exact: true });
  await search.fill('延迟搜索');
  await search.press('Enter');
  await expect(page.locator('.online-music [role=status]')).toBeVisible();
  await search.fill('新搜索');
  await expect(page.locator('.online-music')).toHaveCount(0);
  release();
  await search.press('Enter');
  await expect(page.locator('.online-track')).toHaveCount(3);
  await page.getByRole('button', { name: '下一页', exact: true }).click();
  await expect(page.locator('.online-pagination')).toContainText('第 2 页');
  await page.getByRole('button', { name: 'Bilibili', exact: true }).click();
  await expect(page.locator('.online-pagination')).toContainText('第 1 页');
  expect(fixture.requests.at(-1)).toMatchObject({
    platform: 'bilibili',
    keyword: '新搜索',
    page: '1',
  });
  await expect(page.locator('.online-results-footer')).toBeVisible();
  await expect(page.locator('.online-source-tabs')).toBeVisible();
});

test('online actions distinguish the library, playlists and downloads', async ({ page }) => {
  const fixture = await fixtures(page);
  await openSearch(page);
  await page.getByRole('textbox', { name: '在线搜索关键词' }).fill('下载测试');
  await page.getByRole('button', { name: '搜索在线音乐', exact: true }).click();
  const row = page.locator('.online-track').filter({ hasText: '在线晚风' });
  const libraryAction = row.getByRole('button', { name: '加入音乐库 在线晚风', exact: true });
  const playlistAction = row.getByRole('button', {
    name: '在线歌曲加入歌单 在线晚风',
    exact: true,
  });
  const downloadAction = row.getByRole('button', { name: '下载 在线晚风', exact: true });
  await expect(libraryAction.locator('.lucide-library-big')).toBeVisible();
  await expect(playlistAction.locator('.lucide-list-plus')).toBeVisible();
  await expect(downloadAction.locator('.lucide-download')).toBeVisible();
  await libraryAction.click();
  await expect(libraryAction.locator('.lucide-check')).toBeVisible();
  await expect(page.locator('.toast-notice')).toContainText('已加入音乐库');
  await page.evaluate(() => {
    const target = window as Window & {
      __downloadRequest?: unknown;
    };
    Reflect.set(target, 'desktop', {
      download: {
        audio: async (input: unknown) => {
          target.__downloadRequest = input;
          return { saved: true, fileName: '测试艺术家 - 在线晚风.mp3' };
        },
      },
    });
  });
  await downloadAction.click();
  await expect(downloadAction).toBeEnabled();
  expect(
    await page.evaluate(
      () => (window as Window & { __downloadRequest?: unknown }).__downloadRequest,
    ),
  ).toEqual({
    remote: {
      provider: 'gd',
      platform: 'netease',
      trackId: '123',
      pictureId: 'cover',
      lyricId: 'words',
    },
    quality: 320,
    suggestedName: '测试艺术家 - 在线晚风',
    format: 'STREAM',
  });
  await expect(page.locator('.toast-notice')).toContainText('已下载：测试艺术家 - 在线晚风.mp3');
  expect(fixture.resolutions).toBe(0);
});
