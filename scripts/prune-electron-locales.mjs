import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';

// Run after extraction, before Packager signs the application. Keep every
// English/Chinese variant, including Chromium's gender-specific macOS resources.
export async function pruneElectronLocales({ buildPath, platform }) {
  const directories =
    platform === 'darwin' || platform === 'mas'
      ? [
          path.join(buildPath, 'Electron.app/Contents/Resources'),
          path.join(
            buildPath,
            'Electron.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Resources',
          ),
        ]
      : [path.join(buildPath, 'locales')];
  for (const directory of directories) {
    const entries = await readdir(directory, { withFileTypes: true });
    const extension = platform === 'darwin' || platform === 'mas' ? '.lproj' : '.pak';
    const locales = entries.filter((entry) => entry.name.endsWith(extension));
    // Fail visibly if Electron changes layout instead of silently shipping all locales.
    if (!locales.some((entry) => /^en(?:[-_.])/.test(entry.name))) {
      throw new Error(`English Electron locale missing: ${directory}`);
    }
    for (const entry of locales) {
      if (!/^(?:en|zh)(?:[-_.])/.test(entry.name)) {
        await rm(path.join(directory, entry.name), { recursive: true });
      }
    }
  }
}
