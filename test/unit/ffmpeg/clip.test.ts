import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { Readable } from 'stream';
import { ClipJob } from '../../../src/helpers/common';

const mockEnqueue = jest.fn().mockResolvedValue([{}] as never);
const mockRmSync = jest.fn();
const mockDownload = jest.fn();

// Capture the ffmpeg event handlers so we can trigger them in tests
let ffmpegHandlers: Record<string, (...args: unknown[]) => void> = {};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockFfmpegChain: any = {};
mockFfmpegChain.setStartTime = jest.fn().mockReturnValue(mockFfmpegChain);
mockFfmpegChain.setDuration = jest.fn().mockReturnValue(mockFfmpegChain);
mockFfmpegChain.output = jest.fn().mockReturnValue(mockFfmpegChain);
mockFfmpegChain.on = jest.fn().mockImplementation((...args: unknown[]) => {
  ffmpegHandlers[args[0] as string] = args[1] as (...a: unknown[]) => void;
  return mockFfmpegChain;
});
mockFfmpegChain.run = jest.fn();
const mockFfmpeg = jest.fn().mockReturnValue(mockFfmpegChain);

jest.mock('fluent-ffmpeg', () => mockFfmpeg);
jest.mock('../../../src/helpers/message_queue', () => ({
  enqueue: mockEnqueue,
}));
jest.mock('../../../src/helpers/youtube', () => ({
  download: mockDownload,
}));
jest.mock('fs', () => ({
  rmSync: mockRmSync,
  readFileSync: jest.fn(), // needed by redis module if transitively loaded
}));
jest.mock('../../../src/helpers/redis', () => ({
  redisClient: null,
  newClient: jest.fn(),
}));
jest.mock('../../../src/helpers/logger', () => ({
  logConsole: jest.fn(),
  LogType: { Error: 1, Warn: 2, Debug: 3 },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { clip, validateClipJob } = require('../../../src/ffmpeg/clip') as {
  clip: (job: ClipJob) => Promise<void>;
  validateClipJob: (message: unknown) => boolean;
};

const testJob: ClipJob = {
  video: { name: 'Test Video', id: 'abc123', type: 'video' },
  startTime: '00:00:05',
  duration: 10,
  interactionId: '999',
};

describe('clip function', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ffmpegHandlers = {};
    mockDownload.mockResolvedValue(new Readable({ read() { this.push(null); } }) as never);
  });

  it('downloads video and sets up ffmpeg pipeline', async () => {
    await clip(testJob);

    expect(mockDownload).toHaveBeenCalledWith('abc123', expect.any(String));
    expect(mockFfmpeg).toHaveBeenCalled();
    expect(mockFfmpegChain.setStartTime).toHaveBeenCalledWith('00:00:05');
    expect(mockFfmpegChain.setDuration).toHaveBeenCalledWith(10);
    expect(mockFfmpegChain.output).toHaveBeenCalled();
    expect(mockFfmpegChain.run).toHaveBeenCalled();
  });

  it('enqueues success response and cleans up raw file on end', async () => {
    await clip(testJob);

    expect(ffmpegHandlers['end']).toBeDefined();
    await ffmpegHandlers['end']();

    expect(mockEnqueue).toHaveBeenCalledWith(
      'frybot:interaction-queue',
      [expect.objectContaining({
        content: 'Here is your file',
        interactionId: '999',
        files: expect.arrayContaining([expect.stringContaining('.mp3')]),
      })]
    );
    expect(mockRmSync).toHaveBeenCalled();
  });

  it('enqueues error response and cleans up files on error', async () => {
    await clip(testJob);

    expect(ffmpegHandlers['error']).toBeDefined();
    await ffmpegHandlers['error'](new Error('ffmpeg failed'));

    expect(mockEnqueue).toHaveBeenCalledWith(
      'frybot:interaction-queue',
      [expect.objectContaining({
        content: 'Error trimming file.',
        interactionId: '999',
      })]
    );
    // Should attempt to clean up both files
    expect(mockRmSync).toHaveBeenCalledTimes(2);
  });

  it('handles cleanup failure on error without throwing', async () => {
    mockRmSync.mockImplementation(() => { throw new Error('file not found'); });

    await clip(testJob);
    await ffmpegHandlers['error'](new Error('ffmpeg failed'));

    // Should not throw - the catch block swallows cleanup errors
    expect(mockEnqueue).toHaveBeenCalled();
  });

  it('propagates download failure', async () => {
    mockDownload.mockRejectedValue(new Error('download failed') as never);

    await expect(clip(testJob)).rejects.toThrow('download failed');
  });
});

describe('validateClipJob', () => {
  it('returns true for valid clip job', () => {
    expect(validateClipJob(testJob)).toBe(true);
  });

  it('returns false for null', () => {
    expect(validateClipJob(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(validateClipJob(undefined)).toBe(false);
  });

  it('returns false when duration is missing', () => {
    expect(validateClipJob({ ...testJob, duration: 0 })).toBe(false);
  });

  it('returns false when video is missing', () => {
    expect(validateClipJob({ ...testJob, video: null })).toBe(false);
  });

  it('returns false when interactionId is missing', () => {
    expect(validateClipJob({ ...testJob, interactionId: '' })).toBe(false);
  });

  it('returns false when startTime is missing', () => {
    expect(validateClipJob({ ...testJob, startTime: '' })).toBe(false);
  });
});
