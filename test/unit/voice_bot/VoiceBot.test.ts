import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { PlaylistEntry } from '../../../src/helpers/playlist';
import { ChannelEvent } from '../../../src/helpers/common';

const mockGetSong = jest.fn();
const mockAddSong = jest.fn().mockResolvedValue([] as never);
const mockDequeue = jest.fn().mockResolvedValue([] as never);
const mockDownload = jest.fn();
const mockSrem = jest.fn().mockResolvedValue(1 as never);
const mockRpush = jest.fn().mockResolvedValue(1 as never);

jest.mock('../../../src/helpers/redis', () => ({
  redisClient: {
    srem: mockSrem,
    rpush: mockRpush,
  },
  newClient: jest.fn(),
}));

jest.mock('../../../src/helpers/playlist', () => ({
  getSong: mockGetSong,
  addSong: mockAddSong,
  PlaylistEntry: {},
}));

jest.mock('../../../src/helpers/message_queue', () => ({
  dequeue: mockDequeue,
}));

jest.mock('../../../src/helpers/youtube', () => ({
  download: mockDownload,
}));

jest.mock('../../../src/helpers/logger', () => ({
  logConsole: jest.fn(),
  LogType: { Error: 1, Warn: 2, Debug: 3 },
}));

// Mock @discordjs/voice
const mockPlayerStop = jest.fn().mockReturnValue(true);
const mockPlayerPause = jest.fn().mockReturnValue(true);
const mockPlayerUnpause = jest.fn().mockReturnValue(true);
const mockPlayerPlay = jest.fn();
const mockPlayerRemoveAllListeners = jest.fn();
const mockPlayerOn = jest.fn();

jest.mock('@discordjs/voice', () => ({
  createAudioPlayer: jest.fn().mockReturnValue({
    stop: mockPlayerStop,
    pause: mockPlayerPause,
    unpause: mockPlayerUnpause,
    play: mockPlayerPlay,
    on: mockPlayerOn,
    removeAllListeners: mockPlayerRemoveAllListeners,
    state: { status: 'idle' },
  }),
  createAudioResource: jest.fn().mockReturnValue({
    volume: { setVolume: jest.fn() },
  }),
  joinVoiceChannel: jest.fn().mockReturnValue({
    subscribe: jest.fn(),
    destroy: jest.fn(),
  }),
  getVoiceConnection: jest.fn().mockReturnValue(null),
  entersState: jest.fn().mockResolvedValue(undefined as never),
  AudioPlayerStatus: {
    Idle: 'idle',
    Playing: 'playing',
    Paused: 'paused',
    Buffering: 'buffering',
  },
  VoiceConnectionStatus: { Ready: 'ready' },
  NoSubscriberBehavior: { Pause: 'pause' },
}));

// Mock voice_bot/main to prevent top-level side effects
jest.mock('../../../src/voice_bot/main', () => ({
  client: {
    channels: {
      fetch: jest.fn().mockResolvedValue({
        isVoiceBased: jest.fn().mockReturnValue(true),
        name: 'test-channel',
      } as never),
    },
    guilds: {
      fetch: jest.fn().mockResolvedValue({
        voiceAdapterCreator: {},
      } as never),
    },
    application: { id: 'test-bot-id' },
  },
}));

jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(false),
  rmSync: jest.fn(),
}));

 
const { VoiceBot, voicebotList, connectedGuilds } = require('../../../src/voice_bot/VoiceBot') as {
  VoiceBot: typeof import('../../../src/voice_bot/VoiceBot').VoiceBot;
  voicebotList: Record<string, unknown>;
  connectedGuilds: Record<string, boolean>;
};

function createBot(): InstanceType<typeof VoiceBot> {
  const bot = new VoiceBot({
    channelId: 'ch-1',
    channelName: 'test-channel',
    guildId: 'guild-1',
    idleTimeout: 30,
    audioResources: {
      player: {
        stop: mockPlayerStop,
        pause: mockPlayerPause,
        unpause: mockPlayerUnpause,
        play: mockPlayerPlay,
        on: mockPlayerOn,
        removeAllListeners: mockPlayerRemoveAllListeners,
        state: { status: 'idle' },
      },
    } as unknown as ConstructorParameters<typeof VoiceBot>[0]['audioResources'],
    isConnected: true,
  });
  voicebotList['ch-1'] = bot;
  connectedGuilds['guild-1'] = true;
  return bot;
}

