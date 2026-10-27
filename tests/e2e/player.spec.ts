import { test, expect } from '@playwright/test';

test('original music plays, seeks and moves to the next track', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: '即刻聆听' }).click();
  await expect(page.locator('.play-toggle')).toHaveAttribute('aria-label', '暂停');
  await expect.poll(() => page.locator('.timeline > span').first().textContent()).not.toBe('0:00');
  await page.getByRole('slider', { name: '播放进度' }).fill('30');
  await expect(page.locator('.timeline > span').first()).toHaveText('0:30');
  await page.getByRole('button', { name: '下一首', exact: true }).click();
  await expect(page.locator('.player-song-copy strong')).toHaveText('森林来信');
  await page.locator('.play-toggle').click();
  await expect(page.locator('.play-toggle')).toHaveAttribute('aria-label', '播放');
  expect(errors).toEqual([]);
});

test('playback controls keep their geometry and icons across repeated clicks', async ({ page }) => {
  await page.goto('/');
  const control = page.locator('.play-toggle');
  const initialBounds = await control.boundingBox();
  await control.evaluate((element) => {
    Reflect.set(window, 'playbackIcons', Array.from(element.children));
  });
  for (let index = 0; index < 3; index++) {
    await control.click();
    await expect(control).toHaveAttribute('aria-label', '暂停');
    await expect(control).toHaveAttribute('aria-busy', 'false');
    await expect(control.locator('.lucide-pause')).toBeVisible();
    await expect(control.locator('.play-icon')).toBeHidden();
    expect(await control.boundingBox()).toEqual(initialBounds);
    await control.click();
    await expect(control).toHaveAttribute('aria-label', '播放');
    await expect(control.locator('.play-icon')).toBeVisible();
    await expect(control.locator('.lucide-pause')).toBeHidden();
    expect(await control.boundingBox()).toEqual(initialBounds);
  }
  expect(
    await control.evaluate((element) => {
      const icons = Reflect.get(window, 'playbackIcons') as Element[];
      return icons.every((icon, index) => icon === element.children[index]);
    }),
  ).toBe(true);
});

test('original previews play offline and the display preference hides discovery demos', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await context.setOffline(true);
  await page.getByRole('button', { name: '即刻聆听' }).click();
  await expect(page.locator('.play-toggle')).toHaveAttribute('aria-label', '暂停');
  await page.getByRole('button', { name: /设置 v/ }).click();
  const previews = page.getByRole('switch', { name: '显示原创试听' });
  await expect(previews).toHaveAttribute('aria-checked', 'true');
  await previews.click();
  await page.getByRole('button', { name: '关闭弹窗', exact: true }).click();
  await expect(page.locator('.collections-section')).toHaveCount(0);
  await expect(page.locator('.track-row')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '导入第一首音乐' })).toBeVisible();
});

test('playlist creation, searching, liking and preferences survive reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '创建歌单', exact: true }).click();
  await page.getByPlaceholder('比如：一个人的好天气').fill('周末的声音');
  await page.locator('.modal').getByRole('button', { name: '创建歌单', exact: true }).click();
  await expect(page.getByRole('heading', { name: '周末的声音', exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: '搜索音乐' }).fill('森林');
  await expect(page.locator('.track-row')).toHaveCount(1);
  await page.locator('.track-row').getByRole('button', { name: '加入歌单' }).click();
  await page
    .locator('.playlist-picker')
    .getByRole('button', { name: /周末的声音/ })
    .click();
  await page.locator('.track-row').getByRole('button', { name: '喜欢歌曲', exact: true }).click();
  await page.reload();
  await page.locator('.sidebar').getByRole('button', { name: '周末的声音', exact: true }).click();
  await expect(page.locator('.track-row')).toHaveCount(1);
  await expect(page.locator('.track-row .track-title')).toHaveText('森林来信');
  await expect(page.locator('.track-row .favorite-button')).toHaveClass(/active/);
  await page.getByRole('button', { name: /设置 v/ }).click();
  await page.getByRole('button', { name: '深色', exact: true }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('network audio validates URLs and can be added without autoplay', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '导入音乐', exact: true }).click();
  await page.getByRole('button', { name: '添加网络链接', exact: true }).click();
  await page.getByPlaceholder('https://example.com/music.mp3').fill('file:///private/test.mp3');
  await page.getByRole('button', { name: '仅添加到音乐库' }).click();
  await expect(page.getByRole('alert')).toContainText('HTTP');
  await page
    .getByPlaceholder('https://example.com/music.mp3')
    .fill('https://example.com/radio.mp3?station=1');
  await page.getByPlaceholder('为这首歌起个名字').fill('测试电台');
  await page.getByRole('button', { name: '仅添加到音乐库' }).click();
  await expect(page.locator('.track-title')).toHaveText('测试电台');
  await page.reload();
  await page.locator('.sidebar').getByRole('button', { name: '网络音乐', exact: true }).click();
  await expect(page.locator('.track-title')).toHaveText('测试电台');
});

