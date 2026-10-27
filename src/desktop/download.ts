import path from 'node:path';
import type { AudioDownloadRequest } from '../shared/types.ts';

const supportedExtensions = new Set([
  'aac',
  'aif',
  'aiff',
  'flac',
  'm4a',
  'mp3',
  'ogg',
  'opus',
  'wav',
]);

export function safeDownloadName(value: string, fallback = '在线音乐') {
  const cleaned = value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '');
  const stem = [...(cleaned || fallback)].slice(0, 100).join('');
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(stem) ? `_${stem}` : stem;
}

function extensionFromUrl(url: string) {
  try {
    const extension = path.extname(new URL(url).pathname).slice(1).toLowerCase();
    return supportedExtensions.has(extension) ? extension : '';
  } catch {
    return '';
  }
}

function extensionFromFormat(format: string) {
  const normalized = format.trim().toLowerCase();
  return supportedExtensions.has(normalized) ? normalized : '';
}

export function downloadFileInfo(request: AudioDownloadRequest, resolvedUrl: string) {
  const extension = extensionFromUrl(resolvedUrl) || extensionFromFormat(request.format) || 'mp3';
  return {
    fileName: `${safeDownloadName(request.suggestedName)}.${extension}`,
    extension,
  };
}
