import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, mkdtemp, mkdir, readFile, readlink, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { verifyMacBundle } from '../../scripts/verify-mac-bundle.mjs';

if (process.platform !== 'darwin') throw new Error('DMG verification requires macOS');
const execute = promisify(execFile);
const packageInfo = JSON.parse(await readFile(new URL('../../package.json', import.meta.url)));
const architecture =
  process.argv.find((argument) => argument.startsWith('--arch='))?.slice(7) || process.arch;
assert.ok(['arm64', 'x64'].includes(architecture), 'Unsupported architecture');
const artifact = path.resolve(
  'out/make/dmg',
  architecture,
  `Abner-Music-${packageInfo.version}-${architecture}.dmg`,
);
const directory = await mkdtemp(path.join(os.tmpdir(), 'abner-music-install-'));
const mountpoint = path.join(directory, 'volume');
const installed = path.join(directory, 'Applications', 'Abner Music.app');
let mounted = false;
try {
  await mkdir(mountpoint);
  await execute('hdiutil', [
    'attach',
    artifact,
    '-readonly',
    '-nobrowse',
    '-mountpoint',
    mountpoint,
  ]);
  mounted = true;
  const application = path.join(mountpoint, 'Abner Music.app');
  await verifyMacBundle(application);
  assert.equal(
    await readlink(path.join(mountpoint, 'Applications')),
    path.join(path.sep, 'Applications'),
  );
  await access(path.join(mountpoint, '.DS_Store'));
  await access(path.join(mountpoint, '.background/dmg-background.tiff'));
  await mkdir(path.dirname(installed));
  await execute('ditto', [application, installed]);
  await execute('hdiutil', ['detach', mountpoint]);
  mounted = false;
  await verifyMacBundle(installed);
  const { stdout, stderr } = await execute(
    process.execPath,
    [
      'tests/desktop/smoke.mjs',
      `--arch=${architecture}`,
      `--executable=${path.join(installed, 'Contents/MacOS/abner-music')}`,
    ],
    { timeout: 240000, maxBuffer: 4 * 1024 * 1024 },
  );
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  console.log(`DMG installation verified after ejecting image: ${artifact}`);
} finally {
  try {
    if (mounted) {
      await execute('hdiutil', ['detach', mountpoint]);
      mounted = false;
    }
  } finally {
    if (!mounted) await rm(directory, { recursive: true, force: true });
  }
}
