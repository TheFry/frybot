import { describe, expect, it, jest, beforeEach } from '@jest/globals';

const mockEnqueue = jest.fn();
const mockLlen = jest.fn();
const mockRpop = jest.fn();
const mockMultiExec = jest.fn();
const mockMulti = jest.fn();
const mockDuplicate = jest.fn();
const mockBrpop = jest.fn();
const mockDisconnect = jest.fn();

jest.mock('../../../src/helpers/redis', () => ({
  redisClient: {
    enqueue: mockEnqueue,
    llen: mockLlen,
    rpop: mockRpop,
    multi: mockMulti,
    duplicate: mockDuplicate,
  },
  newClient: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { enqueue, dequeue } = require('../../../src/helpers/message_queue') as typeof import('../../../src/helpers/message_queue');

describe('message_queue unit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMulti.mockReturnValue({ call: jest.fn().mockReturnThis(), del: jest.fn().mockReturnThis(), exec: mockMultiExec });
  });

  describe('enqueue', () => {
    it('returns success response on enqueue', async () => {
      mockEnqueue.mockResolvedValue(['OK', 1] as never);
      const result = await enqueue('q', [{ data: 1 }]);
      expect(result[0].error).toBeUndefined();
      expect(result[0].status?.jsonSet).toBe('OK');
    });

    it('returns error response when enqueue command throws', async () => {
      mockEnqueue.mockRejectedValue(new Error('redis error') as never);
      const result = await enqueue('q', [{ data: 1 }]);
      expect(result[0].error).toContain('redis error');
    });

    it('returns error response when enqueue returns null/falsy', async () => {
      mockEnqueue.mockResolvedValue(null as never);
      const result = await enqueue('q', [{ data: 1 }]);
      expect(result[0].error).toContain('Enqueue Error');
    });

    it('handles multiple messages', async () => {
      mockEnqueue.mockResolvedValue(['OK', 1] as never);
      const result = await enqueue('q', [{ a: 1 }, { b: 2 }]);
      expect(result).toHaveLength(2);
      expect(result[0].error).toBeUndefined();
      expect(result[1].error).toBeUndefined();
    });
  });

  describe('dequeue', () => {
    it('returns empty array when queue is empty (rpop returns null)', async () => {
      mockRpop.mockResolvedValue(null as never);
      const result = await dequeue('q', 1);
      expect(result).toHaveLength(0);
    });

    it('returns error response when rpop throws', async () => {
      mockRpop.mockRejectedValue(new Error('rpop error') as never);
      const result = await dequeue('q', 1);
      expect(result[0].error).toContain('rpop error');
    });

    it('returns error response when multi/exec throws', async () => {
      mockRpop.mockResolvedValue('some-uuid' as never);
      mockMultiExec.mockRejectedValue(new Error('exec error') as never);
      const result = await dequeue('q', 1);
      expect(result[0].error).toContain('exec error');
    });

    it('returns error when exec returns null', async () => {
      mockRpop.mockResolvedValue('some-uuid' as never);
      mockMultiExec.mockResolvedValue(null as never);
      const result = await dequeue('q', 1);
      expect(result[0].error).toContain('Dequeue Error');
    });

    it('dequeues with count=-1 using llen', async () => {
      mockLlen.mockResolvedValue(0 as never);
      const result = await dequeue('q', -1);
      expect(mockLlen).toHaveBeenCalledWith('q');
      expect(result).toHaveLength(0);
    });

    it('returns count=0 when llen throws', async () => {
      mockLlen.mockRejectedValue(new Error('llen error') as never);
      const result = await dequeue('q', -1);
      expect(result).toHaveLength(0);
    });

    it('uses brpop when timeout is provided', async () => {
      mockDuplicate.mockResolvedValue({
        brpop: mockBrpop,
        disconnect: mockDisconnect,
      } as never);
      mockBrpop.mockResolvedValue(['q', 'uuid-1'] as never);
      mockMultiExec.mockResolvedValue([
        [null, JSON.stringify({ hello: 'world' })],
        [null, 1],
      ] as never);

      const result = await dequeue('q', 1, 5);
      expect(mockBrpop).toHaveBeenCalledWith('q', 5);
      expect(result[0].message).toEqual({ hello: 'world' });
    });

    it('returns empty when brpop times out (returns null)', async () => {
      mockDuplicate.mockResolvedValue({
        brpop: mockBrpop,
        disconnect: mockDisconnect,
      } as never);
      mockBrpop.mockResolvedValue(null as never);
      const result = await dequeue('q', 1, 5);
      expect(result).toHaveLength(0);
    });

    it('includes jsonErr in error string when exec returns json error', async () => {
      mockRpop.mockResolvedValue('uuid-1' as never);
      mockMultiExec.mockResolvedValue([
        [new Error('json get failed'), null],
        [null, 1],
      ] as never);
      const result = await dequeue('q', 1);
      expect(result[0].error).toContain('JSON.GET error');
    });

    it('includes delErr in error string when exec returns del error', async () => {
      mockRpop.mockResolvedValue('uuid-1' as never);
      mockMultiExec.mockResolvedValue([
        [null, JSON.stringify({ test: 1 })],
        [new Error('del failed'), 1],
      ] as never);
      const result = await dequeue('q', 1);
      expect(result[0].error).toContain('del error');
    });

    it('includes both errorString and parseError when both occur', async () => {
      mockRpop.mockResolvedValue('uuid-1' as never);
      mockMultiExec.mockResolvedValue([
        [new Error('json get failed'), 'not-valid-json{{{'],
        [new Error('del failed'), 1],
      ] as never);
      const result = await dequeue('q', 1);
      expect(result[0].error).toContain('JSON.GET error');
      expect(result[0].error).toContain('JSON parse error');
    });
  });
});
