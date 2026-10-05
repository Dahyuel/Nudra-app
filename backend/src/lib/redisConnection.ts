/** Use the same self-hosted Redis service in development and production. */
export function getRedisUrl(): string {
  const url = process.env.REDIS_URL || (process.env.NODE_ENV === 'production'
    ? 'redis://redis:6379'
    : 'redis://localhost:6379');
  if (process.env.NODE_ENV === 'production' && !url.startsWith('redis://')) {
    throw new Error('REDIS_URL must use the local redis:// service in production');
  }
  return url;
}
