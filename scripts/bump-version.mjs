import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;
const BUMP_TYPES = new Set(['patch', 'minor', 'major']);

function parseVersion(versionText) {
  const match = VERSION_PATTERN.exec(versionText);
  if (!match) {
    throw new Error(`Invalid version "${versionText}". Expected semver like 1.2.3`);
  }

  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10),
  };
}

function formatVersion({ major, minor, patch }) {
  return `${major}.${minor}.${patch}`;
}

function resolveNextVersion(currentVersion, input) {
  if (!input) {
    throw new Error('Usage: node scripts/bump-version.mjs <patch|minor|major|x.y.z>');
  }

  if (BUMP_TYPES.has(input)) {
    const parsedVersion = parseVersion(currentVersion);

    if (input === 'major') {
      return formatVersion({
        major: parsedVersion.major + 1,
        minor: 0,
        patch: 0,
      });
    }

    if (input === 'minor') {
      return formatVersion({
        major: parsedVersion.major,
        minor: parsedVersion.minor + 1,
        patch: 0,
      });
    }

    return formatVersion({
      major: parsedVersion.major,
      minor: parsedVersion.minor,
      patch: parsedVersion.patch + 1,
    });
  }

  parseVersion(input);
  return input;
}

function replaceTopLevelVersion(fileContent, nextVersion) {
  let replacementCount = 0;
  const nextContent = fileContent.replace(/"version": "(\d+\.\d+\.\d+)"/g, (matchedVersion) => {
    replacementCount += 1;
    if (replacementCount > 2) {
      return matchedVersion;
    }
    return `"version": "${nextVersion}"`;
  });

  return { nextContent, replacementCount };
}

async function main() {
  const input = process.argv[2];
  const packageJsonPath = resolve('package.json');
  const packageLockPath = resolve('package-lock.json');

  const packageJsonContent = await readFile(packageJsonPath, 'utf8');
  const packageJson = JSON.parse(packageJsonContent);
  const currentVersion = packageJson.version;
  parseVersion(currentVersion);

  const nextVersion = resolveNextVersion(currentVersion, input);
  packageJson.version = nextVersion;
  await writeFile(`${packageJsonPath}`, `${JSON.stringify(packageJson, null, 2)}\n`);

  const packageLockContent = await readFile(packageLockPath, 'utf8');
  const { nextContent, replacementCount } = replaceTopLevelVersion(packageLockContent, nextVersion);
  if (replacementCount < 2) {
    throw new Error('Failed to update package-lock.json top-level version fields');
  }
  await writeFile(`${packageLockPath}`, nextContent);

  process.stdout.write(`${currentVersion} -> ${nextVersion}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
