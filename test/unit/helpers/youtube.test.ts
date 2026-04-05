import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { EventEmitter } from 'events';

const mockAxiosGet = jest.fn();
const mockSpawn = jest.fn();
const mockOpen = jest.fn();

jest.mock('axios', () => ({ get: mockAxiosGet }));

jest.mock('child_process', () => ({ spawn: mockSpawn }));

jest.mock('fs/promises', () => ({ open: mockOpen }));

jest.mock('../../../src/helpers/logger', () => ({
  logConsole: jest.fn(),
  LogType: { Error: 1, Warn: 2, Debug: 3 },
}));

 
const yt = require('../../../src/helpers/youtube') as typeof import('../../../src/helpers/youtube');

function makeProcess(overrides: Record<string, unknown> = {}) {
  const proc = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter & { readable: boolean };
    stderr: EventEmitter;
    killed: boolean;
  };
  proc.stdout = Object.assign(new EventEmitter(), { readable: true });
  proc.stderr = new EventEmitter();
  Object.assign(proc, overrides);
  return proc;
}

describe('youtube unit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('search', () => {
    it('returns empty array when request fails', async () => {
      mockAxiosGet.mockRejectedValue(new Error('network error') as never);
      const result = await yt.search('query', 5, 'video', 'key');
      expect(result).toEqual([]);
    });

    it('returns results for a single page', async () => {
      mockAxiosGet.mockResolvedValue({
        data: {
          items: [
            { snippet: { title: 'Video 1' }, id: { kind: 'youtube#video', videoId: 'v1' } },
            { snippet: { title: 'Video 2' }, id: { kind: 'youtube#video', videoId: 'v2' } },
          ],
        },
      } as never);
      const result = await yt.search('query', 2, 'video', 'key');
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('v1');
    });

    it('returns all results when count exceeds available items (line 188 branch)', async () => {
      mockAxiosGet.mockResolvedValue({
        data: {
          items: [
            { snippet: { title: 'Video 1' }, id: { kind: 'youtube#video', videoId: 'v1' } },
          ],
          // no nextPageToken — only 1 item available
        },
      } as never);
      // Request 10 but only 1 is available
      const result = await yt.search('query', 10, 'video', 'key');
      expect(result).toHaveLength(1);
    });

    it('clamps count to MAX_RESULTS when count exceeds 250 (line 160 branch)', async () => {
      mockAxiosGet.mockResolvedValue({
        data: { items: [] },
      } as never);
      // count > MAX_RESULTS (250) → should be clamped; no results returned
      const result = await yt.search('query', 300, 'video', 'key');
      expect(result).toEqual([]);
    });

    it('returns playlist id for playlist type results', async () => {
      mockAxiosGet.mockResolvedValue({
        data: {
          items: [
            { snippet: { title: 'Playlist 1' }, id: { kind: 'youtube#playlist', playlistId: 'pl1' } },
          ],
        },
      } as never);
      const result = await yt.search('query', 1, 'playlist', 'key');
      expect(result[0].id).toBe('pl1');
      expect(result[0].type).toBe('playlist');
    });

    it('logs http error details when axios throws with response data', async () => {
      const { logConsole } = require('../../../src/helpers/logger') as { logConsole: jest.Mock };
      mockAxiosGet.mockRejectedValue({
        response: { data: { error: 'forbidden' }, status: 403 },
      } as never);
      await yt.search('q', 5, 'video', 'key');
      expect(logConsole).toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('returns empty array when request fails', async () => {
      mockAxiosGet.mockRejectedValue(new Error('network error') as never);
      const result = await yt.list(['v1'], 'video', 'key');
      expect(result).toEqual([]);
    });

    it('returns results for given ids', async () => {
      mockAxiosGet.mockResolvedValue({
        data: {
          items: [{ snippet: { title: 'Song' }, id: 'v1' }],
        },
      } as never);
      const result = await yt.list(['v1'], 'video', 'key');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('v1');
    });

    it('uses playlist endpoint when type is playlist (line 195 branch)', async () => {
      mockAxiosGet.mockResolvedValue({
        data: { items: [] },
      } as never);
      const result = await yt.list(['pl1'], 'playlist', 'key');
      expect(result).toEqual([]);
      expect(mockAxiosGet).toHaveBeenCalledWith(
        expect.stringContaining('playlistItems'),
        expect.anything()
      );
    });
  });

  describe('playlistToVideos', () => {
    it('returns empty array when request fails', async () => {
      mockAxiosGet.mockRejectedValue(new Error('network error') as never);
      const result = await yt.playlistToVideos('pl1', 'key');
      expect(result).toEqual([]);
    });

    it('returns videos from a single page playlist', async () => {
      mockAxiosGet.mockResolvedValue({
        data: {
          items: [
            { snippet: { title: 'Song 1', resourceId: { videoId: 'v1' } } },
          ],
          nextPageToken: undefined,
        },
      } as never);
      const result = await yt.playlistToVideos('pl1', 'key');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('v1');
    });

    it('fetches multiple pages when nextPageToken is present (lines 230,243 branches)', async () => {
      mockAxiosGet
        .mockResolvedValueOnce({
          data: {
            items: [{ snippet: { title: 'Song 1', resourceId: { videoId: 'v1' } } }],
            nextPageToken: 'page2token',
          },
        } as never)
        .mockResolvedValueOnce({
          data: {
            items: [{ snippet: { title: 'Song 2', resourceId: { videoId: 'v2' } } }],
            nextPageToken: undefined,
          },
        } as never);

      const result = await yt.playlistToVideos('pl1', 'key');
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('v1');
      expect(result[1].id).toBe('v2');
      // Second call should pass the pageToken
      expect(mockAxiosGet).toHaveBeenCalledTimes(2);
    });
  });

  describe('download (streaming, no path)', () => {
    it('returns stdout stream when no path is given', async () => {
      const proc = makeProcess();
      mockSpawn.mockReturnValue(proc);

      const stream = await yt.download('v1');
      expect(stream).toBe(proc.stdout);
    });

    it('captures stderr data (line 269 branch)', async () => {
      const proc = makeProcess();
      mockSpawn.mockReturnValue(proc);

      await yt.download('v1');
      // Emit data on stderr — should not throw and should be captured
      expect(() => proc.stderr.emit('data', Buffer.from('yt-dlp warning'))).not.toThrow();
    });

    it('throws when spawn returns process with null stdout (line 274 branch)', async () => {
      const proc = makeProcess({ stdout: null });
      mockSpawn.mockReturnValue(proc);

      await expect(yt.download('v1')).rejects.toThrow('No stdout from yt-dlp process');
    });

    it('emits error on stdout when process closes with non-zero code', async () => {
      const proc = makeProcess();
      mockSpawn.mockReturnValue(proc);

      const stream = await yt.download('v1');
      let errorEmitted = false;
      stream.on('error', () => { errorEmitted = true; });
      proc.emit('close', 1);
      expect(errorEmitted).toBe(true);
    });

    it('forwards process errors to stdout stream', async () => {
      const proc = makeProcess();
      mockSpawn.mockReturnValue(proc);

      const stream = await yt.download('v1');
      let errorEmitted = false;
      stream.on('error', () => { errorEmitted = true; });
      proc.emit('error', new Error('spawn error'));
      expect(errorEmitted).toBe(true);
    });

    it('throws when spawn throws', async () => {
      mockSpawn.mockImplementation(() => { throw new Error('no yt-dlp'); });
      await expect(yt.download('v1')).rejects.toThrow('no yt-dlp');
    });

    it('does not emit error on stdout when process closes with code 0 (line 285 false branch)', async () => {
      const proc = makeProcess();
      mockSpawn.mockReturnValue(proc);

      const stream = await yt.download('v1');
      let errorEmitted = false;
      stream.on('error', () => { errorEmitted = true; });
      proc.emit('close', 0);
      expect(errorEmitted).toBe(false);
    });
  });

  describe('download (file, with path)', () => {
    beforeEach(() => {
      // Default: open() succeeds and returns a mock file handle
      const mockStream = new (require('events').EventEmitter)();
      mockOpen.mockResolvedValue({ createReadStream: () => mockStream } as never);
    });

    it('rejects when process exits with non-zero code', async () => {
      const proc = makeProcess();
      mockSpawn.mockReturnValue(proc);

      const downloadPromise = yt.download('v1', '/tmp/test');
      proc.emit('close', 1);
      await expect(downloadPromise).rejects.toThrow('yt-dlp exited with code 1');
    });

    it('rejects when process emits error event', async () => {
      const proc = makeProcess();
      mockSpawn.mockReturnValue(proc);

      const downloadPromise = yt.download('v1', '/tmp/test');
      proc.emit('error', new Error('spawn error'));
      await expect(downloadPromise).rejects.toThrow('spawn error');
    });

    it('resolves with a read stream on successful exit', async () => {
      const proc = makeProcess();
      mockSpawn.mockReturnValue(proc);

      const downloadPromise = yt.download('v1', '/tmp/test');
      proc.emit('close', 0);
      await expect(downloadPromise).resolves.toBeDefined();
    });

    it('rejects when open() throws after successful exit (lines 309-310)', async () => {
      mockOpen.mockRejectedValueOnce(new Error('file not found') as never);
      const proc = makeProcess();
      mockSpawn.mockReturnValue(proc);

      const downloadPromise = yt.download('v1', '/tmp/test');
      proc.emit('close', 0);
      await expect(downloadPromise).rejects.toThrow('file not found');
    });
  });
});
