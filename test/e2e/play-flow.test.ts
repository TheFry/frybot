import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ChatInputCommandInteraction } from 'discord.js';
import { Redis } from 'ioredis';
import { newClient, redisClient } from '../../src/helpers/redis';
import { dequeue } from '../../src/helpers/message_queue';
import { createMockInteraction, createMockButtonInteraction, createMockMessage } from '../__mocks__/discord-interaction';
import { mockYTSearchResults } from '../__fixtures__/playlist-entries';

const REDIS_URL = process.env['REDIS_URL'] || 'redis://localhost:6379';
const TEST_CHANNEL_ID = 'e2e-test-channel-play';
const TEST_GUILD_ID = 'e2e-test-guild-play';
const QUEUE_KEY = `discord:channel:${TEST_CHANNEL_ID}:queue`;
const GUILD_KEY = `discord:channel:${TEST_CHANNEL_ID}:guild-id`;

// Mock only YouTube (no real API calls) but use real Redis
jest.mock('../../src/helpers/youtube', () => ({
  search: jest.fn().mockResolvedValue(mockYTSearchResults as never),
}));

 
const { execute } = require('../../src/cmd_processor/commands/play') as {
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
};

describe('E2E: Play flow', () => {
  let client: Redis;

  beforeAll(async () => {
    client = await newClient(REDIS_URL);
  });

  beforeEach(async () => {
    // Clean up test keys
    await dequeue(QUEUE_KEY, -1);
    await redisClient?.del(GUILD_KEY);
    await redisClient?.srem('frybot:reserved-channels', TEST_CHANNEL_ID);
  });

  afterAll(async () => {
    await dequeue(QUEUE_KEY, -1);
    await redisClient?.del(GUILD_KEY);
    await redisClient?.srem('frybot:reserved-channels', TEST_CHANNEL_ID);
    client.disconnect();
  });

  it('full play flow: search -> select -> song appears in Redis queue', async () => {
    // Set up mock interaction with button click
    const mockMsg = createMockMessage();
    const btnInteraction = createMockButtonInteraction('abc123', 'Test Song 1');
    mockMsg.awaitMessageComponent.mockResolvedValue(btnInteraction as never);

    const interaction = createMockInteraction({
      channelId: TEST_CHANNEL_ID,
      guildId: TEST_GUILD_ID,
      queryString: 'test song',
    });
    (interaction.editReply as ReturnType<typeof jest.fn>).mockResolvedValue(mockMsg as never);

    // Execute the play command
    await execute(interaction);

    // Verify guild ID was stored in Redis
    const guildId = await redisClient?.get(GUILD_KEY);
    expect(guildId).toBe(TEST_GUILD_ID);

    // Verify the song was enqueued in Redis
    const queueLen = await redisClient?.llen(QUEUE_KEY);
    expect(queueLen).toBe(1);

    // Dequeue and verify the entry
    const dequeued = await dequeue(QUEUE_KEY, 1);
    expect(dequeued).toHaveLength(1);
    expect(dequeued[0].error).toBeUndefined();

    const entry = dequeued[0].message as { youtubeVideoId: string; youtubeVideoTitle: string };
    expect(entry.youtubeVideoId).toBe('abc123');
    expect(entry.youtubeVideoTitle).toBe('Test Song 1');
  });

  it('play with next=true enqueues song at front of queue', async () => {
    // Pre-add a song to the queue
    const { addSong } = require('../../src/helpers/playlist');
    await addSong(TEST_CHANNEL_ID, [{
      youtubeVideoId: 'existing-song',
      youtubeVideoTitle: 'Existing Song',
      interactionId: '111',
    }]);

    // Now play a new song with next=true
    const mockMsg = createMockMessage();
    const btnInteraction = createMockButtonInteraction('new-song', 'New Song');
    mockMsg.awaitMessageComponent.mockResolvedValue(btnInteraction as never);

    const interaction = createMockInteraction({
      channelId: TEST_CHANNEL_ID,
      guildId: TEST_GUILD_ID,
      queryString: 'new song',
      booleanNext: true,
    });
    (interaction.editReply as ReturnType<typeof jest.fn>).mockResolvedValue(mockMsg as never);

    await execute(interaction);

    // The new song should be dequeued first (it was added to front)
    const first = await dequeue(QUEUE_KEY, 1);
    expect(first).toHaveLength(1);
    const firstEntry = first[0].message as { youtubeVideoId: string };
    expect(firstEntry.youtubeVideoId).toBe('new-song');

    // The existing song should be second
    const second = await dequeue(QUEUE_KEY, 1);
    expect(second).toHaveLength(1);
    const secondEntry = second[0].message as { youtubeVideoId: string };
    expect(secondEntry.youtubeVideoId).toBe('existing-song');
  });
});
