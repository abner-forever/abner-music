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
    assert.throws(() => client.search({ ...search, platform: 'bilibili' as 'netease' }), /平台/);
    assert.throws(() => client.resolve({ ...resolution, quality: 100 as 320 }), /音质/);
    assert.throws(
      () => client.resolve({ ...resolution, remote: { ...remote, trackId: '' } }),
      /ID/,
    );
  });

  it('talks to the kuwo endpoints directly and maps its track payload', async () => {
    const requested: string[] = [];
    const client = createGdMusicClient({
      request: async (url) => {
        requested.push(url);
        return Response.json({
          abslist: [
            {
              DC_TARGETID: 275858389,
              SONGNAME: '海阔天空&nbsp;(cover: BEYOND)',
              ARTIST: '阿馨&BEE',
              ALBUM: '海阔天空(粤语女声版)',
              DURATION: '320',
              web_albumpic_short: '120/46/11/1515909792.jpg',
            },
            { DC_TARGETID: '', SONGNAME: '', ARTIST: '' },
          ],
        });
      },
    });
    const tracks = await client.search({ platform: 'kuwo', keyword: '海阔天空', page: 2 });
    assert.equal(tracks.length, 1);
    assert.equal(tracks[0].id, 'gd:kuwo:275858389');
    assert.equal(tracks[0].title, '海阔天空 (cover: BEYOND)');
    assert.equal(tracks[0].artist, '阿馨 / BEE');
    assert.equal(tracks[0].album, '海阔天空(粤语女声版)');
    assert.equal(tracks[0].duration, 320);
    assert.deepEqual(tracks[0].remote, {
      provider: 'gd',
      platform: 'kuwo',
      trackId: '275858389',
      lyricId: '275858389',
      pictureId: '120/46/11/1515909792.jpg',
    });
    const search = new URL(requested[0]);
    assert.equal(search.origin, 'https://search.kuwo.cn');
    assert.equal(search.searchParams.get('pn'), '2');
    assert.equal(search.searchParams.get('all'), '海阔天空');
  });

  it('resolves kuwo playback from its plain-text endpoint and builds artwork and lyrics urls', async () => {
    const requested: string[] = [];
    const client = createGdMusicClient({
      request: async (url) => {
        requested.push(url);
        if (url.includes('antiserver')) return new Response('https://kw.example/song.mp3');
        return Response.json({
          data: {
            lrclist: [
              { lineLyric: '第一句', time: '0.0' },
              { lineLyric: '第二句', time: '62.5' },
              { lineLyric: '', time: '70' },
            ],
          },
        });
      },
    });
    const kuwo = { provider: 'gd' as const, platform: 'kuwo' as const, trackId: '275858389' };
    assert.deepEqual(await client.resolve({ remote: kuwo, quality: 320 }), {
      url: 'https://kw.example/song.mp3',
      quality: 320,
    });
    assert.match(requested[0], /rid=MUSIC_275858389/);
    assert.match(requested[0], /br=320kmp3/);
    assert.equal(
      await client.picture({ ...kuwo, pictureId: '120/46/11/1515909792.jpg' }),
      'https://img1.kuwo.cn/star/albumcover/120/46/11/1515909792.jpg',
    );
    assert.deepEqual(await client.lyrics(kuwo), {
      lyric: '[00:00.00]第一句\n[01:02.50]第二句',
      translation: '',
    });
  });

  it('reports unavailable kuwo media after exhausting qualities', async () => {
    let calls = 0;
    const client = createGdMusicClient({
      wait: async () => {},
      request: async () => {
        calls++;
        return new Response('fail');
      },
    });
    await assert.rejects(
      client.resolve({
        remote: { provider: 'gd', platform: 'kuwo', trackId: '1' },
        quality: 320,
      }),
      /暂不可用/,
    );
    assert.equal(calls, 3);
  });

  it('retries upstream hiccups such as empty and non-JSON responses', async () => {
    const payloads = [
      new Response(''),
      new Response('<html>503 Service Temporarily Unavailable</html>', { status: 503 }),
      Response.json({ url: 'https://media.example/song', br: 320 }),
    ];
    let calls = 0;
    const client = createGdMusicClient({
      wait: async () => {},
      request: async () => {
        calls++;
        return payloads.shift()!;
      },
    });
    assert.deepEqual(await client.resolve(resolution), {
      url: 'https://media.example/song',
      quality: 320,
    });
    assert.equal(calls, 3);
  });

  it('falls back to compatible qualities when the requested one has no source', async () => {
    const requested: string[] = [];
    const client = createGdMusicClient({
      wait: async () => {},
      request: async (url) => {
        const br = new URL(url).searchParams.get('br')!;
        requested.push(br);
        return br === '128'
          ? Response.json({ url: 'https://media.example/song-128.mp3', br: 128 })
          : Response.json({ url: '', br: -1 });
      },
    });
    assert.deepEqual(await client.resolve({ ...resolution, quality: 999 }), {
      url: 'https://media.example/song-128.mp3',
      quality: 128,
    });
    assert.deepEqual(requested, ['999', '320', '192', '128']);
  });

  it('reports unavailable media only after every quality and retry failed', async () => {
    let calls = 0;
    const client = createGdMusicClient({
      wait: async () => {},
      request: async () => {
        calls++;
        return Response.json({ url: '', br: 0, size: 0 });
      },
    });
    await assert.rejects(client.resolve(resolution), /暂不可用/);
    assert.equal(calls, 3);
    // 无音源结果不缓存，重试时重新询问上游
    await assert.rejects(client.resolve(resolution), /暂不可用/);
    assert.equal(calls, 6);
  });

  it('fails fast on rate limiting, invalid payloads and invalid media addresses', async () => {
    const cases: { response: Response; pattern: RegExp }[] = [
      { response: new Response('', { status: 429 }), pattern: /频繁/ },
      { response: Response.json({ url: 'file:///private/song.mp3' }), pattern: /地址无效/ },
      {
        response: Response.json({ url: 'https://user:password@media.example/song' }),
        pattern: /地址无效/,
      },
    ];
    for (const { response, pattern } of cases) {
      let calls = 0;
      const client = createGdMusicClient({
        wait: async () => {},
        request: async () => {
          calls++;
          return response;
        },
      });
      await assert.rejects(client.resolve(resolution), pattern);
      assert.equal(calls, 1);
    }
  });

  it('gives up on non-JSON responses after the retry budget', async () => {
    let calls = 0;
    const client = createGdMusicClient({
      wait: async () => {},
      request: async () => {
        calls++;
        return new Response('<html>unavailable</html>');
      },
    });
    await assert.rejects(client.resolve(resolution), /JSON/);
    assert.equal(calls, 3);
    await assert.rejects(client.search(search), /JSON/);
    assert.equal(calls, 6);
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
