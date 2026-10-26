import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const artwork = await readFile('public/favicon.svg', 'utf8');
const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {},
);
try {
  const page = await browser.newPage();
  async function renderIcon(size) {
    const encoded = await page.evaluate(
      async ({ artwork, size }) => {
        const source = new Image();
        source.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(artwork)}`;
        await source.decode();
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const inset = size * 0.04;
        canvas.getContext('2d').drawImage(source, inset, inset, size * 0.92, size * 0.92);
        return canvas.toDataURL('image/png').split(',')[1];
      },
      { artwork, size },
    );
    return Buffer.from(encoded, 'base64');
  }
  await writeFile('build/icon.png', await renderIcon(1024));
  const iconSizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];
  const iconImages = await Promise.all(iconSizes.map(renderIcon));
  const header = Buffer.alloc(6 + iconImages.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(iconImages.length, 4);
  let imageOffset = header.length;
  for (const [index, png] of iconImages.entries()) {
    const entryOffset = 6 + index * 16;
    header.writeUInt8(iconSizes[index] % 256, entryOffset);
    header.writeUInt8(iconSizes[index] % 256, entryOffset + 1);
    header.writeUInt16LE(1, entryOffset + 4);
    header.writeUInt16LE(32, entryOffset + 6);
    header.writeUInt32LE(png.length, entryOffset + 8);
    header.writeUInt32LE(imageOffset, entryOffset + 12);
    imageOffset += png.length;
  }
  await writeFile('build/icon.ico', Buffer.concat([header, ...iconImages]));
  if (process.platform === 'darwin') {
    const iconset = path.resolve('build/icon.iconset');
    await mkdir(iconset, { recursive: true });
    for (const size of [16, 32, 128, 256, 512]) {
      for (const scale of [1, 2]) {
        await writeFile(
          path.join(iconset, `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`),
          await renderIcon(size * scale),
        );
      }
    }
    execFileSync('iconutil', ['-c', 'icns', iconset, '-o', path.resolve('build/icon.icns')]);
  }
  const background = await readFile('build/dmg-background.svg', 'utf8');
  for (const scale of [1, 2]) {
    const backgroundPage = await browser.newPage({
      viewport: { width: 660, height: 440 },
      deviceScaleFactor: scale,
    });
    await backgroundPage.setContent(
      `<style>body{margin:0}svg{display:block;width:100vw;height:100vh}</style>${background}`,
    );
    await backgroundPage.evaluate(() => document.fonts.ready);
    await backgroundPage.screenshot({
      path: `build/dmg-background${scale === 2 ? '@2x' : ''}.png`,
    });
    await backgroundPage.close();
  }
  for (const [name, width, height] of [
    ['installer-sidebar', 164, 314],
    ['installer-header', 150, 57],
  ]) {
    const artwork = await readFile(`build/${name}.svg`, 'utf8');
    const pixels = await page.evaluate(
      async ({ artwork, width, height }) => {
        const source = new Image();
        source.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(artwork)}`;
        await source.decode();
        await document.fonts.ready;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, width, height);
        context.drawImage(source, 0, 0, width, height);
        return Array.from(context.getImageData(0, 0, width, height).data);
      },
      { artwork, width, height },
    );
    const stride = Math.ceil((width * 3) / 4) * 4;
    const bitmap = Buffer.alloc(54 + stride * height);
    bitmap.write('BM');
    bitmap.writeUInt32LE(bitmap.length, 2);
    bitmap.writeUInt32LE(54, 10);
    bitmap.writeUInt32LE(40, 14);
    bitmap.writeInt32LE(width, 18);
    bitmap.writeInt32LE(height, 22);
    bitmap.writeUInt16LE(1, 26);
    bitmap.writeUInt16LE(24, 28);
    bitmap.writeUInt32LE(stride * height, 34);
    for (let row = 0; row < height; row++) {
      for (let column = 0; column < width; column++) {
        const sourceOffset = (row * width + column) * 4;
        const destinationOffset = 54 + (height - row - 1) * stride + column * 3;
        bitmap[destinationOffset] = pixels[sourceOffset + 2];
        bitmap[destinationOffset + 1] = pixels[sourceOffset + 1];
        bitmap[destinationOffset + 2] = pixels[sourceOffset];
      }
    }
    await writeFile(`build/${name}.bmp`, bitmap);
  }
} finally {
  await browser.close();
}