const testEntry: PlaylistEntry = {
  youtubeVideoId: 'abc123',
  youtubeVideoTitle: 'Test Song',
  interactionId: '999',
};

describe('VoiceBot', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    for (const k of Object.keys(voicebotList)) delete voicebotList[k];
    for (const k of Object.keys(connectedGuilds)) delete connectedGuilds[k];
  });

  describe('constructor', () => {
    it('initializes with correct defaults', () => {
      const bot = createBot();
      expect(bot.channelId).toBe('ch-1');
      expect(bot.guildId).toBe('guild-1');
      expect(bot.redis_queueKey).toBe('discord:channel:ch-1:queue');
      expect(bot.readyForEvents).toBe(false);
      expect(bot.nowPlaying).toBeNull();
      expect(bot.lastPlayed).toBeNull();
    });

    it('stores isConnected=false when explicitly passed false', () => {
      const bot = new VoiceBot({
        channelId: 'ch-3',
        channelName: 'test',
        guildId: 'guild-3',
        audioResources: (createBot() as unknown as { audioResources: unknown }).audioResources,
        isConnected: false,
      } as unknown as ConstructorParameters<typeof VoiceBot>[0]);
      expect(bot.isConnected).toBe(false);
    });

    it('uses default idleTimeout of 30 when not provided (line 81 || branch)', () => {
      const bot = new VoiceBot({
        channelId: 'ch-2',
        channelName: 'test',
        guildId: 'guild-2',
        // idleTimeout intentionally omitted — hits the || 30 default
        audioResources: (createBot() as unknown as { audioResources: unknown }).audioResources,
        isConnected: true,
      } as unknown as ConstructorParameters<typeof VoiceBot>[0]);
      expect(bot.idleTimeout).toBe(30);
    });
  });

  describe('playNext', () => {
    it('returns immediately when player is already playing and skip=false', async () => {
      const bot = createBot();
      bot.audioResources.player.state = { status: 'playing' } as never;
      await bot.playNext();
      expect(mockGetSong).not.toHaveBeenCalled();
    });

    it('pushes stop event when getSong returns nothing', async () => {
      const bot = createBot();
      mockGetSong.mockResolvedValue(undefined as never);
      await bot.playNext();
      expect(bot.eventList.len).toBe(1);
    });

    it('downloads and plays when getSong returns an entry', async () => {
      const bot = createBot();
      const { Readable } = require('stream');
      const mockStream = new Readable({ read() { this.push(null); } });
      mockGetSong.mockResolvedValue(testEntry as never);
      mockDownload.mockResolvedValue(mockStream as never);

      await bot.playNext();

      expect(mockDownload).toHaveBeenCalledWith('abc123', 'guild-1');
      expect(mockPlayerPlay).toHaveBeenCalled();
      expect(bot.nowPlaying).toEqual(testEntry);
    });

    it('skips song after 3 download failures', async () => {
      const bot = createBot();
      mockGetSong.mockResolvedValue(testEntry as never);
      mockDownload.mockRejectedValue(new Error('download error') as never);

      await bot.playNext();

      expect(mockDownload).toHaveBeenCalledTimes(3);
      expect(mockPlayerPlay).not.toHaveBeenCalled();
    });

    it('sets lastPlayed from nowPlaying', async () => {
      const bot = createBot();
      bot.nowPlaying = testEntry;
      mockGetSong.mockResolvedValue(undefined as never);

      await bot.playNext();

      expect(bot.lastPlayed).toEqual(testEntry);
      expect(bot.nowPlaying).toBeNull();
    });

    it('proceeds with skip when player is playing and skip=true', async () => {
      const bot = createBot();
      bot.audioResources.player.state = { status: 'playing' } as never;
      mockGetSong.mockResolvedValue(undefined as never);
      await bot.playNext(true);
      expect(mockGetSong).toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    it('cleans up and releases channel', async () => {
      const bot = createBot();
      bot.readyForEvents = true;

      await bot.stop();

      expect(bot.readyForEvents).toBe(false);
      expect(mockPlayerStop).toHaveBeenCalled();
      expect(mockDequeue).toHaveBeenCalledWith('discord:channel:ch-1:queue', -1);
      expect(mockSrem).toHaveBeenCalledWith('frybot:reserved-channels', 'ch-1');
      expect(voicebotList['ch-1']).toBeUndefined();
      expect(connectedGuilds['guild-1']).toBeUndefined();
    });
  });

  describe('pause', () => {
    it('pauses when playing', async () => {
      const bot = createBot();
      bot.audioResources.player.state = { status: 'playing' } as never;
      await bot.pause(false);
      expect(mockPlayerPause).toHaveBeenCalled();
    });

    it('unpauses when paused', async () => {
      const bot = createBot();
      bot.audioResources.player.state = { status: 'paused' } as never;
      await bot.pause(true);
      expect(mockPlayerUnpause).toHaveBeenCalled();
    });

    it('does not pause when already paused', async () => {
      const bot = createBot();
      bot.audioResources.player.state = { status: 'paused' } as never;
      await bot.pause(false);
      expect(mockPlayerPause).not.toHaveBeenCalled();
    });
  });

  describe('replay', () => {
    it('re-enqueues nowPlaying with inFront=true', async () => {
      const bot = createBot();
      bot.nowPlaying = testEntry;
      await bot.replay();
      expect(mockAddSong).toHaveBeenCalledWith('ch-1', [testEntry], true);
    });

    it('re-enqueues lastPlayed when nowPlaying is null', async () => {
      const bot = createBot();
      bot.lastPlayed = testEntry;
      await bot.replay();
      expect(mockAddSong).toHaveBeenCalledWith('ch-1', [testEntry], true);
    });

    it('logs error when neither is set', async () => {
      const bot = createBot();
      await bot.replay();
      expect(mockAddSong).not.toHaveBeenCalled();
    });
  });

  describe('processEvents', () => {
    it('routes stop event', async () => {
      const bot = createBot();
      bot.readyForEvents = true;

      const stopEvent: ChannelEvent = { type: 'stop', channelId: 'ch-1' };
      bot.eventList.lpush(stopEvent);

      // processEvents will process the stop event and then exit
      await bot.processEvents();

      expect(bot.readyForEvents).toBe(false);
    });

    it('routes pause event', async () => {
      const bot = createBot();
      bot.readyForEvents = true;
      bot.audioResources.player.state = { status: 'playing' } as never;

      const pauseEvent: ChannelEvent = { type: 'pause', channelId: 'ch-1' };
      bot.eventList.lpush(pauseEvent);

      // Push a stop event to exit the loop
      const stopEvent: ChannelEvent = { type: 'stop', channelId: 'ch-1' };
      bot.eventList.lpush(stopEvent);

      await bot.processEvents();

      expect(mockPlayerPause).toHaveBeenCalled();
    });

    it('routes unpause event', async () => {
      const bot = createBot();
      bot.readyForEvents = true;
      bot.audioResources.player.state = { status: 'paused' } as never;

      const unpauseEvent: ChannelEvent = { type: 'unpause', channelId: 'ch-1' };
      bot.eventList.lpush(unpauseEvent);

      const stopEvent: ChannelEvent = { type: 'stop', channelId: 'ch-1' };
      bot.eventList.lpush(stopEvent);

      await bot.processEvents();

      expect(mockPlayerUnpause).toHaveBeenCalled();
    });

    it('routes skip event', async () => {
      const bot = createBot();
      bot.readyForEvents = true;
      mockGetSong.mockResolvedValue(undefined as never);

      const skipEvent: ChannelEvent = { type: 'skip', channelId: 'ch-1' };
      bot.eventList.lpush(skipEvent);

      const stopEvent: ChannelEvent = { type: 'stop', channelId: 'ch-1' };
      bot.eventList.lpush(stopEvent);

      await bot.processEvents();

      expect(mockGetSong).toHaveBeenCalled();
    });

    it('routes replay event', async () => {
      const bot = createBot();
      bot.readyForEvents = true;
      bot.nowPlaying = testEntry;

      const replayEvent: ChannelEvent = { type: 'replay', channelId: 'ch-1' };
      bot.eventList.lpush(replayEvent);

      const stopEvent: ChannelEvent = { type: 'stop', channelId: 'ch-1' };
      bot.eventList.lpush(stopEvent);

      await bot.processEvents();

      expect(mockAddSong).toHaveBeenCalledWith('ch-1', [testEntry], true);
    });

    it('exits immediately when readyForEvents is false', async () => {
      const bot = createBot();
      bot.readyForEvents = false;
      await bot.processEvents();
      expect(mockPlayerPause).not.toHaveBeenCalled();
    });
  });

  describe('releaseChannel', () => {
    it('removes from reserved channels', async () => {
      const bot = createBot();
      await bot.releaseChannel();
      expect(mockSrem).toHaveBeenCalledWith('frybot:reserved-channels', 'ch-1');
      expect(mockRpush).not.toHaveBeenCalled();
    });

    it('also adds to free channels when markFree=true', async () => {
      const bot = createBot();
      await bot.releaseChannel(true);
      expect(mockSrem).toHaveBeenCalled();
      expect(mockRpush).toHaveBeenCalledWith('frybot:free-channels', 'ch-1');
    });
  });

  describe('cleanupAudio', () => {
    it('stops player and removes listeners', () => {
      const bot = createBot();
      bot.cleanupAudio();
      expect(mockPlayerRemoveAllListeners).toHaveBeenCalled();
      expect(mockPlayerStop).toHaveBeenCalled();
    });

    it('destroys read stream if present', () => {
      const bot = createBot();
      const mockDestroy = jest.fn();
      bot.audioResources.readStream = { destroy: mockDestroy } as never;
      bot.cleanupAudio();
      expect(mockDestroy).toHaveBeenCalled();
    });

    it('logs error when getVoiceConnection throws during cleanup', () => {
      const { getVoiceConnection } = require('@discordjs/voice') as typeof import('@discordjs/voice');
      (getVoiceConnection as jest.Mock).mockImplementationOnce(() => {
        throw new Error('connection error');
      });
      const bot = createBot();
      expect(() => bot.cleanupAudio()).not.toThrow();
    });
  });

  describe('addPlayerHandlers', () => {
    it('registers error and idle handlers on the player', async () => {
      const bot = createBot();
      await bot.addPlayerHandlers();
      expect(mockPlayerOn).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockPlayerOn).toHaveBeenCalledWith('idle', expect.any(Function));
    });

    it('idle handler calls playNext when transitioning from Playing', async () => {
      mockGetSong.mockResolvedValue(undefined as never);
      const bot = createBot();
      await bot.addPlayerHandlers();

      const idleHandler = (mockPlayerOn as jest.Mock).mock.calls.find(
        (call: unknown[]) => call[0] === 'idle'
      )?.[1] as ((oldState: { status: string }) => Promise<void>) | undefined;

      await idleHandler?.({ status: 'playing' });
      expect(mockGetSong).toHaveBeenCalled();
    });

    it('idle handler logs when transitioning from Buffering', async () => {
      const { logConsole } = require('../../../src/helpers/logger') as { logConsole: jest.Mock };
      const bot = createBot();
      await bot.addPlayerHandlers();

      const idleHandler = (mockPlayerOn as jest.Mock).mock.calls.find(
        (call: unknown[]) => call[0] === 'idle'
      )?.[1] as ((oldState: { status: string }) => Promise<void>) | undefined;

      await idleHandler?.({ status: 'buffering' });
      expect(logConsole).toHaveBeenCalled();
    });

    it('error handler logs when called', async () => {
      const { logConsole } = require('../../../src/helpers/logger') as { logConsole: jest.Mock };
      const bot = createBot();
      await bot.addPlayerHandlers();

      const errorHandler = (mockPlayerOn as jest.Mock).mock.calls.find(
        (call: unknown[]) => call[0] === 'error'
      )?.[1] as ((err: Error) => void) | undefined;

      errorHandler?.(new Error('player broke'));
      expect(logConsole).toHaveBeenCalled();
    });

    it('idle handler handles playNext throwing by cleaning up and releasing', async () => {
      mockGetSong.mockRejectedValue(new Error('getSong failed') as never);
      const bot = createBot();
      await bot.addPlayerHandlers();

      const idleHandler = (mockPlayerOn as jest.Mock).mock.calls.find(
        (call: unknown[]) => call[0] === 'idle'
      )?.[1] as ((oldState: { status: string }) => Promise<void>) | undefined;

      // Should not throw — error is caught inside the handler
      await expect(idleHandler?.({ status: 'playing' })).resolves.toBeUndefined();
      expect(mockPlayerStop).toHaveBeenCalled();
    });

    it('idle handler logs cleanup error when cleanupAudio also throws', async () => {
      mockGetSong.mockRejectedValue(new Error('getSong failed') as never);
      mockPlayerStop.mockImplementationOnce(() => { throw new Error('stop failed'); });
      const bot = createBot();
      await bot.addPlayerHandlers();

      const idleHandler = (mockPlayerOn as jest.Mock).mock.calls.find(
        (call: unknown[]) => call[0] === 'idle'
      )?.[1] as ((oldState: { status: string }) => Promise<void>) | undefined;

      expect(idleHandler).toBeDefined();
      // Should still not throw — nested catch handles the cleanup error
      await expect(idleHandler!({ status: 'playing' })).resolves.toBeUndefined();
    });
  });

  describe('playNext - cancelWatch race', () => {
    it('returns early when cancelWatch emits before getSong resolves', async () => {
      const bot = createBot();
      // getSong never resolves — cancelWatch wins the race
      mockGetSong.mockReturnValue(new Promise(() => {}) as never);
      setImmediate(() => bot.cancelWatch.emit('stop'));

      await bot.playNext();
      expect(mockPlayerPlay).not.toHaveBeenCalled();
    });

    it('does not play when getSong returns undefined (queue empty)', async () => {
      const bot = createBot();
      mockGetSong.mockResolvedValue(undefined as never);
      await bot.playNext();
      expect(mockPlayerPlay).not.toHaveBeenCalled();
    });
  });

  describe('playNext - player.play throws', () => {
    it('re-enqueues entry and rethrows when player.play throws', async () => {
      const bot = createBot();
      const { Readable } = require('stream');
      const mockStream = new Readable({ read() { this.push(null); } });
      mockGetSong.mockResolvedValue(testEntry as never);
      mockDownload.mockResolvedValue(mockStream as never);
      mockPlayerPlay.mockImplementationOnce(() => { throw new Error('play error'); });

      await expect(bot.playNext()).rejects.toThrow('play error');
      expect(mockAddSong).toHaveBeenCalledWith('ch-1', [testEntry], true);
    });
  });

  describe('static init and connect', () => {
    it('connect creates a voice connection and audio player', async () => {
      const { joinVoiceChannel, createAudioPlayer } = require('@discordjs/voice') as typeof import('@discordjs/voice');
      const result = await VoiceBot.connect({
        channelId: 'ch-1',
        guildId: 'guild-1',
        voiceAdapter: {} as never,
        channelName: 'test-channel',
      });
      expect(joinVoiceChannel).toHaveBeenCalled();
      expect(createAudioPlayer).toHaveBeenCalled();
      expect(result).toHaveProperty('player');
    });

    it('init fetches channel, connects, and returns a VoiceBot', async () => {
      const { client } = require('../../../src/voice_bot/main') as { client: { channels: { fetch: jest.Mock }, guilds: { fetch: jest.Mock } } };
      mockGetSong.mockResolvedValue(undefined as never);
      const bot = await VoiceBot.init({
        channelId: 'ch-1',
        guildId: 'guild-1',
        voiceAdapter: {} as never,
        idleTimeout: 30,
      });
      expect(client.channels.fetch).toHaveBeenCalledWith('ch-1');
      expect(bot).toBeInstanceOf(VoiceBot);
    });
  });
});
