import Redis from 'ioredis';

export default async function setup() {
  process.env['LOG_LEVEL'] = '0';
  const url = process.env['REDIS_URL'] || 'redis://localhost:6379';
  const client = new Redis(url);
  try {
    await client.ping();
  } catch (err) {
    await client.disconnect();
    throw new Error(`Integration tests require Redis at ${url}. Is it running?\n${err}`);
  }
  await client.disconnect();
}
