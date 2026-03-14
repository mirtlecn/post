import { createClient } from 'redis';

let redis = null;

function buildRedisClientOptions(redisUrl) {
  const useTls = typeof redisUrl === 'string' && redisUrl.startsWith('rediss://');
  const socket = {
    reconnectStrategy: false,
  };
  if (useTls) {
    socket.tls = true;
  }

  return {
    url: redisUrl,
    socket,
  };
}

function buildRedissUrl(redisUrl) {
  return `rediss://${redisUrl.slice('redis://'.length)}`;
}

export function isLikelyTlsMismatchError(error) {
  const errorName = String(error?.name || '').toLowerCase();
  const errorMessage = String(error?.message || '').toLowerCase();
  const fullText = `${errorName} ${errorMessage}`;

  return (
    fullText.includes('socketclosedunexpectedlyerror') ||
    fullText.includes('socket closed unexpectedly') ||
    fullText.includes('tls') ||
    fullText.includes('ssl') ||
    fullText.includes('eof') ||
    fullText.includes('handshake')
  );
}

async function connectOnce(redisUrl, clientFactory) {
  const client = clientFactory(buildRedisClientOptions(redisUrl));
  client.on('error', (err) => console.error('Redis Client Error', err));
  await client.connect();
  return client;
}

export async function connectRedisClient({
  redisUrl,
  clientFactory = createClient,
  logger = console,
}) {
  try {
    return await connectOnce(redisUrl, clientFactory);
  } catch (initialError) {
    const shouldRetryWithTls =
      typeof redisUrl === 'string' &&
      redisUrl.startsWith('redis://') &&
      isLikelyTlsMismatchError(initialError);

    if (!shouldRetryWithTls) {
      throw initialError;
    }

    const tlsRedisUrl = buildRedissUrl(redisUrl);
    try {
      const client = await connectOnce(tlsRedisUrl, clientFactory);
      logger.warn(
        'Redis connection fallback succeeded with rediss://. Please update LINKS_REDIS_URL to use rediss:// directly.',
      );
      return client;
    } catch (retryError) {
      logger.error(
        'Redis TLS fallback failed. Please verify LINKS_REDIS_URL and prefer rediss:// for managed Redis providers.',
        retryError,
      );
      throw initialError;
    }
  }
}

export async function getRedisClient() {
  if (!redis) {
    const redisUrl = process.env.LINKS_REDIS_URL;
    if (!redisUrl) {
      throw new Error('LINKS_REDIS_URL environment variable is not set');
    }

    redis = await connectRedisClient({ redisUrl });
  }

  return redis;
}
