import { test, expect } from '@playwright/test';

test('network audio plays after local equalizer activation', async ({ page }) => {
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
  await page.route('http://127.0.0.1:5173/test-network.wav', (route) => {
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
  await page.goto('/');
  await page.getByRole('button', { name: '均衡器', exact: true }).click();
  await page.getByRole('button', { name: '爵士', exact: true }).click();
  await page.getByRole('button', { name: '完成', exact: true }).click();
  await page.getByRole('button', { name: '添加网络音乐', exact: true }).click();
  await page
    .getByPlaceholder('https://example.com/music.mp3')
    .fill('http://127.0.0.1:5173/test-network.wav');
  await page.getByPlaceholder('为这首歌起个名字').fill('网络播放验证');
  await page.getByRole('button', { name: '添加并播放', exact: true }).click();
  await expect(page.locator('.play-toggle')).toHaveAttribute('aria-label', '暂停');
  await expect.poll(() => page.locator('.timeline > span').first().textContent()).not.toBe('0:00');
  await expect(page.locator('.player-error')).toHaveCount(0);
  await page.getByRole('slider', { name: '播放进度' }).fill('6');
  await expect(page.locator('.timeline > span').first()).toHaveText('0:06');
});
