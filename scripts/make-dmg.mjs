import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readdir, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import packageInfo from '../package.json' with { type: 'json' };

if (process.platform !== 'darwin') throw new Error('DMG packaging requires macOS');
const architectureIndex = process.argv.indexOf('--arch');
const architecture = architectureIndex >= 0 ? process.argv[architectureIndex + 1] : process.arch;
if (!['arm64', 'x64'].includes(architecture)) throw new Error('Unsupported architecture');
const output = path.resolve('out/make/dmg', architecture);
const applicationDirectory = path.resolve(`out/Abner Music-darwin-${architecture}`);
const application = (await readdir(applicationDirectory)).find((entry) => entry.endsWith('.app'));
if (!application) throw new Error(`No packaged app in ${applicationDirectory}`);
const temporary = await mkdtemp(path.join(os.tmpdir(), 'abner-music-dmg-'));
try {
  await mkdir(output, { recursive: true });
  await cp(path.join(applicationDirectory, application), path.join(temporary, application), {
    recursive: true,
  });
  await symlink('/Applications', path.join(temporary, 'Applications'));
  const artifact = path.join(output, `Abner-Music-${packageInfo.version}-${architecture}.dmg`);
  await promisify(execFile)('hdiutil', [
    'create',
    '-volname',
    'Abner Music',
    '-srcfolder',
    temporary,
    '-ov',
    '-format',
    'UDZO',
    artifact,
  ]);
  console.log(`Created ${artifact}`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
