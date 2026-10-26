import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import packageInfo from '../package.json' with { type: 'json' };

const directory = path.resolve(process.argv[2] || 'installers');
const version = packageInfo.version;
if (process.env.RELEASE_TAG !== `v${version}`)
  throw new Error('Tag must match package.json version');
async function walk(folder) {
  const entries = await readdir(folder, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory() ? walk(path.join(folder, entry.name)) : [path.join(folder, entry.name)],
    ),
  );
  return nested.flat();
}
const expected = new Set([
  `Abner-Music-darwin-arm64-${version}.zip`,
  `Abner-Music-darwin-x64-${version}.zip`,
  `Abner-Music-${version}-arm64.dmg`,
  `Abner-Music-${version}-x64.dmg`,
  `Abner-Music-${version}-windows-x64.exe`,
]);
const sums = [];
for (const file of (await walk(directory)).sort()) {
  if (!/\.(zip|dmg|exe)$/.test(file)) continue;
  const original = path.basename(file);
  const name =
    original === 'AbnerMusicSetup.exe'
      ? `Abner-Music-${version}-windows-x64.exe`
      : original.replaceAll(' ', '-');
  if (!expected.delete(name)) throw new Error(`Unexpected or duplicated installer: ${original}`);
  const destination = path.join(path.dirname(file), name);
  if (destination !== file) await rename(file, destination);
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(destination)) digest.update(chunk);
  sums.push(`${digest.digest('hex')}  ${name}`);
}
if (expected.size) throw new Error(`Missing installers: ${[...expected].join(', ')}`);
await writeFile(path.join(directory, 'SHA256SUMS.txt'), `${sums.sort().join('\n')}\n`);
console.log(`Validated ${sums.length} installers and generated SHA256SUMS.txt`);
