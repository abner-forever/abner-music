import { execFileSync } from 'node:child_process';
import { copyFile, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import packageInfo from '../package.json' with { type: 'json' };

if (process.platform === 'darwin') {
  const require = createRequire(import.meta.url);
  const executable = require('electron');
  const contents = path.resolve(path.dirname(executable), '..');
  const plist = path.join(contents, 'Info.plist');
  const productName = packageInfo.productName;
  for (const key of ['CFBundleName', 'CFBundleDisplayName']) {
    const current = execFileSync('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, plist], {
      encoding: 'utf8',
    }).trim();
    if (current !== productName) {
      execFileSync('/usr/bin/plutil', ['-replace', key, '-string', productName, plist]);
    }
  }
  const source = path.resolve('build/icon.icns');
  const destination = path.join(contents, 'Resources/electron.icns');
  const [sourceIcon, currentIcon] = await Promise.all([readFile(source), readFile(destination)]);
  if (!sourceIcon.equals(currentIcon)) await copyFile(source, destination);
}
