import { Buffer } from 'node:buffer';
import { Readable, Writable } from 'node:stream';
import { once } from 'node:events';

function getRequestUrl(request) {
  return new URL(request.url, 'http://localhost');
}

function normalizeHeaders(request, bodyBuffer) {
  const headers = {};
  for (const [name, value] of request.headers.entries()) {
    headers[name.toLowerCase()] = value;
  }

  const requestUrl = getRequestUrl(request);
  if (!headers.host) {
    headers.host = requestUrl.host;
  }
  if (!headers['x-forwarded-proto']) {
    headers['x-forwarded-proto'] = requestUrl.protocol.replace(/:$/, '') || 'https';
  }
  if (bodyBuffer.length > 0 && !headers['content-length']) {
    headers['content-length'] = String(bodyBuffer.length);
  }

  return headers;
}

class FetchNodeRequest extends Readable {
  constructor(request, bodyBuffer) {
    super();
    const requestUrl = getRequestUrl(request);

    this.method = request.method;
    this.url = `${requestUrl.pathname}${requestUrl.search}`;
    this.headers = normalizeHeaders(request, bodyBuffer);
    this.httpVersion = '1.1';
    this.socket = { encrypted: requestUrl.protocol === 'https:' };
    this.aborted = false;
    this.complete = false;
    this.rawHeaders = Object.entries(this.headers).flat();

    this.bodyBuffer = bodyBuffer;
    this.bodyPushed = false;
  }

  _read() {
    if (this.bodyPushed) {
      return;
    }

    this.bodyPushed = true;
    if (this.bodyBuffer.length > 0) {
      this.push(this.bodyBuffer);
    }
    this.complete = true;
    this.push(null);
  }
}

function appendHeader(headers, name, value) {
  if (value === undefined || value === null) {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      appendHeader(headers, name, item);
    }
    return;
  }

  headers.append(name, String(value));
}

function isBodyForbiddenStatus(statusCode) {
  return statusCode === 204 || statusCode === 304;
}

export class FetchNodeResponse extends Writable {
  constructor() {
    super();
    this.statusCode = 200;
    this.headersSent = false;
    this.chunks = [];
    this.headers = new Map();
  }

  status(statusCode) {
    this.statusCode = statusCode;
    return this;
  }

  setHeader(name, value) {
    const normalizedName = String(name).toLowerCase();
    this.headers.set(normalizedName, {
      name: String(name),
      value,
    });
  }

  getHeader(name) {
    return this.headers.get(String(name).toLowerCase())?.value;
  }

  writeHead(statusCode, responseHeaders = {}) {
    this.statusCode = statusCode;
    for (const [name, value] of Object.entries(responseHeaders)) {
      this.setHeader(name, value);
    }
    this.headersSent = true;
    return this;
  }

  send(body) {
    if (!this.getHeader('Content-Type')) {
      this.setHeader(
        'Content-Type',
        typeof body === 'string' ? 'text/plain' : 'application/json',
      );
    }
    this.end(body);
  }

  _write(chunk, encoding, callback) {
    this.headersSent = true;
    this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
    callback();
  }

  async toFetchResponse({ method = 'GET' } = {}) {
    if (!this.writableEnded) {
      this.end();
    }
    if (!this.writableFinished) {
      await once(this, 'finish');
    }

    const headers = new Headers();
    for (const { name, value } of this.headers.values()) {
      appendHeader(headers, name, value);
    }

    const body = method === 'HEAD' || isBodyForbiddenStatus(this.statusCode)
      ? null
      : Buffer.concat(this.chunks);
    return new Response(body, {
      status: this.statusCode,
      headers,
    });
  }
}

export async function createFetchNodeAdapters(request) {
  const bodyBuffer = request.body
    ? Buffer.from(await request.arrayBuffer())
    : Buffer.alloc(0);

  return {
    req: new FetchNodeRequest(request, bodyBuffer),
    res: new FetchNodeResponse(),
  };
}
