import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { addSong, getSong } from '../../../src/helpers/playlist';
import { dequeue } from '../../../src/helpers/message_queue';
import { newClient, redisClient } from '../../../src/helpers/redis';
import { testVideos } from '../../__fixtures__/playlist-entries';

const REDIS_URL = process.env['REDIS_URL'] || 'redis://localhost:6379';
const CHANNEL_ID = 'test-channel-lol';
const QUEUE_KEY = `discord:channel:${CHANNEL_ID}:queue`

const testCaseCounts = [1, 3, undefined];


describe('Test playlist helper functions', () => {
  beforeAll(async () => await newClient(REDIS_URL));
  beforeEach(async () => await dequeue(QUEUE_KEY, -1));
  afterAll(async () => {
    await dequeue(QUEUE_KEY, -1);
    redisClient?.disconnect();
  });

  it.each(testCaseCounts)('should add %i songs to the playlist and retrieve them (NaN = all)', async (count) => {
    count = count || testVideos.length;
    const responses = [];
    await addSong(CHANNEL_ID, testVideos.slice(0, count));

    let song = await getSong(CHANNEL_ID, -1);
    while(song) {
      responses.push(song);
      song = await getSong(CHANNEL_ID, -1);
    }

    expect(responses.length).toBe(count);
    expect(responses).toEqual(testVideos.slice(0, count));
    expect(await getSong(CHANNEL_ID, -1)).toBeUndefined();
  }, 10000);

  it.each(testCaseCounts)('should block and then retrieve %i songs when they are added to the playlist', async (count) => {
    count = count || testVideos.length;
    const responses = [];

    setTimeout(async () => {
      await addSong(CHANNEL_ID, testVideos.slice(0, count));
    }, 2000);

    let song = await getSong(CHANNEL_ID, 4);
    while(song) {
      responses.push(song);
      song = await getSong(CHANNEL_ID, 4);
    }

    expect(responses.length).toBe(count);
    expect(responses).toEqual(testVideos.slice(0, count));
    expect(await getSong(CHANNEL_ID, -1)).toBeUndefined();
  }, 10000);

  it.each(testCaseCounts)('should block and timeout, returning nothing', async () => {
    const responses = [];

    let song = await getSong(CHANNEL_ID, 4);
    while(song) {
      responses.push(song);
      song = await getSong(CHANNEL_ID, 4);
    }

    expect(responses.length).toBe(0);
    expect(await getSong(CHANNEL_ID, -1)).toBeUndefined();
  }, 10000);

  it('should add songs with inFront=true and retrieve them first', async () => {
    await addSong(CHANNEL_ID, [testVideos[0]]);
    await addSong(CHANNEL_ID, [testVideos[1]], true);

    const first = await getSong(CHANNEL_ID, -1);
    const second = await getSong(CHANNEL_ID, -1);

    expect(first).toEqual(testVideos[1]);
    expect(second).toEqual(testVideos[0]);
  }, 10000);
});
