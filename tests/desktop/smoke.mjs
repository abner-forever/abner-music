import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const packageInfo = JSON.parse(await readFile(new URL('../../package.json', import.meta.url)));
const arch =
  process.argv.find((argument) => argument.startsWith('--arch='))?.slice(7) || process.arch;
const output = path.resolve('out', `Abner Music-${process.platform}-${arch}`);
const executablePath =
  process.argv.find((argument) => argument.startsWith('--executable='))?.slice(13) ||
  (process.platform === 'darwin'
    ? path.join(output, 'Abner Music.app', 'Contents', 'MacOS', 'abner-music')
    : path.join(output, process.platform === 'win32' ? 'abner-music.exe' : 'abner-music'));
assert.ok(existsSync(executablePath), `Run npm run package first: ${executablePath}`);
const loader = path.join(
  path.dirname(require.resolve('playwright-core/package.json')),
  'lib/server/electron/loader.js',
);
const directory = await mkdtemp(path.join(os.tmpdir(), 'abner-music-smoke-'));
await mkdir('test-results', { recursive: true });
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
    executablePath,
    colorScheme: null,
    args: ['-r', loader, `--user-data-dir=${userData}`],
    timeout: 60000,
  });
  application.process().stderr.on('data', (chunk) => runtimeMessages.push(chunk.toString()));
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
    version: app.getVersion(),
    packaged: app.isPackaged,
    appPath: app.getAppPath(),
    menu: Menu.getApplicationMenu()?.items[0].label,
  }));
  assert.equal(branding.name, 'Abner Music');
  assert.equal(branding.version, packageInfo.version);
  assert.equal(branding.packaged, true);
  assert.equal(path.basename(branding.appPath), 'app.asar');
  if (process.platform === 'darwin') assert.equal(branding.menu, 'Abner Music');
  assert.equal(await page.evaluate(() => window.desktop.platform), process.platform);
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
  await page.locator('.settings-nav').click();
  await expect(page.getByRole('button', { name: '跟随系统', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  for (const theme of ['dark', 'light']) {
    await application.evaluate(({ nativeTheme }, appearance) => {
      nativeTheme.themeSource = appearance;
    }, theme);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  }
  await page.getByRole('button', { name: '深色', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await application.evaluate(({ nativeTheme }) => {
    nativeTheme.themeSource = 'dark';
    nativeTheme.themeSource = 'light';
  });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: '跟随系统', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: '关闭弹窗', exact: true }).click();
  await application.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].setContentSize(1000, 720);
  });
  await expect(page.locator('.local-card')).toHaveCount(0);
  await expect
    .poll(() =>
      page.locator('.settings-nav').evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        const player = document.querySelector('.player-bar').getBoundingClientRect();
        return bounds.top >= 0 && bounds.bottom <= player.top;
      }),
    )
    .toBe(true);
  await page.locator('.topbar .import-button').click({ trial: true });
  await page.locator('.settings-nav').click();
  await expect(page.getByRole('dialog', { name: '设置' })).toBeVisible();
  await page.getByRole('button', { name: '关闭弹窗', exact: true }).click();
  await application.evaluate(({ BrowserWindow, nativeTheme }) => {
    BrowserWindow.getAllWindows()[0].setContentSize(1440, 960);
    nativeTheme.themeSource = 'system';
  });
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
  if (process.platform === 'darwin') {
    await application.evaluate(({ Tray }) => {
      const original = Tray.prototype.setImage;
      Tray.prototype.setImage = function (...args) {
        globalThis.lyricsTray = this;
        globalThis.menuBarImage = args[0].toDataURL();
        return original.apply(this, args);
      };
      const tooltip = Tray.prototype.setToolTip;
      Tray.prototype.setToolTip = function (value) {
        globalThis.menuBarTooltip = value;
        return tooltip.call(this, value);
      };
    });
    await page.locator('.settings-nav').click();
    await page.getByRole('switch', { name: '菜单栏歌词', exact: true }).click();
    await page.getByRole('button', { name: '关闭弹窗', exact: true }).click();
  }
  await page.getByRole('button', { name: '播放 desktop-fixture', exact: true }).click();
  await expect(page.locator('.play-toggle')).toHaveAttribute('aria-label', '暂停');
  await expect.poll(() => page.locator('.timeline > span').first().textContent()).not.toBe('0:00');
  if (process.platform === 'darwin') {
    await expect
      .poll(() => application.evaluate(() => globalThis.menuBarTooltip))
      .toMatch(/桌面播放|时间在继续/);
    await page.locator('.play-toggle').click();
    await expect
      .poll(() => application.evaluate(() => globalThis.menuBarTooltip))
      .toMatch(/桌面播放|时间在继续/);
    await writeFile(
      'test-results/menu-bar.png',
      Buffer.from(
        (await application.evaluate(() => globalThis.menuBarImage)).split(',')[1],
        'base64',
      ),
    );
    await page.evaluate(() =>
      window.desktop.app.onMediaKey((action) => {
        document.documentElement.dataset.menuBarAction = action;
      }),
    );
    await page.evaluate(() => window.desktop.window.close());
    for (const [index, action] of ['previous', 'toggle', 'next'].entries()) {
      await application.evaluate((_electron, index) => {
        const tray = globalThis.lyricsTray;
        const bounds = tray.getBounds();
        const imageWidth =
          Buffer.from(globalThis.menuBarImage.split(',')[1], 'base64').readUInt32BE(16) / 2;
        tray.emit('click', {}, bounds, {
          x: (bounds.width - imageWidth) / 2 + imageWidth - 110 + index * 28 + 14,
          y: bounds.y + bounds.height / 2,
        });
      }, index);
      await expect(page.locator('html')).toHaveAttribute('data-menu-bar-action', action);
      assert.equal(
        await application.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0].isVisible(),
        ),
        false,
      );
    }
    for (const icon of [false, true]) {
      await application.evaluate((_electron, icon) => {
        const tray = globalThis.lyricsTray;
        const bounds = tray.getBounds();
        const width =
          Buffer.from(globalThis.menuBarImage.split(',')[1], 'base64').readUInt32BE(16) / 2;
        tray.emit('click', {}, bounds, {
          x: (bounds.width - width) / 2 + (icon ? width - 13 : 2),
          y: 10,
        });
      }, icon);
      assert.equal(
        await application.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0].isVisible(),
        ),
        icon,
      );
    }
    // Resume using the visible player after exercising native tray dispatch.
    if ((await page.locator('.play-toggle').getAttribute('aria-label')) === '暂停')
      await page.locator('.play-toggle').click();
    await page.locator('.play-toggle').click();
  }
  const playbackTime = await page.locator('.timeline > span').first().textContent();
  await page.evaluate(() => window.desktop.window.close());
  await expect
    .poll(() =>
      application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()),
    )
    .toBe(false);
  await expect(page.locator('.play-toggle')).toHaveAttribute('aria-label', '暂停');
  await expect
    .poll(() => page.locator('.timeline > span').first().textContent())
    .not.toBe(playbackTime);
  await application.evaluate(({ app }) => app.emit('activate'));
  await expect
    .poll(() =>
      application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()),
    )
    .toBe(true);
  assert.equal(application.windows().length, 1);
  await page.locator('.settings-nav').click();
  await page.locator('.settings-tabs').getByRole('button', { name: '窗口' }).click();
  await page.getByRole('button', { name: '转入后台', exact: true }).click();
  await expect
    .poll(() =>
      application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()),
    )
    .toBe(false);
  await application.evaluate(({ app }) => app.emit('second-instance'));
  await expect
    .poll(() =>
      application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()),
    )
    .toBe(true);
  await expect(page.getByRole('dialog')).toHaveCount(0);
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
  const miniSize = await application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].getSize(),
  );
  assert.deepEqual(miniSize, [360, 156]);
  if (process.platform === 'darwin') {
    assert.deepEqual(
      await application.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].getWindowButtonPosition(),
      ),
      { x: 12, y: 10 },
    );
  }
  for (const label of ['上一首', '下一首', '退出迷你播放器']) {
    await page.getByRole('button', { name: label, exact: true }).click({ trial: true });
  }
  await page.screenshot({ path: 'test-results/mini-player.png' });
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
  await application.evaluate(({ net }) => {
    const originalFetch = net.fetch;
    globalThis.__gdRequests = [];
    globalThis.__gdCancelled = false;
    net.fetch = async (input, options) => {
      const url = new URL(String(input));
      if (url.origin !== 'https://music-api.gdstudio.xyz') return originalFetch(input, options);
      const type = url.searchParams.get('types');
      globalThis.__gdRequests.push(type);
      if (url.searchParams.get('name') === 'cancel-test') {
        return new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () => {
            globalThis.__gdCancelled = true;
            reject(options.signal.reason);
          });
        });
      }
      if (type === 'search')
        return Response.json([
          {
            id: 'native-123',
            name: '桌面在线音乐',
            artist: ['GD 测试'],
            album: '原生桥接',
            source: 'netease',
            pic_id: 'native-cover',
            lyric_id: 'native-words',
          },
        ]);
      if (type === 'url')
        return Response.json({ url: 'https://media.example/gd-fixture.wav', br: 320 });
      if (type === 'pic') return Response.json({ url: '' });
      return Response.json({ lyric: '[00:00]原生在线歌词\n[00:03]播放继续', tlyric: '' });
    };
  });
  await page.route('https://media.example/gd-fixture.wav', (route) => {
    const range = route
      .request()
      .headers()
      .range?.match(/bytes=(\d+)-(\d*)/);
    const start = range ? Number(range[1]) : 0;
    const end = range?.[2] ? Math.min(Number(range[2]), wav.length - 1) : wav.length - 1;
    return route.fulfill({
      status: range ? 206 : 200,
      contentType: 'audio/wav',
      body: wav.subarray(start, end + 1),
      headers: {
        'Accept-Ranges': 'bytes',
        'Content-Length': String(end - start + 1),
        ...(range ? { 'Content-Range': `bytes ${start}-${end}/${wav.length}` } : {}),
      },
    });
  });
  await page.locator('.sidebar').getByRole('button', { name: '网络音乐', exact: true }).click();
  await page.getByRole('button', { name: '在线搜索', exact: true }).click();
  await page.getByRole('textbox', { name: '在线搜索关键词' }).fill('桌面测试');
  await page.getByRole('button', { name: '搜索在线音乐', exact: true }).click();
  await expect(page.locator('.online-track')).toHaveCount(1);
  await page.getByRole('button', { name: '在线收藏 桌面在线音乐', exact: true }).click();
  await page.getByRole('button', { name: '在线播放 桌面在线音乐', exact: true }).click();
  await expect(page.locator('.play-toggle')).toHaveAttribute('aria-label', '暂停');
  await page.getByRole('slider', { name: '播放进度' }).fill('6');
  await expect(page.locator('.timeline > span').first()).toHaveText('0:06');
  await page.getByRole('button', { name: '歌词', exact: true }).click();
  await expect(page.locator('.lyrics-lines button')).toHaveCount(2);
  const persistedMusic = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('abner:library')),
  );
  assert.equal(persistedMusic.tracks[0].source, 'gd:netease:native-123');
  assert.equal(persistedMusic.favorites.includes('gd:netease:native-123'), true);
  assert.equal(JSON.stringify(persistedMusic).includes('gd-fixture.wav'), false);
  assert.deepEqual(await application.evaluate(() => globalThis.__gdRequests), [
    'search',
    'url',
    'pic',
    'lyric',
  ]);
  for (const platform of ['invalid', 'bilibili']) {
    assert.match(
      await page.evaluate(
        (platform) =>
          window.desktop.music
            .search({ platform, keyword: 'test', page: 1 }, `unsupported-${platform}`)
            .catch((error) => error.message),
        platform,
      ),
      /该音乐平台已下线，请重新搜索这首歌/,
    );
  }
  assert.equal(await application.evaluate(() => globalThis.__gdRequests.length), 4);
  await page.evaluate(() => {
    window.__gdCancelResult = window.desktop.music
      .search({ platform: 'netease', keyword: 'cancel-test', page: 1 }, 'cancel-request')
      .catch((error) => error.message);
  });
  await expect.poll(() => application.evaluate(() => globalThis.__gdRequests.length)).toBe(5);
  await page.evaluate(() => window.desktop.music.cancel('cancel-request'));
  await expect.poll(() => application.evaluate(() => globalThis.__gdCancelled)).toBe(true);
  assert.match(await page.evaluate(() => window.__gdCancelResult), /abort|取消/i);
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
  await expect(page.getByRole('button', { name: '跟随系统', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.locator('.settings-tabs').getByRole('button', { name: '关于' }).click();
  await page.getByRole('button', { name: '检查更新', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '发现新版本' })).toBeVisible();
  await expect(page.getByLabel('更新日志')).toContainText('验证原生检查更新');
  await page.getByRole('button', { name: '前往 GitHub 下载' }).click();
  assert.equal(
    await application.evaluate(() => globalThis.__releaseOpened),
    'https://github.com/abner-forever/abner-music/releases/tag/v99.0.0',
  );
  assert.deepEqual(errors, []);
  await page.getByRole('button', { name: '稍后再说', exact: true }).click();
  await page.locator('.settings-tabs').getByRole('button', { name: '窗口', exact: true }).click();
  await expect(page.getByRole('button', { name: '退出应用', exact: true })).toBeVisible();
  const appProcess = application.process();
  const quit = application.waitForEvent('close', { timeout: 10000 });
  const quitClick = page
    .getByRole('button', { name: '退出应用', exact: true })
    .click()
    .catch((error) => {
      if (!page.isClosed()) throw error;
    });
  await Promise.all([quit, quitClick]);
  await expect.poll(() => appProcess.exitCode).toBe(0);
  application = undefined;
  console.log(
    `Packaged desktop smoke passed (${process.platform}/${arch}, ${packageInfo.version}): system theme, compact sidebar, native import, metadata, LRC, Range/CORS, equalizer playback, background playback and restore, mini window, persistence, safe removal, GD search/playback/lyrics/favorites/cancellation over native IPC, manual update changelog, GitHub link and explicit quit.`,
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
