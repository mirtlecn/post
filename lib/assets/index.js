import { basename } from 'node:path';
import { embeddedAssets } from 'gfm-it/embedded';

const assetRoutePrefix = '/asset/';
const excludedEmbeddedAssetKeys = new Set(['highlight_js']);

let assetMapByKey = new Map();
let assetMapByRoute = new Map();

initializeAssets();

function initializeAssets() {
  assetMapByKey = new Map();
  assetMapByRoute = new Map();

  for (const asset of embeddedAssets) {
    if (excludedEmbeddedAssetKeys.has(asset.key)) {
      continue;
    }

    const record = createAssetRecord(asset);
    assetMapByKey.set(asset.key, record);
    assetMapByRoute.set(record.route_path, record);
  }
}

function createAssetRecord(asset) {
  if (!asset.key || !asset.file || !asset.contentType || !asset.contentBase64) {
    throw new Error(`GFM asset entry is incomplete: ${JSON.stringify(asset)}`);
  }

  const fileName = basename(asset.file);
  return {
    key: asset.key,
    route_path: `${assetRoutePrefix}${asset.key}`,
    file: asset.file,
    file_name: fileName,
    content_type: asset.contentType,
    contentType: asset.contentType,
    content: Buffer.from(asset.contentBase64, 'base64'),
  };
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
