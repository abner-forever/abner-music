import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const directory = await mkdtemp(path.join(os.tmpdir(), 'abner-music-smoke-'));
const fixture = path.join(directory, 'desktop-fixture.wav');
const userData = path.join(directory, 'profile');
const sampleRate = 22050;
const wav = Buffer.alloc(44 + sampleRate * 12 * 2);
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
for (let index = 0; index < sampleRate * 12; index++)
  wav.writeInt16LE(
    Math.round(Math.sin((index / sampleRate) * Math.PI * 440 * 2) * 3000),
    44 + index * 2,
  );
await writeFile(fixture, wav);
await writeFile(path.join(directory, 'desktop-fixture.lrc'), '[00:00]桌面播放\n[00:03]时间在继续');
let application;
const errors = [];
const runtimeMessages = [];
async function launch() {
  application = await electron.launch({
    args: ['.', `--user-data-dir=${userData}`],
    timeout: 60000,
  });
  const page = await application.firstWindow();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) runtimeMessages.push(message.text());
  });
  await page.waitForSelector('.brand');
  return page;
}
try {
  let page = await launch();
  const branding = await application.evaluate(({ app, Menu }) => ({
    name: app.getName(),
    menu: Menu.getApplicationMenu()?.items[0].label,
  }));
  assert.equal(branding.name, 'Abner Music');
  if (process.platform === 'darwin') assert.equal(branding.menu, 'Abner Music');
  assert.equal(await page.evaluate(() => window.desktop.platform), process.platform);
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
  await application.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
  }, fixture);
  await page.locator('.topbar .import-button').click();
  await page.getByRole('button', { name: '选择音乐文件', exact: true }).click();
  await page.getByRole('button', { name: '本地', exact: true }).click();
  await expect(page.locator('.track-row')).toHaveCount(1);
  await expect(page.locator('.track-title')).toHaveText('desktop-fixture');
  const records = await page.evaluate(() => window.desktop.library.list());
  assert.equal(records.length, 1);
  assert.equal(Math.round(records[0].duration), 12);
  assert.match(records[0].lyrics, /桌面播放/);
  assert.match(records[0].source, /^abner-media:\/\/track\//);
  const range = await application.evaluate(async ({ net }, source) => {
    const response = await net.fetch(source, { headers: { Range: 'bytes=44-143' } });
    return {
      status: response.status,
      length: (await response.arrayBuffer()).byteLength,
      cors: response.headers.get('Access-Control-Allow-Origin'),
    };
  }, records[0].source);
  assert.equal(range.status, 206);
  assert.equal(range.length, 100);
  assert.equal(range.cors, '*');
  await page.getByRole('button', { name: '均衡器', exact: true }).click();
  await page.getByRole('button', { name: '爵士', exact: true }).click();
  await page.getByRole('button', { name: '完成', exact: true }).click();
  await page.getByRole('button', { name: '播放 desktop-fixture', exact: true }).click();
  await expect(page.locator('.play-toggle')).toHaveAttribute('aria-label', '暂停');
  await expect.poll(() => page.locator('.timeline > span').first().textContent()).not.toBe('0:00');
  await page.getByRole('button', { name: '歌词', exact: true }).click();
  await expect(page.locator('.lyrics-lines button')).toHaveCount(2);
  await page.getByRole('button', { name: '返回音乐', exact: true }).click();
  await page.getByRole('button', { name: '迷你播放器', exact: true }).click();
  await expect(page.locator('.app-shell')).toHaveClass(/is-mini/);
  assert.equal(
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].isAlwaysOnTop(),
    ),
    true,
  );
  await page.getByRole('button', { name: '退出迷你播放器', exact: true }).click();
  await expect(page.locator('.app-shell')).not.toHaveClass(/is-mini/);
  await application.close();
  page = await launch();
  await page
    .locator('.sidebar')
    .getByRole('button', { name: /全部音乐/ })
    .click();
  await page.getByRole('button', { name: '本地', exact: true }).click();
  await expect(page.locator('.track-title')).toHaveText('desktop-fixture');
  assert.equal(JSON.parse(await readFile(path.join(userData, 'library.json'), 'utf8')).length, 1);
  await page.getByRole('button', { name: '歌曲更多操作', exact: true }).click();
  await page.getByRole('button', { name: '从音乐库移除', exact: true }).click();
  await expect(page.locator('.track-row')).toHaveCount(0);
  assert.equal(existsSync(fixture), true);
  await application.evaluate(({ net, shell }) => {
    const originalFetch = net.fetch;
    net.fetch = async (input, options) => {
      if (
        String(input) ===
        'https://api.github.com/repos/abner-forever/abner-music/releases?per_page=100'
      ) {
        return Response.json([
          {
            tag_name: 'v99.0.0',
            draft: false,
            prerelease: false,
            html_url: 'https://github.com/abner-forever/abner-music/releases/tag/v99.0.0',
            name: '桌面更新回归测试',
            body: '验证原生检查更新、日志展示与 GitHub 跳转',
            published_at: '2026-10-26T08:00:00Z',
          },
        ]);
      }
      return originalFetch(input, options);
    };
    shell.openExternal = async (url) => {
      globalThis.__releaseOpened = url;
    };
  });
  await page.getByRole('button', { name: /设置 v/ }).click();
  await page.getByRole('button', { name: '检查更新', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '发现新版本' })).toBeVisible();
  await expect(page.getByLabel('更新日志')).toContainText('验证原生检查更新');
  await page.getByRole('button', { name: '前往 GitHub 下载' }).click();
  assert.equal(
    await application.evaluate(() => globalThis.__releaseOpened),
    'https://github.com/abner-forever/abner-music/releases/tag/v99.0.0',
  );
  assert.deepEqual(errors, []);
  console.log(
    'Desktop smoke passed: native import, metadata, LRC, Range/CORS, equalizer playback, mini window, persistence, safe removal, manual update changelog and GitHub link.',
  );
} catch (error) {
  const page = application?.windows()[0];
  console.error('Desktop diagnostics:', {
    messages: runtimeMessages,
    playbackError: await page
      ?.evaluate(() => document.querySelector('.player-error')?.textContent || null)
      .catch(() => null),
  });
  throw error;
} finally {
  await application?.close();
  await rm(directory, { recursive: true, force: true });
}
