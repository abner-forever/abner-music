import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createGdMusicClient, gdApiUrl } from '../../src/shared/gd-music.ts';
import { createGdMusicController } from '../../src/desktop/gd-music.ts';
import type { GdMusicReference } from '../../src/shared/types.ts';

const remote: GdMusicReference = {
  provider: 'gd',
  platform: 'netease',
  trackId: '123',
  pictureId: 'cover',
  lyricId: 'words',
};
const search = { platform: 'netease' as const, keyword: '晚风', page: 1 };
const resolution = { remote, quality: 320 as const };

describe('GD music adapter', () => {
  it('maps search metadata to stable references without storing resolved URLs', async () => {
    let requested = '';
    const client = createGdMusicClient({
      request: async (url) => {
        requested = url;
        return Response.json([
          {
            id: 123,
            name: '晚风',
            artist: ['歌手一', '歌手二'],
            album: '夜色',
            pic_id: 'cover',
            lyric_id: 'words',
            source: 'netease',
            url_id: 'deprecated',
          },
          {
            id: 123,
            name: '晚风',
            artist: ['歌手一', '歌手二'],
            album: '夜色',
            pic_id: 'cover',
            lyric_id: 'words',
            source: 'netease',
          },
          { id: 'wrong', name: '其他平台', source: 'tencent' },
          null,
        ]);
      },
    });
    const tracks = await client.search(search);
    assert.equal(tracks.length, 1);
    assert.equal(tracks[0].id, 'gd:netease:123');
    assert.equal(tracks[0].source, tracks[0].id);
    assert.equal(tracks[0].artist, '歌手一 / 歌手二');
    assert.equal(tracks[0].kind, 'network');
    assert.deepEqual(tracks[0].remote, remote);
    assert.equal(new URL(requested).searchParams.get('name'), '晚风');
    assert.equal(new URL(requested).origin, new URL(gdApiUrl).origin);
  });

  it('encodes opaque IDs and uses actual returned quality', async () => {
    const client = createGdMusicClient({
      request: async (url) => {
        const parsed = new URL(url);
        assert.equal(parsed.searchParams.get('id'), 'opaque+song/id==');
        assert.equal(parsed.searchParams.get('br'), '999');
        return Response.json({ url: 'https://media.example/song?signature=example', br: 128 });
      },
    });
    assert.deepEqual(
      await client.resolve({
        remote: { ...remote, platform: 'joox', trackId: 'opaque+song/id==' },
        quality: 999,
      }),
      { url: 'https://media.example/song?signature=example', quality: 128 },
    );
  });

  it('rejects invalid caller parameters before making a request', () => {
    const client = createGdMusicClient({
      request: async () => {
        throw new Error('unexpected request');
      },
    });
    assert.throws(() => client.search({ ...search, keyword: ' ' }), /搜索/);
    assert.throws(() => client.search({ ...search, page: -1 }), /页码/);
    assert.throws(() => client.search({ ...search, platform: 'tencent' as 'netease' }), /平台/);
    assert.throws(() => client.resolve({ ...resolution, quality: 100 as 320 }), /音质/);
    assert.throws(
      () => client.resolve({ ...resolution, remote: { ...remote, trackId: '' } }),
      /ID/,
    );
  });

  it('handles non-JSON, HTTP errors, invalid payloads and unavailable media without caching failures', async () => {
    const payloads = [
      new Response('<html>unavailable</html>'),
      new Response('', { status: 429 }),
      Response.json({ message: 'unavailable' }),
      Response.json({ url: '' }),
      Response.json({ url: 'file:///private/song.mp3' }),
      Response.json({ url: 'https://user:password@media.example/song' }),
      Response.json({ url: 'https://media.example/song', br: 320 }),
    ];
    const client = createGdMusicClient({ request: async () => payloads.shift()! });
    for (const pattern of [/JSON/, /频繁/, /暂不可用/, /暂不可用/, /地址无效/, /地址无效/])
      await assert.rejects(client.resolve(resolution), pattern);
    assert.equal((await client.resolve(resolution)).url, 'https://media.example/song');
  });

  it('deduplicates concurrent requests, expires cached addresses and supports explicit refresh', async () => {
    let calls = 0;
    let time = 0;
    const client = createGdMusicClient({
      now: () => time,
      request: async () => {
        calls++;
        return Response.json({ url: `https://media.example/song?v=${calls}`, br: 320 });
      },
    });
    const first = await Promise.all([client.resolve(resolution), client.resolve(resolution)]);
    assert.deepEqual(first[0], first[1]);
    assert.equal(calls, 1);
    await client.resolve(resolution);
    assert.equal(calls, 1);
    await client.resolve({ ...resolution, refresh: true });
    assert.equal(calls, 2);
    time += 31_000;
    await client.resolve(resolution);
    assert.equal(calls, 3);
  });

  it('cancels a subscriber independently, and aborts transport when no subscribers remain', async () => {
    let complete!: (response: Response) => void;
    let transportSignal!: AbortSignal;
    const client = createGdMusicClient({
      request: async (_url, init) => {
        transportSignal = init.signal!;
        return new Promise<Response>((resolve, reject) => {
          complete = resolve;
          transportSignal.addEventListener('abort', () => reject(transportSignal.reason));
        });
      },
    });
    const firstController = new AbortController();
    const secondController = new AbortController();
    const first = client.resolve(resolution, firstController.signal);
    const second = client.resolve(resolution, secondController.signal);
    firstController.abort();
    await assert.rejects(first, { name: 'AbortError' });
    assert.equal(transportSignal.aborted, false);
    complete(Response.json({ url: 'https://media.example/song', br: 320 }));
    await second;
    const last = client.resolve({ ...resolution, refresh: true }, secondController.signal);
    secondController.abort();
    await assert.rejects(last, { name: 'AbortError' });
    assert.equal(transportSignal.aborted, true);
  });

  it('reserves request capacity for playback and resets the five-minute budget', async () => {
    let time = 0;
    let calls = 0;
    const client = createGdMusicClient({
      now: () => time,
      request: async (url) => {
        calls++;
        return new URL(url).searchParams.get('types') === 'search'
          ? Response.json([])
          : Response.json({ url: 'https://media.example/song', br: 320 });
      },
    });
    for (let index = 1; index <= 45; index++) await client.search({ ...search, page: index });
    await assert.rejects(client.search({ ...search, page: 46 }), /频繁/);
    for (let index = 0; index < 5; index++)
      await client.resolve({ ...resolution, remote: { ...remote, trackId: String(index) } });
    await assert.rejects(
      client.resolve({ ...resolution, remote: { ...remote, trackId: 'extra' } }),
      /频繁/,
    );
    assert.equal(calls, 50);
    time = 300_001;
    await client.search({ ...search, page: 46 });
    assert.equal(calls, 51);
  });

  it('prioritizes playback over queued metadata and limits simultaneous requests', async () => {
    const started: string[] = [];
    const releases: (() => void)[] = [];
    const client = createGdMusicClient({
      request: async (url) => {
        const type = new URL(url).searchParams.get('types')!;
        started.push(type);
        await new Promise<void>((resolve) => releases.push(resolve));
        return Response.json({
          url: 'https://media.example/song',
          lyric: '[00:00]原文',
          tlyric: '[00:00]翻译',
          br: 320,
        });
      },
    });
    const first = client.picture(remote);
    const second = client.picture({ ...remote, pictureId: 'other' });
    const words = client.lyrics(remote);
    const audio = client.resolve(resolution);
    assert.deepEqual(started, ['pic', 'pic']);
    releases.shift()!();
    await first;
    assert.deepEqual(started, ['pic', 'pic', 'url']);
    releases.shift()!();
    await second;
    assert.deepEqual(started, ['pic', 'pic', 'url', 'lyric']);
    releases.splice(0).forEach((release) => release());
    await audio;
    assert.deepEqual(await words, { lyric: '[00:00]原文', translation: '[00:00]翻译' });
  });
});

describe('desktop music request lifecycle', () => {
  it('validates request IDs, rejects duplicates and cancels a running request', async () => {
    const controller = createGdMusicController(async () => Response.json([]));
    await assert.rejects(
      controller.run('../invalid', async () => []),
      /ID/,
    );
    const running = controller.run(
      'request-1',
      (signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason));
        }),
    );
    await assert.rejects(
      controller.run('request-1', async () => []),
      /过多/,
    );
    controller.cancel('request-1');
    await assert.rejects(running, { name: 'AbortError' });
    assert.deepEqual(await controller.run('request-1', async () => []), []);
    controller.dispose();
  });
});
