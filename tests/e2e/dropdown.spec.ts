import { test, expect } from '@playwright/test';

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
  const arrowInset = await sort.evaluate((element) => {
    const arrow = element.querySelector('svg')!.getBoundingClientRect();
    return element.getBoundingClientRect().right - arrow.right;
  });
  expect(arrowInset).toBeGreaterThanOrEqual(12);
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
