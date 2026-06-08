import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { embeddedAssets } from './embedded-data.js';

const assetDirectory = dirname(fileURLToPath(import.meta.url));
const { manifestPath, filesDirectory } = resolveEmbeddedAssetPaths();

let assetMapByKey = new Map();
let assetMapByRoute = new Map();

initializeAssets();

export function resolveEmbeddedAssetPaths({
  moduleDirectory = assetDirectory,
  cwd = process.cwd(),
} = {}) {
  const candidateDirectories = [
    moduleDirectory,
    join(moduleDirectory, 'lib', 'assets'),
    join(cwd, 'lib', 'assets'),
    cwd,
  ];

  for (const candidateDirectory of candidateDirectories) {
    const candidateManifestPath = join(candidateDirectory, 'manifest.json');
    const candidateFilesDirectory = join(candidateDirectory, 'files');
    if (existsSync(candidateManifestPath) && existsSync(candidateFilesDirectory)) {
      return {
        manifestPath: candidateManifestPath,
        filesDirectory: candidateFilesDirectory,
      };
    }
  }

  return {
    manifestPath: join(moduleDirectory, 'manifest.json'),
    filesDirectory: join(moduleDirectory, 'files'),
  };
}

function initializeAssets() {
  const manifest = embeddedAssets.length > 0
    ? embeddedAssets
    : JSON.parse(readFileSync(manifestPath, 'utf8'));
  assetMapByKey = new Map();
  assetMapByRoute = new Map();

  for (const asset of manifest) {
    if (!asset.key || !asset.route_path || !asset.file_name || !asset.content_type) {
      throw new Error(`Asset manifest entry is incomplete: ${JSON.stringify(asset)}`);
    }
    const content = typeof asset.content_base64 === 'string'
      ? Buffer.from(asset.content_base64, 'base64')
      : readAssetFile(asset.file_name);
    const record = { ...asset, content };
    assetMapByKey.set(asset.key, record);
    assetMapByRoute.set(asset.route_path, record);
  }
}

function readAssetFile(fileName) {
  const filePath = join(filesDirectory, fileName);
  if (!existsSync(filePath)) {
    throw new Error(`Embedded asset file not found: ${fileName}`);
  }

  return readFileSync(filePath);
}

export function getEmbeddedAssetUrl(key) {
  const asset = assetMapByKey.get(key);
  if (!asset) {
    throw new Error(`Embedded asset key not found: ${key}`);
  }
  return asset.route_path;
}

export function lookupEmbeddedAsset(routePath) {
  return assetMapByRoute.get(routePath) || null;
}

export function isReservedEmbeddedAssetPath(routePath) {
  return assetMapByRoute.has(routePath);
}
