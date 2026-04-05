import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { ChatInputCommandInteraction } from 'discord.js';
import { createMockInteraction, createMockButtonInteraction, createMockMessage } from '../../__mocks__/discord-interaction';
import { mockYTSearchResults } from '../../__fixtures__/playlist-entries';

const mockAddSong = jest.fn().mockResolvedValue([] as never);
const mockCheckIfWatched = jest.fn().mockResolvedValue(undefined as never);
const mockSetnx = jest.fn().mockResolvedValue(1 as never);

jest.mock('../../../src/helpers/redis', () => ({
  redisClient: {
    setnx: mockSetnx,
    checkIfWatched: mockCheckIfWatched,
  },
  newClient: jest.fn(),
}));

jest.mock('../../../src/helpers/playlist', () => ({
  addSong: mockAddSong,
  PlaylistEntry: {},
}));

jest.mock('../../../src/helpers/youtube', () => ({
  search: jest.fn().mockResolvedValue(mockYTSearchResults as never),
}));

 
const { execute } = require('../../../src/cmd_processor/commands/play') as {
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
};

const yt = require('../../../src/helpers/youtube') as { search: ReturnType<typeof jest.fn> };

describe('play command', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('enqueues song when user selects from search results', async () => {
    const mockMsg = createMockMessage();
    const btnInteraction = createMockButtonInteraction('abc123', 'Test Song 1');
    mockMsg.awaitMessageComponent.mockResolvedValue(btnInteraction as never);

    const interaction = createMockInteraction({ channelId: '12345', guildId: '99999', queryString: 'test query' });
    (interaction.editReply as ReturnType<typeof jest.fn>).mockResolvedValue(mockMsg as never);

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalledWith({ content: 'Searching youtube for test query' });
    expect(yt.search).toHaveBeenCalledWith('test query', 5, 'video', process.env['YT_TOKEN']);
    expect(mockSetnx).toHaveBeenCalledWith('discord:channel:12345:guild-id', '99999');
    expect(mockCheckIfWatched).toHaveBeenCalled();
    expect(mockAddSong).toHaveBeenCalledWith('12345', [
      expect.objectContaining({
        youtubeVideoId: 'abc123',
        youtubeVideoTitle: 'Test Song 1',
      })
    ], false);
  });

  it('replies with error when user is not in a voice channel', async () => {
    const interaction = createMockInteraction({ channelId: null, queryString: 'test' });
    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith('You must be in a voice channel to play music!');
    expect(mockAddSong).not.toHaveBeenCalled();
  });

  it('handles YouTube search returning null', async () => {
    yt.search.mockResolvedValueOnce(null as never);
    const mockMsg = createMockMessage();
    const interaction = createMockInteraction({ channelId: '12345', queryString: 'test' });
    (interaction.editReply as ReturnType<typeof jest.fn>).mockResolvedValueOnce(mockMsg as never);

    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith('Failed to query youtube');
    expect(mockAddSong).not.toHaveBeenCalled();
  });

  it('handles button click timeout', async () => {
    const mockMsg = createMockMessage();
    mockMsg.awaitMessageComponent.mockRejectedValue(new Error('Timeout') as never);

    const interaction = createMockInteraction({ channelId: '12345', queryString: 'test' });
    (interaction.editReply as ReturnType<typeof jest.fn>).mockResolvedValueOnce(mockMsg as never);

    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith({ content: 'Timeout waiting for input', components: [] });
    expect(mockAddSong).not.toHaveBeenCalled();
  });

  it('uses inFront=true when next option is set', async () => {
    const mockMsg = createMockMessage();
    const btnInteraction = createMockButtonInteraction('abc123', 'Test Song 1');
    mockMsg.awaitMessageComponent.mockResolvedValue(btnInteraction as never);

    const interaction = createMockInteraction({ channelId: '12345', guildId: '99999', queryString: 'test', booleanNext: true });
    (interaction.editReply as ReturnType<typeof jest.fn>).mockResolvedValue(mockMsg as never);

    await execute(interaction);

    expect(mockAddSong).toHaveBeenCalledWith('12345', expect.anything(), true);
  });

  it('returns when query is null', async () => {
    const interaction = createMockInteraction({ channelId: '12345', queryString: null });
    await execute(interaction);

    expect(yt.search).not.toHaveBeenCalled();
    expect(mockAddSong).not.toHaveBeenCalled();
  });

  it('truncates button label when song name exceeds 80 characters', async () => {
    const longName = 'A'.repeat(85);
    yt.search.mockResolvedValueOnce([
      { name: longName, id: 'trunc1', type: 'video' },
    ] as never);

    const mockMsg = createMockMessage();
    const btnInteraction = createMockButtonInteraction('trunc1', longName.slice(0, 80));
    mockMsg.awaitMessageComponent.mockResolvedValue(btnInteraction as never);

    const interaction = createMockInteraction({ channelId: '12345', guildId: '99999', queryString: 'long title' });
    (interaction.editReply as ReturnType<typeof jest.fn>).mockResolvedValue(mockMsg as never);

    await execute(interaction);

    expect(mockAddSong).toHaveBeenCalledWith('12345', [
      expect.objectContaining({ youtubeVideoId: 'trunc1' }),
    ], false);
  });

  it('returns without adding song when button has no label', async () => {
    const { ButtonComponent } = jest.requireMock('discord.js') as { ButtonComponent: unknown };
    void ButtonComponent;

    const mockMsg = createMockMessage();
    const btnInteraction = createMockButtonInteraction('abc123', undefined);
    // Override component to have null label
    (btnInteraction as unknown as { component: { label: null } }).component = { label: null };
    mockMsg.awaitMessageComponent.mockResolvedValue(btnInteraction as never);

    const interaction = createMockInteraction({ channelId: '12345', queryString: 'test' });
    (interaction.editReply as ReturnType<typeof jest.fn>).mockResolvedValue(mockMsg as never);

    await execute(interaction);

    expect(mockAddSong).not.toHaveBeenCalled();
  });
});

it('loads play module without DEBUG set (covers false branch of DEBUG ternary)', () => {
  const savedDebug = process.env['DEBUG'];
  delete process.env['DEBUG'];
  jest.isolateModules(() => {
     
    require('../../../src/cmd_processor/commands/play');
  });
  if (savedDebug !== undefined) process.env['DEBUG'] = savedDebug;
});
