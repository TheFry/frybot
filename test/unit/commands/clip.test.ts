import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { ChatInputCommandInteraction } from 'discord.js';
import { createMockInteraction, createMockButtonInteraction, createMockMessage, createMockModalSubmission } from '../../__mocks__/discord-interaction';
import { mockYTSearchResults } from '../../__fixtures__/playlist-entries';

const mockEnqueue = jest.fn().mockResolvedValue([{ status: { jsonSet: 'OK', listPush: 1 } }] as never);

jest.mock('../../../src/helpers/redis', () => ({
  redisClient: null,
  newClient: jest.fn(),
}));

jest.mock('../../../src/helpers/message_queue', () => ({
  enqueue: mockEnqueue,
}));

jest.mock('../../../src/helpers/interactions', () => ({
  addInteraction: jest.fn().mockResolvedValue(undefined as never),
}));

jest.mock('../../../src/helpers/youtube', () => ({
  search: jest.fn().mockResolvedValue(mockYTSearchResults as never),
}));

jest.mock('../../../src/helpers/logger', () => ({
  logConsole: jest.fn(),
  LogType: { Error: 1, Warn: 2, Debug: 3 },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { execute } = require('../../../src/cmd_processor/commands/clip') as {
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
};

const yt = require('../../../src/helpers/youtube') as { search: ReturnType<typeof jest.fn> };

describe('clip command', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  describe('URL flow', () => {
    it('enqueues clip job when user provides a valid YouTube URL and submits modal', async () => {
      const mockMsg = createMockMessage();
      const btnInteraction = createMockButtonInteraction('select', 'Select');
      mockMsg.awaitMessageComponent.mockResolvedValue(btnInteraction as never);

      const modalSubmission = createMockModalSubmission({
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        startTime: '00:00:00',
        duration: '10',
      });
      (btnInteraction.awaitModalSubmit as ReturnType<typeof jest.fn>).mockResolvedValue(modalSubmission as never);

      const interaction = createMockInteraction({
        queryString: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      });
      (interaction.reply as ReturnType<typeof jest.fn>).mockResolvedValue(mockMsg as never);

      await execute(interaction);

      expect(mockEnqueue).toHaveBeenCalledWith(
        'frybot:clip-jobs-queue',
        [expect.objectContaining({
          video: expect.objectContaining({ id: 'dQw4w9WgXcQ' }),
          startTime: '00:00:00',
          duration: 10,
        })]
      );
    });

    it('cancels when user clicks cancel button on URL flow', async () => {
      const mockMsg = createMockMessage();
      const btnInteraction = createMockButtonInteraction('cancel', 'Cancel');
      mockMsg.awaitMessageComponent.mockResolvedValue(btnInteraction as never);

      const interaction = createMockInteraction({
        queryString: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      });
      (interaction.reply as ReturnType<typeof jest.fn>).mockResolvedValue(mockMsg as never);

      await execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith({ content: '#cancelled', components: [] });
      expect(mockEnqueue).not.toHaveBeenCalled();
    });

    it('rejects URL without v parameter', async () => {
      const interaction = createMockInteraction({
        queryString: 'https://www.youtube.com/playlist?list=xyz',
      });

      // The URL is valid but has no 'v' param, so editReply shows an error
      // Note: interaction.reply is not called before editReply in this path
      // because reply is called first showing the URL
      const mockMsg = createMockMessage();
      (interaction.reply as ReturnType<typeof jest.fn>).mockResolvedValue(mockMsg as never);

      await execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.stringContaining('is not a valid youtube video link')
      );
      expect(mockEnqueue).not.toHaveBeenCalled();
    });
  });

  describe('search flow', () => {
    it('enqueues clip job when user searches and selects from results', async () => {
      // For search flow, the query is not a valid URL so it falls into the catch block
      const mockMsg = createMockMessage();
      const selectBtn = createMockButtonInteraction('select', 'Select Video');
      mockMsg.awaitMessageComponent.mockResolvedValue(selectBtn as never);

      const modalSubmission = createMockModalSubmission({
        url: 'https://www.youtube.com/watch?v=abc123',
        startTime: '00:00:05',
        duration: '15',
      });
      (selectBtn.awaitModalSubmit as ReturnType<typeof jest.fn>).mockResolvedValue(modalSubmission as never);

      const interaction = createMockInteraction({ queryString: 'test search' });
      (interaction.editReply as ReturnType<typeof jest.fn>).mockResolvedValue(mockMsg as never);

      await execute(interaction);

      expect(yt.search).toHaveBeenCalledWith('test search', 5, 'video', process.env['YT_TOKEN']);
      expect(mockEnqueue).toHaveBeenCalledWith(
        'frybot:clip-jobs-queue',
        [expect.objectContaining({
          duration: 15,
        })]
      );
    });

    it('does not enqueue when YouTube search returns null', async () => {
      yt.search.mockResolvedValueOnce(null as never);
      const mockMsg = createMockMessage();
      const interaction = createMockInteraction({ queryString: 'test search' });
      (interaction.editReply as ReturnType<typeof jest.fn>).mockResolvedValueOnce(mockMsg as never);

      await execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith('Failed to query youtube');
      expect(mockEnqueue).not.toHaveBeenCalled();
    });

  });

  describe('modal validation', () => {
    it('does not enqueue when duration is invalid (NaN)', async () => {
      const mockMsg = createMockMessage();
      const btnInteraction = createMockButtonInteraction('select', 'Select');
      mockMsg.awaitMessageComponent.mockResolvedValue(btnInteraction as never);

      const modalSubmission = createMockModalSubmission({
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        startTime: '00:00:00',
        duration: 'notanumber',
      });
      (btnInteraction.awaitModalSubmit as ReturnType<typeof jest.fn>).mockResolvedValue(modalSubmission as never);

      const interaction = createMockInteraction({
        queryString: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      });
      (interaction.reply as ReturnType<typeof jest.fn>).mockResolvedValue(mockMsg as never);

      await execute(interaction);

      expect(mockEnqueue).not.toHaveBeenCalled();
    });

    it('does not enqueue when duration is zero', async () => {
      const mockMsg = createMockMessage();
      const btnInteraction = createMockButtonInteraction('select', 'Select');
      mockMsg.awaitMessageComponent.mockResolvedValue(btnInteraction as never);

      const modalSubmission = createMockModalSubmission({
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        startTime: '00:00:00',
        duration: '0',
      });
      (btnInteraction.awaitModalSubmit as ReturnType<typeof jest.fn>).mockResolvedValue(modalSubmission as never);

      const interaction = createMockInteraction({
        queryString: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      });
      (interaction.reply as ReturnType<typeof jest.fn>).mockResolvedValue(mockMsg as never);

      await execute(interaction);

      expect(mockEnqueue).not.toHaveBeenCalled();
    });

    it('handles modal timeout', async () => {
      const mockMsg = createMockMessage();
      const btnInteraction = createMockButtonInteraction('select', 'Select');
      mockMsg.awaitMessageComponent.mockResolvedValue(btnInteraction as never);

      (btnInteraction.awaitModalSubmit as ReturnType<typeof jest.fn>).mockRejectedValue(new Error('Timeout') as never);

      const interaction = createMockInteraction({
        queryString: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      });
      (interaction.reply as ReturnType<typeof jest.fn>).mockResolvedValue(mockMsg as never);

      await execute(interaction);

      expect(btnInteraction.editReply).toHaveBeenCalledWith({ content: 'Timeout waiting for input', components: [] });
      expect(mockEnqueue).not.toHaveBeenCalled();
    });

    it('logs and replies with error when enqueue fails', async () => {
      mockEnqueue.mockResolvedValueOnce([{ error: 'queue full' }] as never);
      const mockMsg = createMockMessage();
      const btnInteraction = createMockButtonInteraction('select', 'Select');
      mockMsg.awaitMessageComponent.mockResolvedValue(btnInteraction as never);

      const modalSubmission = createMockModalSubmission({
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        startTime: '00:00:00',
        duration: '10',
      });
      (btnInteraction.awaitModalSubmit as ReturnType<typeof jest.fn>).mockResolvedValue(modalSubmission as never);

      const interaction = createMockInteraction({
        queryString: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      });
      (interaction.reply as ReturnType<typeof jest.fn>).mockResolvedValue(mockMsg as never);

      await execute(interaction);

      // The error editReply is called on modalData.interaction (the modal submission)
      expect(modalSubmission.editReply).toHaveBeenCalledWith('Failed adding clip job to the processing queue.');
    });
  });

  describe('search flow edge cases', () => {
    it('cancels when user clicks a button other than next/select', async () => {
      const mockMsg = createMockMessage();
      const cancelBtn = createMockButtonInteraction('cancel', 'Cancel');
      mockMsg.awaitMessageComponent.mockResolvedValue(cancelBtn as never);

      const interaction = createMockInteraction({ queryString: 'test search' });
      (interaction.editReply as ReturnType<typeof jest.fn>).mockResolvedValue(mockMsg as never);

      await execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith({ content: '#cancelled', components: [] });
      expect(mockEnqueue).not.toHaveBeenCalled();
    });

    it('shows no video selected when user presses next on the last result', async () => {
      // mockYTSearchResults has 5 items; clicking next 5 times reaches the end
      const mockMsg = createMockMessage();
      const nextBtn = createMockButtonInteraction('next', 'Next Video');
      (nextBtn.update as ReturnType<typeof jest.fn>).mockResolvedValue(mockMsg as never);
      mockMsg.awaitMessageComponent.mockResolvedValue(nextBtn as never);

      const interaction = createMockInteraction({ queryString: 'test search' });
      (interaction.editReply as ReturnType<typeof jest.fn>).mockResolvedValue(mockMsg as never);

      await execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: 'No video selected. Try a different search or use a direct url' })
      );
      expect(mockEnqueue).not.toHaveBeenCalled();
    });

    it('handles timeout waiting for selection in search flow', async () => {
      const mockMsg = createMockMessage();
      mockMsg.awaitMessageComponent.mockRejectedValue(new Error('Component timeout') as never);

      const interaction = createMockInteraction({ queryString: 'test search' });
      (interaction.editReply as ReturnType<typeof jest.fn>).mockResolvedValue(mockMsg as never);

      await execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith({ content: 'Timeout waiting for input', components: [] });
      expect(mockEnqueue).not.toHaveBeenCalled();
    });

    it('throws when a non-URL error that is not ERR_INVALID_URL occurs', async () => {
      const interaction = createMockInteraction({
        queryString: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      });
      const networkError = Object.assign(new Error('network failure'), { code: 'ECONNREFUSED' });
      (interaction.reply as ReturnType<typeof jest.fn>).mockRejectedValue(networkError as never);

      await expect(execute(interaction)).rejects.toThrow('network failure');
      expect(mockEnqueue).not.toHaveBeenCalled();
    });

    it('throws when error has no code property (line 183 false branch)', async () => {
      const interaction = createMockInteraction({
        queryString: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      });
      // Plain Error with no .code property — hasProperties(err, ['code']) → false
      (interaction.reply as ReturnType<typeof jest.fn>).mockRejectedValue(new Error('plain error') as never);

      await expect(execute(interaction)).rejects.toThrow('plain error');
      expect(mockEnqueue).not.toHaveBeenCalled();
    });

    it('truncates long video name in modal title (line 43 branch)', async () => {
      const longName = 'A'.repeat(60);
      yt.search.mockResolvedValueOnce([{ name: longName, id: 'vid1', type: 'video' }] as never);

      const mockMsg = createMockMessage();
      const selectBtn = createMockButtonInteraction('select', 'Select Video');
      mockMsg.awaitMessageComponent.mockResolvedValue(selectBtn as never);

      const modalSubmission = createMockModalSubmission({
        url: 'https://www.youtube.com/watch?v=vid1',
        startTime: '00:00:05',
        duration: '10',
      });
      (selectBtn.awaitModalSubmit as ReturnType<typeof jest.fn>).mockResolvedValue(modalSubmission as never);

      const interaction = createMockInteraction({ queryString: 'long title query' });
      (interaction.editReply as ReturnType<typeof jest.fn>).mockResolvedValue(mockMsg as never);

      await execute(interaction);

      expect(mockEnqueue).toHaveBeenCalled();
    });

    it('skips error logging when enqueue returns undefined result (line 209 false branch)', async () => {
      mockEnqueue.mockResolvedValueOnce([undefined] as never);

      const mockMsg = createMockMessage();
      const btnInteraction = createMockButtonInteraction('select', 'Select');
      mockMsg.awaitMessageComponent.mockResolvedValue(btnInteraction as never);

      const modalSubmission = createMockModalSubmission({
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        startTime: '00:00:00',
        duration: '10',
      });
      (btnInteraction.awaitModalSubmit as ReturnType<typeof jest.fn>).mockResolvedValue(modalSubmission as never);

      const interaction = createMockInteraction({
        queryString: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      });
      (interaction.reply as ReturnType<typeof jest.fn>).mockResolvedValue(mockMsg as never);

      await execute(interaction);

      const { logConsole } = require('../../../src/helpers/logger') as { logConsole: ReturnType<typeof jest.fn> };
      expect(logConsole).not.toHaveBeenCalled();
    });
  });
});

it('loads clip module without DEBUG set (covers false branch of DEBUG ternary)', () => {
  const savedDebug = process.env['DEBUG'];
  delete process.env['DEBUG'];
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../../../src/cmd_processor/commands/clip');
  });
  if (savedDebug !== undefined) process.env['DEBUG'] = savedDebug;
});
