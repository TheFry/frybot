import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { ChatInputCommandInteraction } from 'discord.js';
import { CHANNEL_EVENT_KEY } from '../../../src/helpers/common';
import { createMockInteraction } from '../../__mocks__/discord-interaction';

jest.mock('../../../src/helpers/redis', () => ({
  redisClient: {
    publish: jest.fn().mockResolvedValue(1 as never),
  },
  newClient: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { execute } = require('../../../src/cmd_processor/commands/replay') as {
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
};

const { redisClient } = require('../../../src/helpers/redis') as {
  redisClient: { publish: ReturnType<typeof jest.fn> };
};

describe('replay command', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('publishes replay event when user is in a voice channel', async () => {
    const interaction = createMockInteraction({ channelId: '12345' });
    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalledWith('Replaying...');
    expect(redisClient.publish).toHaveBeenCalledWith(
      CHANNEL_EVENT_KEY,
      expect.stringContaining('"type":"replay"')
    );
    const published = JSON.parse(redisClient.publish.mock.calls[0][1]);
    expect(published.channelId).toBe('12345');
  });

  it('replies with error when user is not in a voice channel', async () => {
    const interaction = createMockInteraction({ channelId: null });
    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalledWith('Replaying...');
    expect(interaction.editReply).toHaveBeenCalledWith(
      'You need to be in a voice channel to run this command'
    );
    expect(redisClient.publish).not.toHaveBeenCalled();
  });
});

// Cover the DEBUG=false branch (module-level ternary evaluated at load time)
it('loads module without DEBUG set (covers false branch of DEBUG ternary)', () => {
  const savedDebug = process.env['DEBUG'];
  delete process.env['DEBUG'];
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require(`../../../src/cmd_processor/commands/replay`);
  });
  if (savedDebug !== undefined) process.env['DEBUG'] = savedDebug;
});
