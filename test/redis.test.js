import test from 'node:test';
import assert from 'node:assert/strict';
import { connectRedisClient, isLikelyTlsMismatchError } from '../lib/redis.js';

function createLoggerMock() {
  const warnings = [];
  const errors = [];
  return {
    warn: (...args) => warnings.push(args),
    error: (...args) => errors.push(args),
    getWarnings: () => warnings,
    getErrors: () => errors,
  };
}

function createClientFactory({ behaviorByUrl }) {
  const calls = [];

  const clientFactory = (options) => {
    calls.push(options);

    return {
      on() {},
      async connect() {
        const connectBehavior = behaviorByUrl.get(options.url);
        if (connectBehavior instanceof Error) {
          throw connectBehavior;
        }
      },
    };
  };

  return { clientFactory, calls };
}

test('isLikelyTlsMismatchError detects common TLS mismatch errors', () => {
  assert.equal(
    isLikelyTlsMismatchError(new Error('Socket closed unexpectedly')),
    true,
  );
  assert.equal(
    isLikelyTlsMismatchError(new Error('TLS handshake failed')),
    true,
  );
  assert.equal(
    isLikelyTlsMismatchError(new Error('getaddrinfo ENOTFOUND example.com')),
    false,
  );
});

test('connectRedisClient connects directly with rediss URL and TLS socket', async () => {
  const { clientFactory, calls } = createClientFactory({
    behaviorByUrl: new Map([['rediss://example.com:6379', null]]),
  });
  const logger = createLoggerMock();

  await connectRedisClient({
    redisUrl: 'rediss://example.com:6379',
    clientFactory,
    logger,
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    url: 'rediss://example.com:6379',
    socket: { reconnectStrategy: false, tls: true },
  });
  assert.equal(logger.getWarnings().length, 0);
});

test('connectRedisClient connects directly with redis URL without TLS socket', async () => {
  const { clientFactory, calls } = createClientFactory({
    behaviorByUrl: new Map([['redis://example.com:6379', null]]),
  });
  const logger = createLoggerMock();

  await connectRedisClient({
    redisUrl: 'redis://example.com:6379',
    clientFactory,
    logger,
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    url: 'redis://example.com:6379',
    socket: { reconnectStrategy: false },
  });
  assert.equal(logger.getWarnings().length, 0);
});

test('connectRedisClient retries once with rediss when redis URL fails with TLS-like error', async () => {
  const { clientFactory, calls } = createClientFactory({
    behaviorByUrl: new Map([
      ['redis://example.com:6379', new Error('Socket closed unexpectedly')],
      ['rediss://example.com:6379', null],
    ]),
  });
  const logger = createLoggerMock();

  await connectRedisClient({
    redisUrl: 'redis://example.com:6379',
    clientFactory,
    logger,
  });

  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], {
    url: 'redis://example.com:6379',
    socket: { reconnectStrategy: false },
  });
  assert.deepEqual(calls[1], {
    url: 'rediss://example.com:6379',
    socket: { reconnectStrategy: false, tls: true },
  });
  assert.equal(logger.getWarnings().length, 1);
});

test('connectRedisClient throws original error when TLS retry also fails', async () => {
  const originalError = new Error('Socket closed unexpectedly');
  const retryError = new Error('TLS handshake failed');
  const { clientFactory, calls } = createClientFactory({
    behaviorByUrl: new Map([
      ['redis://example.com:6379', originalError],
      ['rediss://example.com:6379', retryError],
    ]),
  });
  const logger = createLoggerMock();

  await assert.rejects(
    connectRedisClient({
      redisUrl: 'redis://example.com:6379',
      clientFactory,
      logger,
    }),
    (error) => error === originalError,
  );

  assert.equal(calls.length, 2);
  assert.equal(logger.getWarnings().length, 0);
  assert.equal(logger.getErrors().length, 1);
});

test('connectRedisClient does not retry rediss URL when initial connection fails', async () => {
  const initialError = new Error('Socket closed unexpectedly');
  const { clientFactory, calls } = createClientFactory({
    behaviorByUrl: new Map([['rediss://example.com:6379', initialError]]),
  });
  const logger = createLoggerMock();

  await assert.rejects(
    connectRedisClient({
      redisUrl: 'rediss://example.com:6379',
      clientFactory,
      logger,
    }),
    (error) => error === initialError,
  );

  assert.equal(calls.length, 1);
  assert.equal(logger.getWarnings().length, 0);
});
