import { execFileSync } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
} from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const gh = (...args) =>
  execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const json = (file) => JSON.parse(readFileSync(file, 'utf8'));
const save = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);

export function classify(commits) {
  let bump = null;
  for (const { subject, body } of commits) {
    if (/^[\w-]+(?:\([^\n]+\))?!:/.test(subject) || /^BREAKING[ -]CHANGE:/m.test(body))
      return 'major';
    if (/^feat(?:\([^\n]+\))?:/.test(subject)) bump = 'minor';
    else if (/^(fix|perf|revert)(?:\([^\n]+\))?:/.test(subject) && bump !== 'minor') bump = 'patch';
  }
  return bump;
}

export async function nextVersion(current, tags, commits, branch) {
  const semver = await import('semver');
  const bump = classify(commits);
  if (!bump) return null;
  if (!['main', 'beta'].includes(branch)) throw new Error('Only main and beta can release');
  const versions = tags.map((tag) => tag.replace(/^v/, '')).filter((v) => semver.valid(v));
  const stable = versions.filter((v) => !semver.prerelease(v)).sort(semver.rcompare)[0];
  const base = semver.parse(current);
  if (!base) throw new Error('Invalid package version');
  const target = `${base.major}.${base.minor}.${base.patch}`;
  if (branch === 'main') {
    // Promote the beta target; subsequent stable releases follow Conventional Commits.
    return base.prerelease.length && (!stable || semver.gt(target, stable))
      ? target
      : semver.inc(stable && semver.gt(stable, target) ? stable : target, bump);
  }
  if (base.prerelease.length && (!stable || semver.gt(target, stable))) {
    const latest = versions.filter((v) => v.startsWith(`${target}-beta.`)).sort(semver.rcompare)[0];
    return semver.inc(
      latest && semver.gt(latest, current) ? latest : current,
      'prerelease',
      'beta',
    );
  }
  return `${semver.inc(stable && semver.gt(stable, target) ? stable : target, bump)}-beta.1`;
}

function notesFor(version, commits) {
  const groups = [
    ['新功能', /^feat(?:\(|!?:)/],
    ['修复与性能', /^(fix|perf|revert)(?:\(|!?:)/],
  ];
  let result = `## ${version}\n\n`;
  for (const [title, pattern] of groups) {
    const entries = commits.filter((c) => pattern.test(c.subject));
    if (entries.length)
      result += `### ${title}\n\n${entries.map((c) => `- ${c.subject} (${c.sha.slice(0, 7)})`).join('\n')}\n\n`;
  }
  const other = commits.filter(
    (c) => !groups.some(([, p]) => p.test(c.subject)) && !/^chore\(release\):/.test(c.subject),
  );
  if (other.length)
    result += `### 其他变更\n\n${other.map((c) => `- ${c.subject} (${c.sha.slice(0, 7)})`).join('\n')}\n\n`;
  return result;
}

async function plan() {
  const branch = process.env.RELEASE_BRANCH;
  const sha = git('rev-parse', 'HEAD');
  const tags = git('tag', '--list', 'v*').split('\n').filter(Boolean);
  const merged = git('tag', '--merged', 'HEAD', '--sort=-version:refname', '--list', 'v*')
    .split('\n')
    .filter((t) => /^v\d+\.\d+\.\d+(?:-beta\.\d+)?$/.test(t));
  const baseline = merged.find((tag) => branch === 'beta' || !tag.includes('-'));
  const raw = git('log', '--format=%H%x1f%s%x1f%b%x1e', baseline ? `${baseline}..HEAD` : 'HEAD');
  const commits = raw
    .split('\x1e')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [sha, subject, body = ''] = s.split('\x1f');
      return { sha, subject, body };
    });
  // A retry keeps the original candidate even after the final commit/tag was pushed.
  const retryTag = tags.find((t) => {
    if (!/^v\d+\.\d+\.\d+(?:-beta\.\d+)?$/.test(t)) return false;
    return (
      git('log', '-1', '--format=%s', t) === `chore(release): ${t} [skip ci]` &&
      git('rev-parse', `${t}^`) === sha &&
      (branch === 'beta' ? t.includes('-beta.') : !t.includes('-'))
    );
  });
  const version =
    retryTag?.slice(1) || (await nextVersion(json('package.json').version, tags, commits, branch));
  const release = process.env.RELEASE_MODE !== 'preflight' && Boolean(version);
  const build = release || process.env.RELEASE_MODE === 'preflight';
  mkdirSync('.release', { recursive: true });
  save('.release/plan.json', {
    sha,
    branch,
    version: version || json('package.json').version,
    release,
    build,
  });
  writeFileSync('.release/notes.md', notesFor(version || json('package.json').version, commits));
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, `build=${build}\nrelease=${release}\n`);
  console.log({ branch, version, release, build });
}

