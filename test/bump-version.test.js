import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const BUMP_SCRIPT = resolve('scripts/bump-version.mjs');

async function run(command, args, cwd) {
  return execFileAsync(command, args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Post Test',
      GIT_AUTHOR_EMAIL: 'post-test@example.com',
      GIT_COMMITTER_NAME: 'Post Test',
      GIT_COMMITTER_EMAIL: 'post-test@example.com',
    },
  });
}

async function git(cwd, args) {
  const { stdout } = await run('git', args, cwd);
  return stdout.trim();
}

async function createReleaseRepo(version = '1.2.3') {
  const directory = await mkdtemp(join(tmpdir(), 'post-bump-version-'));
  const packageJson = {
    name: 'post',
    version,
    license: 'MIT',
  };
  const packageLock = {
    name: 'post',
    version,
    lockfileVersion: 3,
    requires: true,
    packages: {
      '': {
        name: 'post',
        version,
        license: 'MIT',
      },
    },
  };

  await writeFile(join(directory, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`);
  await writeFile(join(directory, 'package-lock.json'), `${JSON.stringify(packageLock, null, 2)}\n`);
  await git(directory, ['init']);
  await git(directory, ['add', 'package.json', 'package-lock.json']);
  await git(directory, ['commit', '-m', 'test: initial release files']);

  return directory;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

test('bump-version updates release files, creates a commit, and tags it', async () => {
  const directory = await createReleaseRepo();
  try {
    const { stdout } = await run(process.execPath, [BUMP_SCRIPT, 'patch'], directory);

    assert.match(stdout, /1\.2\.3 -> 1\.2\.4/);
    assert.match(stdout, /Committed chore\(release\): bump version to 1\.2\.4/);
    assert.match(stdout, /Tagged v1\.2\.4/);

    const packageJson = await readJson(join(directory, 'package.json'));
    const packageLock = await readJson(join(directory, 'package-lock.json'));
    assert.equal(packageJson.version, '1.2.4');
    assert.equal(packageLock.version, '1.2.4');
    assert.equal(packageLock.packages[''].version, '1.2.4');

    assert.equal(await git(directory, ['status', '--porcelain']), '');
    assert.equal(await git(directory, ['log', '-1', '--pretty=%s']), 'chore(release): bump version to 1.2.4');
    assert.equal(await git(directory, ['tag', '--list', 'v1.2.4']), 'v1.2.4');
    assert.equal(await git(directory, ['cat-file', '-t', 'v1.2.4']), 'tag');
    assert.equal(
      await git(directory, ['rev-list', '-n', '1', 'v1.2.4']),
      await git(directory, ['rev-parse', 'HEAD']),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('bump-version refuses dirty working trees before editing files', async () => {
  const directory = await createReleaseRepo();
  try {
    await writeFile(join(directory, 'notes.txt'), 'dirty\n');

    await assert.rejects(
      run(process.execPath, [BUMP_SCRIPT, 'minor'], directory),
      /Working tree must be clean before bumping a release version/,
    );

    const packageJson = await readJson(join(directory, 'package.json'));
    assert.equal(packageJson.version, '1.2.3');
    assert.equal(await git(directory, ['tag', '--list', 'v1.3.0']), '');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('bump-version refuses existing release tags before editing files', async () => {
  const directory = await createReleaseRepo();
  try {
    await git(directory, ['tag', '-a', 'v1.3.0', '-m', 'v1.3.0']);

    await assert.rejects(
      run(process.execPath, [BUMP_SCRIPT, 'minor'], directory),
      /Git tag "v1\.3\.0" already exists/,
    );

    const packageJson = await readJson(join(directory, 'package.json'));
    const packageLock = await readJson(join(directory, 'package-lock.json'));
    assert.equal(packageJson.version, '1.2.3');
    assert.equal(packageLock.version, '1.2.3');
    assert.equal(packageLock.packages[''].version, '1.2.3');
    assert.equal(await git(directory, ['status', '--porcelain']), '');
    assert.equal(await git(directory, ['log', '-1', '--pretty=%s']), 'test: initial release files');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
