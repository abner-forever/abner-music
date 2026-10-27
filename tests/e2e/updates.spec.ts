import { test, expect } from '@playwright/test';

test('update check opens release notes and download uses the desktop bridge', async ({ page }) => {
  await page.addInitScript(() => {
    const release = {
      version: '0.1.0-beta.2',
      title: 'Abner Music v0.1.0-beta.2',
      notes: '新增手动更新\n- 优化播放体验\n<script>window.unexpectedScript = true</script>',
      publishedAt: '2026-10-26T08:00:00Z',
      url: 'https://github.com/abner-forever/abner-music/releases/tag/v0.1.0-beta.2',
    };
    window.desktop = {
      platform: 'darwin',
      music: {
        search: async () => [],
        resolve: async () => ({ url: '', quality: 0 }),
        picture: async () => '',
        lyrics: async () => ({ lyric: '', translation: '' }),
        cancel() {},
      },
      library: {
        list: async () => [],
        importFiles: async () => ({ tracks: [], skipped: 0 }),
        remove: async () => ({ fileDeleted: false }),
        download: async () => {
          throw new Error('not available in this test');
        },
        storage: async () => ({ directory: '', defaultDirectory: '', isDefault: true }),
        chooseStorage: async () => ({ directory: '', defaultDirectory: '', isDefault: true }),
        openStorage: async () => {},
        reveal: async () => {},
      },
      window: {
        minimize() {},
        maximize() {},
        close() {},
        mini() {},
        isMaximized: async () => false,
        onMaximized: () => () => {},
      },
      app: {
        quit() {},
        version: async () => '0.1.0-beta.1',
        checkUpdate: async () => ({ state: 'available', message: '发现新版本', release }),
        openRelease: async () => {
          document.documentElement.dataset.downloadOpened = release.url;
        },
        onUpdate: () => () => {},
        onMediaKey: () => () => {},
      },
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: /设置 v/ }).click();
  await page.locator('.settings-tabs').getByRole('button', { name: '关于' }).click();
  await page.getByRole('button', { name: '检查更新', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '发现新版本' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('更新日志')).toContainText('优化播放体验');
  await expect(dialog.getByLabel('更新日志')).toContainText('<script>');
  expect(await page.evaluate(() => 'unexpectedScript' in window)).toBe(false);
  await expect(dialog).toContainText('2026/10/26');
  await page.getByRole('button', { name: '前往 GitHub 下载' }).click();
  await expect(page.locator('html')).toHaveAttribute(
    'data-download-opened',
    /releases\/tag\/v0\.1\.0-beta\.2$/,
  );
  await page.getByRole('button', { name: '稍后再说' }).click();
  await expect(page.getByRole('dialog', { name: '设置' })).toBeVisible();
  await page.getByRole('button', { name: '查看更新', exact: true }).click();
  await expect(dialog).toBeVisible();
});