function apply() {
  const p = json('.release/plan.json');
  if (git('rev-parse', 'HEAD') !== p.sha) throw new Error('Release plan source mismatch');
  const pkg = json('package.json');
  pkg.version = p.version;
  save('package.json', pkg);
  const lock = json('package-lock.json');
  lock.version = p.version;
  lock.packages[''].version = p.version;
  save('package-lock.json', lock);
}

function publish() {
  const p = json('.release/plan.json');
  if (!p.release || !['main', 'beta'].includes(p.branch)) throw new Error('Invalid release plan');
  const tag = `v${p.version}`;
  const tagExists = git('tag', '--list', tag) === tag;
  if (
    tagExists &&
    (git('log', '-1', '--format=%s', tag) !== `chore(release): ${tag} [skip ci]` ||
      git('rev-parse', `${tag}^`) !== p.sha)
  )
    throw new Error('Tag belongs to a different release');
  const remote = git('ls-remote', 'origin', `refs/heads/${p.branch}`).split(/\s/)[0];
  if (remote !== p.sha && !(tagExists && remote === git('rev-parse', tag)))
    throw new Error('Branch moved during build; rerun from latest branch');
  const releases = JSON.parse(gh('api', `repos/${process.env.GH_REPO}/releases?per_page=100`));
  let existing = releases.find((r) => r.tag_name === tag);
  if (existing && !existing.draft) {
    if (!tagExists) throw new Error('Published release without expected tag');
    console.log(`${tag} already published`);
    return;
  }
  const notes = readFileSync('.release/notes.md', 'utf8');
  if (!existing) {
    const args = [
      'release',
      'create',
      tag,
      '--draft',
      '--target',
      p.sha,
      '--title',
      `Abner Music ${tag}`,
      '--notes-file',
      '.release/notes.md',
    ];
    if (p.branch === 'beta') args.push('--prerelease');
    gh(...args);
  } else gh('release', 'edit', tag, '--notes-file', '.release/notes.md');
  const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
    );
  const files = walk('installers').filter(
    (f) => /\.(dmg|exe|zip)$/.test(f) || path.basename(f) === 'SHA256SUMS.txt',
  );
  gh('release', 'upload', tag, ...files, '--clobber');
  if (!tagExists) {
    const old = existsSync('CHANGELOG.md')
      ? readFileSync('CHANGELOG.md', 'utf8').replace(/^# Changelog\s*/, '')
      : '';
    writeFileSync('CHANGELOG.md', `# Changelog\n\n${notes}${old}`);
    git('config', 'user.name', 'github-actions[bot]');
    git('config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com');
    git('add', 'package.json', 'package-lock.json', 'CHANGELOG.md');
    git('commit', '-m', `chore(release): ${tag} [skip ci]`);
    git('tag', tag);
    git('push', '--atomic', 'origin', `HEAD:refs/heads/${p.branch}`, `refs/tags/${tag}`);
  }
  gh(
    'release',
    'edit',
    tag,
    '--draft=false',
    `--prerelease=${p.branch === 'beta'}`,
    `--latest=${p.branch === 'main'}`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const command = process.argv[2];
  if (command === 'plan') await plan();
  else if (command === 'apply') apply();
  else if (command === 'publish') publish();
  else throw new Error('Expected plan, apply or publish');
}
