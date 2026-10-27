import { test, expect } from '@playwright/test';

test('every album and library view uses the shared dropdown without native selects', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  const albums = await page.locator('.collection-title').allTextContents();
  for (const title of albums) {
    await page.locator('.collection-title').getByText(title.trim(), { exact: true }).click();
    const sort = page.getByRole('combobox', { name: '歌曲排序' });
    await expect(sort).toHaveClass(/app-select-trigger/);
    await expect(page.locator('select')).toHaveCount(0);
    await sort.click();
    await expect(page.getByRole('listbox', { name: '歌曲排序' })).toHaveClass(/app-select-menu/);
    await expect(page.getByRole('option')).toHaveCount(4);
    if (title.includes('蓝色')) {
      await page.waitForTimeout(350);
      await page.screenshot({ path: testInfo.outputPath('album-dropdown.png') });
    }
    await page.getByRole('option', { name: '最近添加' }).click();
    await expect(sort).toHaveText('最近添加');
    await page.locator('.sidebar').getByRole('button', { name: '发现音乐', exact: true }).click();
  }
  expect(albums.length).toBeGreaterThan(0);
  for (const name of [
    '全部音乐',
    '我喜欢的',
    '最近播放',
    '网络音乐',
    '给自己的留白',
    '晚风与耳机',
  ]) {
    await page
      .locator('.sidebar')
      .getByRole('button', { name: new RegExp(name) })
      .click();
    await expect(page.getByRole('combobox', { name: '歌曲排序' })).toHaveClass(
      /app-select-trigger/,
    );
    await expect(page.locator('select')).toHaveCount(0);
  }
  await page.getByRole('textbox', { name: '搜索音乐' }).fill('蓝色');
  await expect(page.getByRole('combobox', { name: '歌曲排序' })).toHaveClass(/app-select-trigger/);
  await page.getByRole('button', { name: /设置 v/ }).click();
  await page.locator('.settings-tabs').getByRole('button', { name: '播放' }).click();
  await expect(page.getByRole('combobox', { name: '播放速度' })).toHaveClass(/app-select-trigger/);
  await expect(page.locator('select')).toHaveCount(0);
});

test('song sorting supports pointer, keyboard and outside dismissal', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await page
    .locator('.sidebar')
    .getByRole('button', { name: /全部音乐/ })
    .click();
  const sort = page.getByRole('combobox', { name: '歌曲排序' });
  await sort.click();
  await expect(page.getByRole('option', { name: '默认排序' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect
    .poll(() =>
      sort.evaluate((element) => {
        const arrow = element.querySelector('svg')!.getBoundingClientRect();
        return element.getBoundingClientRect().right - arrow.right;
      }),
    )
    .toBeGreaterThanOrEqual(12);
  await page.waitForTimeout(350);
  await page.screenshot({ path: testInfo.outputPath('sort-dropdown.png') });
  await page.getByRole('option', { name: '歌曲名称' }).click();
  await expect(sort).toHaveText('歌曲名称');
  const titles = await page.locator('.track-row .track-title').allTextContents();
  expect(titles).toEqual([...titles].sort((first, second) => first.localeCompare(second, 'zh-CN')));
  await sort.press('ArrowDown');
  await sort.press('Home');
  await sort.press('Enter');
  await expect(sort).toHaveText('默认排序');
  await sort.press('Enter');
  await sort.press('End');
  await sort.press('Escape');
  await expect(sort).toHaveText('默认排序');
  await expect(sort).toBeFocused();
  await sort.click();
  await page.locator('.library-toolbar-left').click();
  await expect(page.getByRole('listbox')).toHaveCount(0);
});

test('speed dropdown works in settings with dark theme and Escape preserves the dialog', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await page.getByRole('button', { name: /设置 v/ }).click();
  await page.getByRole('button', { name: '深色', exact: true }).click();
  await page.locator('.settings-tabs').getByRole('button', { name: '播放' }).click();
  const speed = page.getByRole('combobox', { name: '播放速度' });
  await speed.click();
  await expect(page.getByRole('option', { name: '1.0×' })).toHaveAttribute('aria-selected', 'true');
  await page.screenshot({ path: testInfo.outputPath('speed-dropdown-dark.png') });
  await speed.press('Escape');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toBeVisible();
  await speed.click();
  await page.getByRole('option', { name: '1.5×' }).click();
  await expect(speed).toHaveText('1.5×');
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const source = '/src/renderer/stores/player.ts';
        const { audio } = await import(source);
        return audio.playbackRate;
      }),
    )
    .toBe(1.5);
  await speed.press('ArrowUp');
  await speed.press('Home');
  await speed.press('Enter');
  await expect(speed).toHaveText('0.75×');
  await speed.press('Enter');
  await speed.press('Tab');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toBeVisible();
});
