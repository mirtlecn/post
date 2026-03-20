import {
  textResponse,
  htmlResponse,
  redirectResponse,
  errorResponse,
  binaryResponse,
  proxyStreamWithCache,
} from './response.js';
import { isS3Configured, getS3Object } from './s3.js';
import { getFileCache, setFileCache, getCacheMaxBytes } from './file-cache.js';
import { convertMarkdownToHtml, convertToQrCode } from './converter.js';
import { getTopicDisplayTitle, resolveTopicPath } from '../services/topic-store.js';

const TOPIC_CACHE_CONTROL = 'public, max-age=600, s-maxage=600';
const DEFAULT_CACHE_CONTROL = 'public, max-age=86400, s-maxage=86400';

export async function resolvePublicRender({ type, content, title = '', path, redis }) {
  if (type === 'url') {
    return {
      responseKind: 'redirect',
      renderedContent: content,
      contentType: null,
      cacheControl: DEFAULT_CACHE_CONTROL,
    };
  }

  if (type === 'topic') {
    return {
      responseKind: 'html',
      renderedContent: content,
      contentType: 'text/html; charset=utf-8',
      cacheControl: TOPIC_CACHE_CONTROL,
    };
  }

  if (type === 'html') {
    return {
      responseKind: 'html',
      renderedContent: content,
      contentType: 'text/html; charset=utf-8',
      cacheControl: DEFAULT_CACHE_CONTROL,
    };
  }

  if (type === 'md') {
    const renderOptions = { pageTitle: title };

    if (redis && path) {
      const resolvedTopicPath = await resolveTopicPath(redis, { path });
      if (resolvedTopicPath.isTopicItem) {
        renderOptions.topicBackLink = `/${resolvedTopicPath.topicName}`;
        renderOptions.topicBackLabel = await getTopicDisplayTitle(redis, resolvedTopicPath.topicName);
      }
    }

    return {
      responseKind: 'html',
      renderedContent: convertMarkdownToHtml(content, renderOptions),
      contentType: 'text/html; charset=utf-8',
      cacheControl: DEFAULT_CACHE_CONTROL,
    };
  }

  if (type === 'qrcode') {
    return {
      responseKind: 'text',
      renderedContent: await convertToQrCode(content),
      contentType: 'text/plain; charset=utf-8',
      cacheControl: DEFAULT_CACHE_CONTROL,
    };
  }

  return {
    responseKind: 'text',
    renderedContent: content,
    contentType: 'text/plain; charset=utf-8',
    cacheControl: DEFAULT_CACHE_CONTROL,
  };
}

export async function respondByType(req, res, { type, content, title = '', path, redis }) {
  const isHeadRequest = req.method === 'HEAD';

  if (type !== 'file') {
    let renderResult;
    try {
      renderResult = await resolvePublicRender({ type, content, title, path, redis });
    } catch (error) {
      console.error(`Failed to render public content for ${path}`, error);
      errorResponse(res, { code: 'internal', message: 'Failed to render content' }, 500);
      return;
    }

    if (renderResult.responseKind === 'redirect') {
      redirectResponse(res, renderResult.renderedContent);
      return;
    }

    const contentLength = renderResult.responseKind === 'text'
      ? Buffer.byteLength(`${renderResult.renderedContent}\n`)
      : Buffer.byteLength(renderResult.renderedContent);

    if (isHeadRequest) {
      sendHeadResponse(res, {
        contentType: renderResult.contentType,
        contentLength,
        cacheControl: renderResult.cacheControl,
      });
      return;
    }

    if (renderResult.responseKind === 'html') {
      res.setHeader('Cache-Control', renderResult.cacheControl);
      htmlResponse(res, renderResult.renderedContent, false);
      return;
    }

    textResponse(res, renderResult.renderedContent);
    return;
  }

  if (!isS3Configured()) {
    errorResponse(res, { code: 's3_not_configured', message: 'S3 service is not configured' }, 501);
    return;
  }

  try {
    const cached = await getFileCache(redis, path);
    if (cached) {
      if (isHeadRequest) {
        sendHeadResponse(res, {
          contentType: cached.contentType,
          contentLength: cached.contentLength,
          cacheControl: 'public, max-age=86400, s-maxage=86400',
        });
        return;
      }
      binaryResponse(res, cached);
      return;
    }
  } catch (error) {
    console.warn('Cache read failed:', error);
  }

  try {
    const s3Object = await getS3Object(content);
    if (isHeadRequest) {
      sendHeadResponse(res, {
        contentType: s3Object.contentType,
        contentLength: s3Object.contentLength,
        cacheControl: 'public, max-age=86400, s-maxage=86400',
      });
      return;
    }
    await proxyStreamWithCache(res, s3Object, {
      maxBytes: getCacheMaxBytes(),
      writeCache: async (buffer, meta) => {
        await setFileCache(redis, path, {
          buffer,
          contentType: meta.contentType,
          contentLength: meta.contentLength,
        });
      },
    });
  } catch (error) {
    console.error('Failed to serve file', error);
    errorResponse(res, { code: 'internal', message: 'Failed to retrieve file' }, 500);
  }
}

function sendHeadResponse(res, { contentType, contentLength, cacheControl }) {
  res.statusCode = 200;
  if (contentType) {
    res.setHeader('Content-Type', contentType);
  }
  if (contentLength !== undefined && contentLength !== null) {
    res.setHeader('Content-Length', contentLength);
  }
  if (cacheControl) {
    res.setHeader('Cache-Control', cacheControl);
  }
  res.end();
}
