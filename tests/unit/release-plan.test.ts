import { it } from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore JavaScript release tooling is tested directly.
import { classify, nextVersion } from '../../scripts/release-plan.mjs';
const commits = (subject: string, body = '') => [{ sha: 'abc1234', subject, body }];
it('classifies conventional changes and ignores maintenance-only updates', () => {
  assert.equal(classify(commits('docs: update guide')), null);
  assert.equal(classify(commits('fix(player): repair playback')), 'patch');
  assert.equal(classify(commits('feat: downloads')), 'minor');
  assert.equal(classify(commits('feat(api)!: replace API')), 'major');
  assert.equal(classify(commits('fix: change', 'BREAKING CHANGE: removed API')), 'major');
});
it('increments beta and promotes to a plain stable version', async () => {
  assert.equal(
    await nextVersion('0.1.0-beta.15', ['v0.1.0-beta.15'], commits('fix: playback'), 'beta'),
    '0.1.0-beta.16',
  );
  assert.equal(await nextVersion('0.1.0-beta.16', [], commits('feat: downloads'), 'main'), '0.1.0');
  assert.equal(await nextVersion('0.1.0', ['v0.1.0'], commits('fix: playback'), 'main'), '0.1.1');
  assert.equal(await nextVersion('0.1.0', ['v0.1.0'], commits('feat: downloads'), 'main'), '0.2.0');
  assert.equal(
    await nextVersion('0.1.0', ['v0.1.0'], commits('feat!: replace API'), 'main'),
    '1.0.0',
  );
});
it('starts a new beta after stable, avoids existing beta numbers, and skips docs', async () => {
  assert.equal(
    await nextVersion('0.1.0-beta.16', ['v0.1.0'], commits('fix: playback'), 'beta'),
    '0.1.1-beta.1',
  );
  assert.equal(
    await nextVersion('0.1.0-beta.15', ['v0.1.0-beta.17'], commits('fix: playback'), 'beta'),
    '0.1.0-beta.18',
  );
  assert.equal(await nextVersion('0.1.0', [], commits('docs: guide'), 'main'), null);
});

it('plans stable from merged beta history, applies only locally, and reuses a pushed release on retry', async () => {
  const { execFileSync } = await import('node:child_process');
  const { mkdtempSync, writeFileSync, readFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const dir = mkdtempSync(path.join(tmpdir(), 'abner-release-plan-'));
  const script = path.resolve('scripts/release-plan.mjs');
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
  const run = (command: string) =>
    execFileSync(process.execPath, [script, command], {
      cwd: dir,
      env: { ...process.env, RELEASE_BRANCH: 'main', RELEASE_MODE: 'release', GITHUB_OUTPUT: '' },
      encoding: 'utf8',
    });
  try {
    git('init', '-b', 'main');
    git('config', 'user.name', 'Test');
    git('config', 'user.email', 'test@example.com');
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ version: '0.1.0-beta.15' }));
    writeFileSync(
      path.join(dir, 'package-lock.json'),
      JSON.stringify({ version: '0.1.0-beta.15', packages: { '': { version: '0.1.0-beta.15' } } }),
    );
    git('add', '.');
    git('commit', '-m', 'feat: first player');
    git('tag', 'v0.1.0-beta.15');
    const source = git('rev-parse', 'HEAD');
    run('plan');
    let plan = JSON.parse(readFileSync(path.join(dir, '.release/plan.json'), 'utf8'));
    assert.equal(plan.version, '0.1.0');
    assert.equal(plan.release, true);
    assert.equal(
      JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')).version,
      '0.1.0-beta.15',
    );
    run('apply');
    assert.equal(
      JSON.parse(readFileSync(path.join(dir, 'package-lock.json'), 'utf8')).packages[''].version,
      '0.1.0',
    );
    git('add', 'package.json', 'package-lock.json');
    git('commit', '-m', 'chore(release): v0.1.0 [skip ci]');
    git('tag', 'v0.1.0');
    git('checkout', '--detach', source);
    run('plan');
    plan = JSON.parse(readFileSync(path.join(dir, '.release/plan.json'), 'utf8'));
    assert.equal(plan.version, '0.1.0');
    assert.equal(plan.release, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