test('browser local import persists audio and supports synchronized lyrics', async ({ page }) => {
  await page.goto('/');
  const wav = Buffer.alloc(44 + 22050 * 2);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(22050, 24);
  wav.writeUInt32LE(44100, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(wav.length - 44, 40);
  await page
    .locator('input[type=file][multiple]')
    .setInputFiles({ name: '一首本地音乐.wav', mimeType: 'audio/wav', buffer: wav });
  await page.getByRole('button', { name: '本地', exact: true }).click();
  await expect(page.locator('.track-title')).toHaveText('一首本地音乐');
  await page.reload();
  await page
    .locator('.sidebar')
    .getByRole('button', { name: /全部音乐/ })
    .click();
  await page.getByRole('button', { name: '本地', exact: true }).click();
  await page.getByRole('button', { name: '播放 一首本地音乐', exact: true }).click();
  await page.getByRole('button', { name: '歌词', exact: true }).click();
  await page.getByRole('button', { name: '添加 / 编辑歌词' }).click();
  await page.getByRole('textbox', { name: '歌词内容' }).fill('[00:00]第一句\n[00:00.50]第二句');
  await page.getByRole('button', { name: '保存歌词' }).click();
  await expect(page.locator('.lyrics-lines button')).toHaveCount(2);
  await expect(page.locator('.lyric-active')).toHaveCount(1);
});

test('sidebar navigation leaves lyrics and shows the selected page', async ({ page }) => {
  await page.goto('/');
  const trackTitle = await page.locator('.player-song-copy strong').textContent();
  const destinations = [
    { button: /发现音乐/, heading: '发现音乐' },
    { button: /全部音乐/, heading: '我的音乐' },
    { button: /我喜欢的/, heading: '我喜欢的音乐' },
    { button: /最近播放/, heading: '最近播放' },
    { button: /网络音乐/, heading: '网络音乐' },
    { button: /我的歌单/, heading: '我的歌单' },
    { button: /给自己的留白/, heading: '给自己的留白' },
    { button: /晚风与耳机/, heading: '晚风与耳机' },
  ];
  for (const destination of destinations) {
    await page.getByRole('button', { name: '歌词', exact: true }).click();
    await expect(page.locator('.lyrics-view')).toBeVisible();
    await page.locator('.sidebar').getByRole('button', { name: destination.button }).click();
    await expect(page.locator('.lyrics-view')).toHaveCount(0);
    await expect(page.locator('.main-content h1')).toContainText(destination.heading);
    await expect(page.locator('.player-song-copy strong')).toHaveText(trackTitle!);
  }
  await page.getByRole('button', { name: '后退', exact: true }).click();
  await expect(page.locator('.main-content h1')).toHaveText('给自己的留白');
  await page.getByRole('button', { name: '前进', exact: true }).click();
  await expect(page.locator('.main-content h1')).toHaveText('晚风与耳机');
});

test('queue, equalizer, sleep timer and responsive layout work', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '播放队列', exact: true }).click();
  await expect(page.locator('.queue-track')).toHaveCount(6);
  await page.getByRole('button', { name: '清空待播' }).click();
  await expect(page.locator('.queue-track')).toHaveCount(1);
  await page.getByRole('button', { name: '关闭队列' }).click();
  await page.getByRole('button', { name: '均衡器', exact: true }).click();
  await page.getByRole('button', { name: '爵士', exact: true }).click();
  await expect(page.getByRole('button', { name: '爵士', exact: true })).toHaveClass(/active/);
  await page.getByRole('button', { name: '完成', exact: true }).click();
  await page.getByRole('button', { name: /设置 v/ }).click();
  await page.getByRole('button', { name: '设置定时', exact: true }).click();
  await page.getByRole('button', { name: '30 分钟', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('30 分钟');
  await page.setViewportSize({ width: 1000, height: 760 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
});
