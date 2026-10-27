import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { downloadFileInfo, safeDownloadName, uniqueFileName } from '../../src/desktop/download.ts';
import type { AudioDownloadRequest } from '../../src/shared/types.ts';

const request: AudioDownloadRequest = {
  remote: { provider: 'gd', platform: 'netease', trackId: '123' },
  quality: 320,
  suggestedName: '测试艺术家 - 在线晚风',
  format: 'STREAM',
};

describe('online audio downloads', () => {
  it('sanitizes names for common desktop file systems', () => {
    assert.equal(safeDownloadName('  A/B: C*?  '), 'A B C');
    assert.equal(safeDownloadName('CON'), '_CON');
    assert.equal(safeDownloadName('   '), '在线音乐');
    assert.equal([...safeDownloadName('音'.repeat(120))].length, 100);
  });

  it('uses the resolved URL extension and falls back to the source format', () => {
    assert.deepEqual(downloadFileInfo(request, 'https://media.example/song.flac?token=1'), {
      fileName: '测试艺术家 - 在线晚风.flac',
      extension: 'flac',
    });
    assert.deepEqual(
      downloadFileInfo({ ...request, format: 'OGG' }, 'https://media.example/stream/123'),
      { fileName: '测试艺术家 - 在线晚风.ogg', extension: 'ogg' },
    );
    assert.equal(downloadFileInfo(request, 'https://media.example/stream/123').extension, 'mp3');
  });

  it('keeps downloaded files apart when the name is already taken', () => {
    const taken = new Set(['测试 - 晚风.mp3', '测试 - 晚风 (2).mp3']);
    assert.equal(
      uniqueFileName('新歌.flac', (name) => taken.has(name)),
      '新歌.flac',
    );
    assert.equal(
      uniqueFileName('测试 - 晚风.mp3', (name) => taken.has(name)),
      '测试 - 晚风 (3).mp3',
    );
    assert.throws(() => uniqueFileName('测试 - 晚风.mp3', (name) => taken.has(name), 3));
  });
});
