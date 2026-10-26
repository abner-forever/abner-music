import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const artwork = await readFile('public/favicon.svg', 'utf8');
const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {},
);
try {
  const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
  await page.setContent(
    `<style>body{margin:0}svg{width:100vw;height:100vh;display:block}</style>${artwork}`,
  );
  await page.screenshot({ path: 'build/icon.png', omitBackground: true });
  await page.setViewportSize({ width: 256, height: 256 });
  const png = await page.screenshot({ omitBackground: true });
  const header = Buffer.alloc(22);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(22, 18);
  await writeFile('build/icon.ico', Buffer.concat([header, png]));
  if (process.platform === 'darwin') {
    const iconset = path.resolve('build/icon.iconset');
    await mkdir(iconset, { recursive: true });
    for (const size of [16, 32, 128, 256, 512]) {
      for (const scale of [1, 2]) {
        await page.setViewportSize({ width: size * scale, height: size * scale });
        await page.screenshot({
          path: path.join(iconset, `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`),
          omitBackground: true,
        });
      }
    }
    execFileSync('iconutil', ['-c', 'icns', iconset, '-o', path.resolve('build/icon.icns')]);
  }
} finally {
  await browser.close();
}
