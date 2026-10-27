import path from 'node:path';

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

export function downloadFileInfo(
  request: { suggestedName: string; format: string },
  resolvedUrl: string,
) {
  const extension = extensionFromUrl(resolvedUrl) || extensionFromFormat(request.format) || 'mp3';
  return {
    fileName: `${safeDownloadName(request.suggestedName)}.${extension}`,
    extension,
  };
}

/** 同名文件已存在时依次尝试「名称 (2)」「名称 (3)」…… */
export function uniqueFileName(fileName: string, exists: (name: string) => boolean, limit = 100) {
  if (!exists(fileName)) return fileName;
  const extension = path.extname(fileName);
  const stem = fileName.slice(0, fileName.length - extension.length);
  for (let index = 2; index < limit; index++) {
    const candidate = `${stem} (${index})${extension}`;
    if (!exists(candidate)) return candidate;
  }
  throw new Error('同名文件过多，请整理下载目录后重试');
}
