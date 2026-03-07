import { createClient } from 'redis';

let redis = null;

export async function getRedisClient() {
  if (!redis) {
    const redisUrl = process.env.LINKS_REDIS_URL;
    if (!redisUrl) {
      throw new Error('LINKS_REDIS_URL environment variable is not set');
    }
    
    redis = createClient({
      url: redisUrl,
    });
    
    redis.on('error', (err) => console.error('Redis Client Error', err));
    
    await redis.connect();
  }
  
  return redis;
}
