import { Buffer } from 'node:buffer';
import { Readable, Writable } from 'node:stream';
import { TransformStream } from 'node:stream/web';
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
  constructor({ streamBody = false } = {}) {
    super();
    this.statusCode = 200;
    this.headersSent = false;
    this.streamBody = streamBody;
    this.chunks = streamBody ? null : [];
    this.headers = new Map();
    if (streamBody) {
      this.bodyStream = new TransformStream();
      this.bodyWriter = this.bodyStream.writable.getWriter();
      this.bodyWriteChain = Promise.resolve();
      this.fetchResponseMethod = 'GET';
      this.fetchResponseStarted = false;
      this.fetchResponsePromise = new Promise((resolve, reject) => {
        this.resolveFetchResponse = resolve;
        this.rejectFetchResponse = reject;
      });
    }
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

  startFetchResponse() {
    if (!this.streamBody || this.fetchResponseStarted) {
      return;
    }
    this.fetchResponseStarted = true;
    this.headersSent = true;

    const headers = new Headers();
    for (const { name, value } of this.headers.values()) {
      appendHeader(headers, name, value);
    }

    const body = this.fetchResponseMethod === 'HEAD' || isBodyForbiddenStatus(this.statusCode)
      ? null
      : this.bodyStream.readable;
    this.resolveFetchResponse(new Response(body, {
      status: this.statusCode,
      headers,
    }));
  }

  _write(chunk, encoding, callback) {
    this.headersSent = true;
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding);
    if (!this.streamBody) {
      this.chunks.push(buffer);
      callback();
      return;
    }

    this.startFetchResponse();
    this.bodyWriteChain = this.bodyWriteChain.then(() => this.bodyWriter.write(buffer));
    this.bodyWriteChain.then(() => callback(), callback);
  }

  _final(callback) {
    if (!this.streamBody) {
      callback();
      return;
    }

    this.startFetchResponse();
    this.bodyWriteChain = this.bodyWriteChain.then(() => this.bodyWriter.close());
    this.bodyWriteChain.then(() => callback(), callback);
  }

  _destroy(error, callback) {
    if (this.streamBody) {
      if (!this.fetchResponseStarted && error) {
        this.rejectFetchResponse(error);
      }
      if (error) {
        this.bodyWriter?.abort(error).catch(() => {});
      }
      callback();
      return;
    }
    callback(error);
  }

  async toFetchResponse({ method = 'GET' } = {}) {
    if (this.streamBody) {
      this.fetchResponseMethod = method;
      if (this.writableEnded && !this.fetchResponseStarted) {
        this.startFetchResponse();
      }
      return this.fetchResponsePromise;
    }

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

export async function createFetchNodeAdapters(request, { streamResponse = false } = {}) {
  const bodyBuffer = request.body
    ? Buffer.from(await request.arrayBuffer())
    : Buffer.alloc(0);

  return {
    req: new FetchNodeRequest(request, bodyBuffer),
    res: new FetchNodeResponse({ streamBody: streamResponse }),
  };
}
