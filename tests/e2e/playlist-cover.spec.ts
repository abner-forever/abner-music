import { test, expect } from '@playwright/test';

test('custom playlist covers validate images and persist across reloads', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await expect(page.locator('.topbar').getByRole('button', { name: '添加网络音乐' })).toHaveCount(
    0,
  );
  await page.getByRole('button', { name: '创建歌单', exact: true }).click();
  await page.getByPlaceholder('比如：一个人的好天气').fill('自定义封面');
  await page.locator('.modal').getByRole('button', { name: '创建歌单', exact: true }).click();
  const cover = page.locator('.library-hero-art');
  const input = page.getByLabel('选择歌单封面', { exact: true });
  await input.setInputFiles({
    name: 'invalid.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('text'),
  });
  await expect(page.getByRole('status')).toContainText('请选择 PNG');
  await expect(cover.locator('img')).toHaveCount(0);
  await input.setInputFiles({
    name: 'broken.png',
    mimeType: 'image/png',
    buffer: Buffer.from('invalid'),
  });
  await expect(page.getByRole('status')).toContainText('图片无法读取');
  await input.setInputFiles({
    name: 'large.png',
    mimeType: 'image/png',
    buffer: Buffer.alloc(10 * 1024 * 1024 + 1),
  });
  await expect(page.getByRole('status')).toContainText('不能超过 10 MB');

  const source = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 600;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#db8e64';
    context.fillRect(0, 0, 1200, 600);
    context.fillStyle = '#50765a';
    context.fillRect(300, 0, 600, 600);
    return canvas.toDataURL('image/png');
  });
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '修改歌单封面' }).click();
  await (
    await chooser
  ).setFiles({
    name: 'cover.png',
    mimeType: 'image/png',
    buffer: Buffer.from(source.split(',')[1], 'base64'),
  });
  await expect(page.getByRole('status')).toHaveText('歌单封面已更新');
  const image = cover.locator('img');
  await expect(image).toHaveAttribute('src', /^data:image\/jpeg;base64,/);
  const artwork = await image.getAttribute('src');
  await expect
    .poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth))
    .toBe(512);
  expect(await image.evaluate((element: HTMLImageElement) => element.naturalHeight)).toBe(512);
  const pixel = await image.evaluate((element: HTMLImageElement) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d')!;
    context.drawImage(element, 0, 0, 1, 1);
    return Array.from(context.getImageData(0, 0, 1, 1).data);
  });
  expect(pixel[0]).toBeLessThan(85);
  expect(pixel[1]).toBeGreaterThan(110);
  await page.screenshot({ path: testInfo.outputPath('playlist-cover.png') });
  await page.reload();
  await page.locator('.sidebar').getByRole('button', { name: '自定义封面', exact: true }).click();
  await expect(cover.locator('img')).toHaveAttribute('src', artwork!);
  await input.setInputFiles({
    name: 'broken.png',
    mimeType: 'image/png',
    buffer: Buffer.from('invalid'),
  });
  await expect(page.getByRole('status')).toContainText('图片无法读取');
  await expect(cover.locator('img')).toHaveAttribute('src', artwork!);
  await page.locator('.sidebar').getByRole('button', { name: '我的歌单', exact: true }).click();
  await expect(
    page.locator('.playlist-card').filter({ hasText: '自定义封面' }).locator('img'),
  ).toHaveAttribute('src', artwork!);
});
