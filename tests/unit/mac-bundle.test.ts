import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, cp, mkdir, mkdtemp, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { verifyMacBundle } from '../../scripts/verify-mac-bundle.mjs';

describe('portable macOS bundles', { skip: process.platform === 'win32' }, () => {
  async function fixture() {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'abner-mac-bundle-'));
    const application = path.join(directory, 'source', 'Abner Music.app');
    const framework = path.join(application, 'Contents/Frameworks/Electron Framework.framework');
    const binary = path.join(framework, 'Versions/A/Electron Framework');
    const executable = path.join(application, 'Contents/MacOS/abner-music');
    await mkdir(path.dirname(binary), { recursive: true });
    await mkdir(path.dirname(executable), { recursive: true });
    await mkdir(path.join(application, 'Contents/Resources'), { recursive: true });
    await writeFile(binary, 'framework');
    await writeFile(executable, 'executable');
    await chmod(binary, 0o755);
    await chmod(executable, 0o755);
    await writeFile(path.join(application, 'Contents/Resources/app.asar'), 'application');
    await symlink('A', path.join(framework, 'Versions/Current'));
    await symlink(
      'Versions/Current/Electron Framework',
      path.join(framework, 'Electron Framework'),
    );
    return { directory, application, framework };
  }

  it('accepts relative framework links after copying and removing the build source', async () => {
    const { directory, application } = await fixture();
    try {
      const installed = path.join(directory, 'installed', 'Abner Music.app');
      await cp(application, installed, { recursive: true, verbatimSymlinks: true });
      await rm(path.dirname(application), { recursive: true });
      await verifyMacBundle(installed);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('rejects the build-machine links produced by the old DMG copy operation', async () => {
    const { directory, application } = await fixture();
    try {
      const installed = path.join(directory, 'installed', 'Abner Music.app');
      await cp(application, installed, { recursive: true });
      await assert.rejects(verifyMacBundle(installed), /Non-portable app symlink/);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('rejects broken or escaping relative links and missing runtime files', async () => {
    const { directory, application, framework } = await fixture();
    try {
      const link = path.join(framework, 'Electron Framework');
      await unlink(link);
      await symlink('Versions/missing/Electron Framework', link);
      await assert.rejects(verifyMacBundle(application), { code: 'ENOENT' });
      await unlink(link);
      await writeFile(path.join(directory, 'external'), 'external');
      await symlink(path.relative(framework, path.join(directory, 'external')), link);
      await assert.rejects(verifyMacBundle(application), /escapes bundle/);
      await unlink(link);
      await symlink('Versions/Current/Electron Framework', link);
      await unlink(path.join(application, 'Contents/Resources/app.asar'));
      await assert.rejects(verifyMacBundle(application), { code: 'ENOENT' });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
