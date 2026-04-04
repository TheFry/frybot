import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ChatInputCommandInteraction } from 'discord.js';
import { Redis } from 'ioredis';
import { newClient } from '../../src/helpers/redis';
import { CHANNEL_EVENT_KEY, ChannelEvent } from '../../src/helpers/common';
import { createMockInteraction } from '../__mocks__/discord-interaction';

const REDIS_URL = process.env['REDIS_URL'] || 'redis://localhost:6379';
const TEST_CHANNEL_ID = 'e2e-test-channel-events';

// Use real Redis for publishing
// eslint-disable-next-line @typescript-eslint/no-require-imports
const skipCommand = require('../../src/cmd_processor/commands/skip') as {
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
};
const pauseCommand = require('../../src/cmd_processor/commands/pause') as {
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
};
const stopCommand = require('../../src/cmd_processor/commands/stop') as {
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
};
const unpauseCommand = require('../../src/cmd_processor/commands/unpause') as {
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
};
const replayCommand = require('../../src/cmd_processor/commands/replay') as {
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
};

describe('E2E: Channel events flow', () => {
  let client: Redis;
  let subscriber: Redis;
  let receivedEvents: ChannelEvent[];

  beforeAll(async () => {
    client = await newClient(REDIS_URL);
    subscriber = client.duplicate();
    receivedEvents = [];

    await subscriber.subscribe(CHANNEL_EVENT_KEY);
    subscriber.on('message', (_channel: string, message: string) => {
      try {
        receivedEvents.push(JSON.parse(message) as ChannelEvent);
      } catch {
        // ignore parse errors
      }
    });

    // Give subscriber time to connect
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  beforeEach(() => {
    receivedEvents = [];
  });

  afterAll(async () => {
    await subscriber.unsubscribe();
    subscriber.disconnect();
    client.disconnect();
  });

  const commandTests = [
    { name: 'skip', command: skipCommand, eventType: 'skip' },
    { name: 'pause', command: pauseCommand, eventType: 'pause' },
    { name: 'stop', command: stopCommand, eventType: 'stop' },
    { name: 'unpause', command: unpauseCommand, eventType: 'unpause' },
    { name: 'replay', command: replayCommand, eventType: 'replay' },
  ];

  it.each(commandTests)('$name command publishes $eventType event to Redis', async ({ command, eventType }) => {
    const interaction = createMockInteraction({ channelId: TEST_CHANNEL_ID });
    await command.execute(interaction);

    // Wait for pub/sub message to arrive
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(receivedEvents.length).toBeGreaterThanOrEqual(1);
    const event = receivedEvents.find(e => e.type === eventType);
    expect(event).toBeDefined();
    expect(event?.channelId).toBe(TEST_CHANNEL_ID);
    expect(event?.type).toBe(eventType);
  });
});
