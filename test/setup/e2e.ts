import Redis from 'ioredis';

export default async function setup() {
  process.env['LOG_LEVEL'] = '0';
  process.env['DEBUG'] = '1';
  const url = process.env['REDIS_URL'] || 'redis://localhost:6379';
  const client = new Redis(url);
  try {
    await client.ping();
  } catch (err) {
    await client.disconnect();
    throw new Error(`E2E tests require Redis at ${url}. Is it running?\n${err}`);
  }
  await client.disconnect();
}
