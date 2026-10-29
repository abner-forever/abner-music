import { it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pruneElectronLocales } from '../../scripts/prune-electron-locales.mjs';

for (const platform of ['darwin', 'win32', 'linux']) {
  it(`keeps Chinese/English and unrelated resources on ${platform}`, async () => {
    const buildPath = await mkdtemp(path.join(os.tmpdir(), 'abner-locales-'));
    const mac = platform === 'darwin';
    const directories = mac
      ? [
          'Electron.app/Contents/Resources',
          'Electron.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Resources',
        ]
      : ['locales'];
    const names = mac
      ? [
          'en.lproj',
          'en_GB.lproj',
          'zh_CN.lproj',
          'zh_TW_FEMININE.lproj',
          'fr.lproj',
          'fr_NEUTER.lproj',
          'Info.plist',
        ]
      : ['en-US.pak', 'en-GB.pak', 'zh-CN.pak', 'zh-TW.pak', 'fr.pak', 'de.pak', 'other.dat'];
    try {
      for (const relative of directories) {
        const directory = path.join(buildPath, relative);
        await mkdir(directory, { recursive: true });
        for (const name of names) {
          if (name.endsWith('.lproj')) await mkdir(path.join(directory, name));
          else await writeFile(path.join(directory, name), 'fixture');
        }
      }
      await pruneElectronLocales({ buildPath, platform });
      for (const relative of directories) {
        assert.deepEqual(
          (await readdir(path.join(buildPath, relative))).sort(),
          names.filter((name) => !/^(fr|de)[._]/.test(name)).sort(),
        );
      }
    } finally {
      await rm(buildPath, { recursive: true, force: true });
    }
  });
}

it('fails when the expected Electron locale directory is missing', async () => {
  const buildPath = await mkdtemp(path.join(os.tmpdir(), 'abner-locales-'));
  try {
    await assert.rejects(pruneElectronLocales({ buildPath, platform: 'win32' }), /ENOENT/);
  } finally {
    await rm(buildPath, { recursive: true, force: true });
  }
});

it('does not delete files when the expected English fallback is missing', async () => {
  const buildPath = await mkdtemp(path.join(os.tmpdir(), 'abner-locales-'));
  const directory = path.join(buildPath, 'locales');
  try {
    await mkdir(directory);
    await writeFile(path.join(directory, 'fr.pak'), 'fixture');
    await assert.rejects(
      pruneElectronLocales({ buildPath, platform: 'win32' }),
      /English Electron locale missing/,
    );
    assert.deepEqual(await readdir(directory), ['fr.pak']);
  } finally {
    await rm(buildPath, { recursive: true, force: true });
  }
});
