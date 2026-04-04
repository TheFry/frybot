import { describe, expect, it, jest, beforeEach } from '@jest/globals';

const mockEnqueue = jest.fn();
const mockDequeue = jest.fn();
const mockRedisGet = jest.fn();

jest.mock('../../../src/helpers/message_queue', () => ({
  enqueue: mockEnqueue,
  dequeue: mockDequeue,
}));

jest.mock('../../../src/helpers/redis', () => ({
  redisClient: { get: mockRedisGet },
  newClient: jest.fn(),
}));

jest.mock('../../../src/helpers/logger', () => ({
  logConsole: jest.fn(),
  LogType: { Error: 1, Warn: 2, Debug: 3 },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { addSong, getSong, getBotId } = require('../../../src/helpers/playlist') as typeof import('../../../src/helpers/playlist');

describe('playlist', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('addSong', () => {
    it('returns empty array on successful enqueue', async () => {
      mockEnqueue.mockResolvedValue([{
        message: { youtubeVideoId: 'v1', youtubeVideoTitle: 'Song', interactionId: 'i1' },
        status: { jsonSet: 'OK', listPush: 1 },
      }] as never);
      const result = await addSong('ch-1', [{ youtubeVideoId: 'v1', youtubeVideoTitle: 'Song', interactionId: 'i1' }]);
      expect(result).toHaveLength(0);
    });

    it('returns error response when enqueue status is bad', async () => {
      mockEnqueue.mockResolvedValue([{
        message: { youtubeVideoId: 'v1', youtubeVideoTitle: 'Fail Song', interactionId: 'i1' },
        status: { jsonSet: 'ERR', listPush: 0 },
      }] as never);
      const result = await addSong('ch-1', [{ youtubeVideoId: 'v1', youtubeVideoTitle: 'Fail Song', interactionId: 'i1' }]);
      expect(result).toHaveLength(1);
      expect(result[0].content).toContain('Fail Song');
    });

    it('returns error response when status is missing', async () => {
      mockEnqueue.mockResolvedValue([{
        message: { youtubeVideoId: 'v1', youtubeVideoTitle: 'No Status', interactionId: 'i1' },
      }] as never);
      const result = await addSong('ch-1', [{ youtubeVideoId: 'v1', youtubeVideoTitle: 'No Status', interactionId: 'i1' }]);
      expect(result).toHaveLength(1);
    });

    it('enqueues inFront=true when specified', async () => {
      mockEnqueue.mockResolvedValue([{
        message: { youtubeVideoId: 'v1', youtubeVideoTitle: 'Song', interactionId: 'i1' },
        status: { jsonSet: 'OK', listPush: 1 },
      }] as never);
      await addSong('ch-1', [{ youtubeVideoId: 'v1', youtubeVideoTitle: 'Song', interactionId: 'i1' }], true);
      expect(mockEnqueue).toHaveBeenCalledWith(expect.any(String), expect.any(Array), true);
    });
  });

  describe('getSong', () => {
    it('returns undefined when dequeue returns empty', async () => {
      mockDequeue.mockResolvedValue([] as never);
      const result = await getSong('ch-1');
      expect(result).toBeUndefined();
    });

    it('returns undefined and logs when dequeue returns an error', async () => {
      mockDequeue.mockResolvedValue([{ error: 'redis error' }] as never);
      const result = await getSong('ch-1');
      expect(result).toBeUndefined();
    });

    it('returns undefined and logs when message is missing required properties', async () => {
      mockDequeue.mockResolvedValue([{ message: { youtubeVideoId: 'v1' } }] as never);
      const result = await getSong('ch-1');
      expect(result).toBeUndefined();
    });

    it('returns PlaylistEntry when dequeue succeeds', async () => {
      const entry = { youtubeVideoId: 'v1', youtubeVideoTitle: 'Song', interactionId: 'i1' };
      mockDequeue.mockResolvedValue([{ message: entry }] as never);
      const result = await getSong('ch-1');
      expect(result).toEqual(entry);
    });
  });

  describe('getBotId', () => {
    it('returns the bot id from redis', async () => {
      mockRedisGet.mockResolvedValue('bot-1' as never);
      const result = await getBotId('ch-1');
      expect(result).toBe('bot-1');
    });

    it('returns null and logs when redis throws', async () => {
      mockRedisGet.mockRejectedValue(new Error('redis down') as never);
      const result = await getBotId('ch-1');
      expect(result).toBeNull();
    });
  });
});
