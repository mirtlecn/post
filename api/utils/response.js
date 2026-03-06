/**
 * HTTP 响应工具函数
 * 统一所有响应格式，确保 Content-Type 和换行符一致。
 */

/** 发送 JSON 响应 */
export function jsonResponse(res, data, status = 200) {
  res.setHeader('Content-Type', 'application/json');
  res.status(status).send(JSON.stringify(data) + '\n');
}

/** 发送纯文本响应 */
export function textResponse(res, text, cache = true) {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  if (cache) res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
  res.status(200).send(text + '\n');
}

/** 发送 HTML 响应 */
export function htmlResponse(res, html, cache = true) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (cache) res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
  res.status(200).send(html);
}

/** 发送重定向响应 */
export function redirectResponse(res, url, cache = true) {
  const headers = { Location: url };
  if (cache) {
    headers['Cache-Control'] = 'public, max-age=86400, s-maxage=86400';
  }
  res.writeHead(302, headers);
  res.end();
}

/**
 * 将 S3 对象流式代理给用户，地址栏 URL 保持不变。
 * 适合图片等小文件（≤10MB）。
 * @param {object} s3Object - { body: Readable, contentType, contentLength }
 */
export function proxyStreamResponse(res, s3Object) {
  const { body, contentType, contentLength } = s3Object;
  res.statusCode = 200;
  if (contentType) res.setHeader('Content-Type', contentType);
  if (contentLength) res.setHeader('Content-Length', contentLength);
  res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
  body.pipe(res);
}
