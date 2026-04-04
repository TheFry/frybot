import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { ChatInputCommandInteraction } from 'discord.js';
import { createMockInteraction, createMockModalSubmission } from '../../__mocks__/discord-interaction';
import { mockYTSearchResults } from '../../__fixtures__/playlist-entries';

const mockAddSong = jest.fn().mockResolvedValue([] as never);
const mockSetnx = jest.fn().mockResolvedValue(1 as never);
const mockCheckIfWatched = jest.fn().mockResolvedValue(undefined as never);

jest.mock('../../../src/helpers/redis', () => ({
  redisClient: {
    setnx: mockSetnx,
    checkIfWatched: mockCheckIfWatched,
  },
  newClient: jest.fn(),
}));

jest.mock('../../../src/helpers/playlist', () => ({
  addSong: mockAddSong,
}));

jest.mock('../../../src/helpers/youtube', () => ({
  list: jest.fn().mockResolvedValue(mockYTSearchResults as never),
}));

jest.mock('../../../src/helpers/logger', () => ({
  logConsole: jest.fn(),
  LogType: { Error: 1, Warn: 2, Debug: 3 },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { execute } = require('../../../src/cmd_processor/commands/play-many') as {
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
};

const yt = require('../../../src/helpers/youtube') as { list: ReturnType<typeof jest.fn> };

describe('play-many command', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('replies with error when user is not in a voice channel', async () => {
    const interaction = createMockInteraction({ channelId: null });
    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith('You must be in a voice channel to play music!');
    expect(mockAddSong).not.toHaveBeenCalled();
  });

  it('enqueues songs when modal has valid YouTube URLs', async () => {
    const validLinks = [
      'https://www.youtube.com/watch?v=abc123',
      'https://www.youtube.com/watch?v=def456',
    ].join('\n');

    const modalSubmission = createMockModalSubmission({});
    // Override getTextInputValue to return our links for any field
    (modalSubmission.fields.getTextInputValue as ReturnType<typeof jest.fn>).mockReturnValue(validLinks);

    const interaction = createMockInteraction({ channelId: '12345', guildId: '99999' });
    (interaction.awaitModalSubmit as ReturnType<typeof jest.fn>).mockResolvedValue(modalSubmission as never);

    await execute(interaction);

    expect(yt.list).toHaveBeenCalledWith(['abc123', 'def456'], 'video', process.env['YT_TOKEN']);
    expect(mockAddSong).toHaveBeenCalled();
    expect(mockSetnx).toHaveBeenCalledWith('discord:channel:12345:guild-id', '99999');
  });

  it('reports bad links alongside valid ones', async () => {
    const mixedLinks = [
      'https://www.youtube.com/watch?v=abc123',
      'not-a-url',
      'https://example.com',
    ].join('\n');

    const modalSubmission = createMockModalSubmission({});
    (modalSubmission.fields.getTextInputValue as ReturnType<typeof jest.fn>).mockReturnValue(mixedLinks);

    const interaction = createMockInteraction({ channelId: '12345', guildId: '99999' });
    (interaction.awaitModalSubmit as ReturnType<typeof jest.fn>).mockResolvedValue(modalSubmission as never);

    await execute(interaction);

    expect(modalSubmission.editReply).toHaveBeenCalledWith(
      expect.stringContaining('Invalid Links')
    );
    expect(yt.list).toHaveBeenCalledWith(['abc123'], 'video', process.env['YT_TOKEN']);
  });

  it('returns early when no valid links provided', async () => {
    const badLinks = ['not-a-url', 'also-not-a-url'].join('\n');

    const modalSubmission = createMockModalSubmission({});
    (modalSubmission.fields.getTextInputValue as ReturnType<typeof jest.fn>).mockReturnValue(badLinks);

    const interaction = createMockInteraction({ channelId: '12345', guildId: '99999' });
    (interaction.awaitModalSubmit as ReturnType<typeof jest.fn>).mockResolvedValue(modalSubmission as never);

    await execute(interaction);

    expect(modalSubmission.editReply).toHaveBeenCalledWith('No valid links provided');
    expect(mockAddSong).not.toHaveBeenCalled();
  });

  it('handles modal timeout', async () => {
    const interaction = createMockInteraction({ channelId: '12345' });
    (interaction.awaitModalSubmit as ReturnType<typeof jest.fn>).mockRejectedValue(new Error('Timeout') as never);

    await execute(interaction);

    expect(mockAddSong).not.toHaveBeenCalled();
  });

  it('logs error and replies when addSong throws', async () => {
    mockAddSong.mockRejectedValueOnce(new Error('redis down') as never);

    const validLinks = 'https://www.youtube.com/watch?v=abc123';
    const modalSubmission = createMockModalSubmission({});
    (modalSubmission.fields.getTextInputValue as ReturnType<typeof jest.fn>).mockReturnValue(validLinks);

    const interaction = createMockInteraction({ channelId: '12345', guildId: '99999' });
    (interaction.awaitModalSubmit as ReturnType<typeof jest.fn>).mockResolvedValue(modalSubmission as never);

    await execute(interaction);

    const { logConsole } = require('../../../src/helpers/logger') as { logConsole: ReturnType<typeof jest.fn> };
    expect(logConsole).toHaveBeenCalled();
    expect(modalSubmission.editReply).toHaveBeenCalledWith('Error adding songs');
  });
});

it('loads play-many module without DEBUG set (covers false branch of DEBUG ternary)', () => {
  const savedDebug = process.env['DEBUG'];
  delete process.env['DEBUG'];
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../../../src/cmd_processor/commands/play-many');
  });
  if (savedDebug !== undefined) process.env['DEBUG'] = savedDebug;
});
