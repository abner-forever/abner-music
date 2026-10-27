import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';

const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {},
);
try {
  const page = await browser.newPage();
  async function bitmap(name, artwork, width, height) {
    const pixels = await page.evaluate(
      async ({ artwork, width, height }) => {
        await document.fonts.ready;
        const source = new Image();
        source.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(artwork)}`;
        await source.decode();
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        context.drawImage(source, 0, 0, width, height);
        return Array.from(context.getImageData(0, 0, width, height).data);
      },
      { artwork, width, height },
    );
    const stride = Math.ceil((width * 3) / 4) * 4;
    const output = Buffer.alloc(54 + stride * height);
    output.write('BM');
    output.writeUInt32LE(output.length, 2);
    output.writeUInt32LE(54, 10);
    output.writeUInt32LE(40, 14);
    output.writeInt32LE(width, 18);
    output.writeInt32LE(height, 22);
    output.writeUInt16LE(1, 26);
    output.writeUInt16LE(24, 28);
    output.writeUInt32LE(stride * height, 34);
    for (let row = 0; row < height; row++) {
      for (let column = 0; column < width; column++) {
        const sourceOffset = (row * width + column) * 4;
        const destinationOffset = 54 + (height - row - 1) * stride + column * 3;
        output[destinationOffset] = pixels[sourceOffset + 2];
        output[destinationOffset + 1] = pixels[sourceOffset + 1];
        output[destinationOffset + 2] = pixels[sourceOffset];
      }
    }
    await writeFile(`build/${name}.bmp`, output);
  }
  await bitmap(
    'installer-background',
    await readFile('build/installer-background.svg', 'utf8'),
    1600,
    1040,
  );
  for (const [language, install, finish, close] of [
    ['zh', '开始安装', '完成', '关闭'],
    ['en', 'Install Abner Music', 'Done', 'Close'],
  ]) {
    for (const [state, text] of [
      ['install', install],
      ['finish', finish],
      ['close', close],
    ]) {
      await bitmap(
        `installer-${state}-${language}`,
        `<svg xmlns="http://www.w3.org/2000/svg" width="418" height="48"><rect width="418" height="48" fill="#24664d"/><text x="209" y="30" text-anchor="middle" fill="#f6f7ee" font-family="'Microsoft YaHei UI','PingFang SC','Segoe UI',sans-serif" font-size="15" font-weight="600">${text}</text></svg>`,
        836,
        96,
      );
    }
  }
  await bitmap(
    'installer-close',
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#f6f7ee"/><path d="m11 11 10 10m0-10L11 21" stroke="#71816c" stroke-width="1.5" stroke-linecap="round"/></svg>',
    64,
    64,
  );
} finally {
  await browser.close();
}
