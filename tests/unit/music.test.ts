import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatTime,
  parseLyrics,
  shuffled,
  validateAudioUrl,
} from '../../src/renderer/lib/music.ts';

describe('audio URLs', () => {
  it('accepts streams and signed HTTP audio URLs without stripping query parameters', () => {
    assert.equal(
      validateAudioUrl(' https://audio.example.com/live?token=demo '),
      'https://audio.example.com/live?token=demo',
    );
    assert.equal(validateAudioUrl('http://127.0.0.1:8000/radio'), 'http://127.0.0.1:8000/radio');
  });
  it('rejects local files, script URLs, credentials and invalid links', () => {
    for (const url of [
      'file:///etc/passwd',
      'javascript:alert(1)',
      'ftp://example.com/a.mp3',
      'https://user:secret@example.com/a.mp3',
      'music.mp3',
      '',
    ])
      assert.throws(() => validateAudioUrl(url));
  });
});

describe('LRC synchronization', () => {
  it('expands repeated timestamps, handles fractional precision and sorts lines', () => {
    assert.deepEqual(
      parseLyrics('[ar:artist]\n[00:20.5]晚风\n[00:01.05][00:15.005]旋律\n[00:00]序曲'),
      [
        { time: 0, text: '序曲' },
        { time: 1.05, text: '旋律' },
        { time: 15.005, text: '旋律' },
        { time: 20.5, text: '晚风' },
      ],
    );
  });
  it('applies LRC offset and clamps early timestamps', () => {
    assert.deepEqual(parseLyrics('[offset:500]\n[00:00.20]开始\n[00:10]继续'), [
      { time: 0, text: '开始' },
      { time: 9.5, text: '继续' },
    ]);
  });
  it('leaves plain lyrics available for the plain text view', () =>
    assert.deepEqual(parseLyrics('没有时间戳的歌词'), []));
});

describe('playback utilities', () => {
  it('formats live, unknown and invalid durations', () => {
    assert.equal(formatTime(Infinity), '0:00');
    assert.equal(formatTime(-1), '0:00');
    assert.equal(formatTime(185.5), '3:05');
  });
  it('shuffles without mutating or dropping any queue entries', () => {
    const original = ['first', 'second', 'third', 'fourth'];
    const result = shuffled(original, () => 0);
    assert.deepEqual(original, ['first', 'second', 'third', 'fourth']);
    assert.deepEqual([...result].sort(), [...original].sort());
    assert.notDeepEqual(result, original);
    assert.deepEqual(shuffled([]), []);
  });
});
