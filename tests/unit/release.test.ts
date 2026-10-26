import { it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import packageInfo from '../../package.json' with { type: 'json' };

it('release preparation validates every platform installer, normalizes filenames and hashes artifacts', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'abner-release-test-'));
  try {
    const version = packageInfo.version;
    const names = [
      `Abner Music-darwin-arm64-${version}.zip`,
      `Abner Music-darwin-x64-${version}.zip`,
      `Abner-Music-${version}-arm64.dmg`,
      `Abner-Music-${version}-x64.dmg`,
      'AbnerMusicSetup.exe',
    ];
    for (const name of names) await writeFile(path.join(directory, name), 'fixture');
    execFileSync(process.execPath, ['scripts/prepare-release.mjs', directory], {
      env: { ...process.env, RELEASE_TAG: `v${version}` },
    });
    const sums = (await readFile(path.join(directory, 'SHA256SUMS.txt'), 'utf8'))
      .trim()
      .split('\n');
    assert.equal(sums.length, 5);
    const digest = createHash('sha256').update('fixture').digest('hex');
    for (const sum of sums) assert.equal(sum.split('  ')[0], digest);
    assert.equal(
      await readFile(path.join(directory, `Abner-Music-${version}-windows-x64.exe`), 'utf8'),
      'fixture',
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it('release preparation rejects incomplete downloads and mismatched tags', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'abner-release-test-'));
  try {
    assert.throws(
      () =>
        execFileSync(process.execPath, ['scripts/prepare-release.mjs', directory], {
          env: { ...process.env, RELEASE_TAG: `v${packageInfo.version}` },
          stdio: 'pipe',
        }),
      /Missing installers/,
    );
    assert.throws(
      () =>
        execFileSync(process.execPath, ['scripts/prepare-release.mjs', directory], {
          env: { ...process.env, RELEASE_TAG: 'v0.0.0' },
          stdio: 'pipe',
        }),
      /Tag must match/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
