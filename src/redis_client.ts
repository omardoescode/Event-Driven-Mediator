/**
 * Redis client configuration and setup.
 * Provides a singleton Redis client instance for the application.
 * Handles connection management and error reporting.
 */

import { createClient, type RedisClientType } from 'redis';

/** Redis client instance configured to connect to local Redis server */
const redis_client: RedisClientType = createClient({
  url: 'redis://localhost:6379',
});

redis_client.connect().then(() => {
  console.log('✅ Connected to Redis');
});

redis_client.on('error', err => {
  console.error('❌ Redis Client Error', err);
});

export default redis_client;
