import { test, expect } from '@playwright/test';

test('system theme follows appearance changes and persists across reloads', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await page.getByRole('button', { name: /设置 v/ }).click();
  const system = page.getByRole('button', { name: '跟随系统', exact: true });
  await system.click();
  await expect(system).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: /设置 v/ }).click();
  await expect(system).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '浅色', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: /设置 v/ }).click();
  await page.getByRole('button', { name: '深色', exact: true }).click();
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('existing explicit theme preferences remain selected', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('abner:preferences', JSON.stringify({ theme: 'light', showDemos: false }));
  });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: /设置 v/ }).click();
  await expect(page.getByRole('button', { name: '浅色', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('switch', { name: '显示原创试听' })).toHaveAttribute(
    'aria-checked',
    'false',
  );
});

for (const size of [
  { width: 1440, height: 960 },
  { width: 1000, height: 720 },
  { width: 1000, height: 600 },
  { width: 760, height: 600 },
  { width: 390, height: 844 },
]) {
  test(`sidebar actions remain clickable with many playlists at ${size.width}x${size.height}`, async ({
    page,
  }, testInfo) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'abner:library',
        JSON.stringify({
          playlists: Array.from({ length: 30 }, (_, index) => ({
            id: `playlist-${index}`,
            name: `测试歌单 ${index + 1}`,
            trackIds: [],
            artwork: 'forest',
          })),
        }),
      );
    });
    await page.goto('/');
    await expect(page.locator('.local-card')).toHaveCount(0);
    await page.setViewportSize(size);
    for (const selector of ['.topbar .import-button', '.settings-nav']) {
      const button = page.locator(selector);
      await expect(button).toBeVisible();
      const geometry = await button.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        const sidebar = document.querySelector('.sidebar')!.getBoundingClientRect();
        const player = document.querySelector('.player-bar')!.getBoundingClientRect();
        return {
          top: bounds.top,
          bottom: bounds.bottom,
          left: bounds.left,
          right: bounds.right,
          sidebarLeft: sidebar.left,
          sidebarRight: sidebar.right,
          playerTop: player.top,
        };
      });
      expect(geometry.top).toBeGreaterThanOrEqual(0);
      expect(geometry.bottom).toBeLessThanOrEqual(geometry.playerTop);
      if (selector === '.settings-nav') {
        expect(geometry.left).toBeGreaterThanOrEqual(geometry.sidebarLeft);
        expect(geometry.right).toBeLessThanOrEqual(geometry.sidebarRight);
      } else {
        expect(geometry.right).toBeLessThanOrEqual(size.width);
      }
      await button.click({ trial: true });
    }
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: '导入音乐', exact: true }).click();
    await page.getByRole('button', { name: '选择音乐文件', exact: true }).click();
    await chooser;
    await page.locator('.settings-nav').click();
    await expect(page.getByRole('dialog', { name: '偏好设置' })).toBeVisible();
    await expect(page.getByRole('button', { name: '跟随系统', exact: true })).toBeInViewport();
    const dialog = page.getByRole('dialog', { name: '偏好设置' });
    const dialogBounds = await dialog.boundingBox();
    expect(dialogBounds!.x + dialogBounds!.width).toBeLessThanOrEqual(size.width);
    await page.getByRole('button', { name: '关闭弹窗', exact: true }).click();
    await page.screenshot({
      path: testInfo.outputPath(`sidebar-${size.width}-${size.height}.png`),
    });
    await page.setViewportSize({ width: 1000, height: 720 });
    await page
      .locator('.sidebar')
      .getByRole('button', { name: '测试歌单 30', exact: true })
      .click();
    await expect(page.getByRole('heading', { name: '测试歌单 30', exact: true })).toBeVisible();
    await page.locator('.settings-nav').click();
    await expect(page.getByRole('dialog', { name: '偏好设置' })).toBeVisible();
  });
}
