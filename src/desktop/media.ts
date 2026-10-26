import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { parseByteRange } from '../shared/range';

const contentTypes: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.aiff': 'audio/aiff',
  '.aif': 'audio/aiff',
};

export async function serveMedia(request: Request, file: string) {
  if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405 });
  let size: number;
  try {
    const information = await stat(file);
    if (!information.isFile()) return new Response(null, { status: 404 });
    size = information.size;
  } catch {
    return new Response(null, { status: 404 });
  }
  const headers = new Headers({
    'Accept-Ranges': 'bytes',
    'Access-Control-Allow-Origin': '*',
    'Content-Type': contentTypes[path.extname(file).toLowerCase()] || 'application/octet-stream',
  });
  const range = parseByteRange(request.headers.get('range'), size);
  if (range === 'invalid') {
    headers.set('Content-Range', `bytes */${size}`);
    return new Response(null, { status: 416, headers });
  }
  headers.set('Content-Length', String(range ? range.end - range.start + 1 : size));
  if (range) headers.set('Content-Range', `bytes ${range.start}-${range.end}/${size}`);
  const stream =
    request.method === 'HEAD' || !size
      ? null
      : (Readable.toWeb(createReadStream(file, range || {})) as ReadableStream<Uint8Array>);
  return new Response(stream, { status: range ? 206 : 200, headers });
}
