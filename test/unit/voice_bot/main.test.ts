import { describe, expect, it, jest, beforeEach } from '@jest/globals';

// ─── Mock control references ──────────────────────────────────────────────────
// Declared at module scope so factories can close over them.

const mockGet = jest.fn();
const mockSadd = jest.fn();
const mockExec = jest.fn();
const mockSmembers = jest.fn();
const mockGetBotId = jest.fn();
const mockFreeClientBrpop = jest.fn();

// ─── Mock declarations ────────────────────────────────────────────────────────

jest.mock('timers/promises', () => ({
  setTimeout: jest.fn().mockResolvedValue(undefined as never),
}));

jest.mock('../../../src/helpers/logger', () => ({
  logConsole: jest.fn(),
  LogType: { Error: 1, Warn: 2, Debug: 3 },
}));

jest.mock('../../../src/helpers/playlist', () => ({
  getBotId: mockGetBotId,
}));

jest.mock('../../../src/helpers/redis', () => ({
  newClient: jest.fn().mockResolvedValue({
    get: mockGet,
    sadd: mockSadd,
    smembers: mockSmembers,
    setnx: jest.fn().mockResolvedValue(1 as never),
    multi: jest.fn().mockReturnValue({
      srem: jest.fn().mockReturnThis(),
      rpush: jest.fn().mockReturnThis(),
      exec: mockExec,
    }),
    // Both reserveChannels (brpop) and watchChannelEvents (subscribe) call duplicate().
    // Returning a single object with both methods is sufficient for these tests.
    duplicate: jest.fn().mockReturnValue({
      brpop: mockFreeClientBrpop,
      on: jest.fn(),
      subscribe: jest.fn(),
    }),
    on: jest.fn(),
  } as never),
}));

jest.mock('../../../src/voice_bot/VoiceBot', () => ({
  VoiceBot: {
    init: jest.fn().mockResolvedValue({
      playNext: jest.fn().mockResolvedValue(undefined as never),
      processEvents: jest.fn(),
      readyForEvents: false,
      resourceLock: { acquire: jest.fn().mockResolvedValue(undefined as never), release: jest.fn() },
      cleanupAudio: jest.fn(),
      releaseChannel: jest.fn().mockResolvedValue(undefined as never),
    } as never),
  },
  connectedGuilds: {},
  voicebotList: {},
}));

jest.mock('discord.js', () => {
  const EventEmitter = require('events').EventEmitter;
  const inst = new EventEmitter();
  inst.login = jest.fn().mockResolvedValue('token' as never);
  inst.guilds = { fetch: jest.fn().mockResolvedValue({ voiceAdapterCreator: {} } as never) };
  inst.application = { id: 'test-bot-id' };
  return {
    Client: jest.fn().mockImplementation(() => inst),
    GatewayIntentBits: { Guilds: 1, GuildVoiceStates: 2 },
  };
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

type VBModule = {
  VoiceBot: { init: jest.MockedFunction<(...args: unknown[]) => Promise<unknown>> };
  connectedGuilds: Record<string, boolean>;
  voicebotList: Record<string, unknown>;
};

/**
 * Reload main.ts and VoiceBot fresh so each test gets an unregistered
 * client.once handler and a clean connectedGuilds object.
 */
function loadFresh() {
  jest.resetModules();
  const main = require('../../../src/voice_bot/main') as { client: import('events').EventEmitter };
  const vb = require('../../../src/voice_bot/VoiceBot') as VBModule;
  return { client: main.client, ...vb };
}

/** Returns a minimal bot stub accepted by initChannel after VoiceBot.init. */
function makeBotStub() {
  return {
    playNext: jest.fn().mockResolvedValue(undefined as never),
    processEvents: jest.fn(),
    readyForEvents: false,
    resourceLock: { acquire: jest.fn().mockResolvedValue(undefined as never), release: jest.fn() },
    cleanupAudio: jest.fn(),
    releaseChannel: jest.fn().mockResolvedValue(undefined as never),
  };
}

/**
 * Resolves once the free-channels while loop calls brpop for the first time,
 * which means startup recovery has fully completed. The brpop then hangs so
 * the loop does not spin.
 */
function onNextBrpop(): Promise<void> {
  return new Promise(resolve => {
    mockFreeClientBrpop.mockImplementationOnce(() => {
      resolve();
      return new Promise(() => {});
    });
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('voice_bot/main — reserveChannels', () => {
  beforeEach(() => {
    // Reset all mock state, then restore the defaults needed across every test.
    jest.resetAllMocks();
    mockSadd.mockResolvedValue(1 as never);
    mockExec.mockResolvedValue([] as never);
    mockSmembers.mockResolvedValue([] as never);
    mockFreeClientBrpop.mockReturnValue(new Promise(() => {}));
  });

  // ── Startup recovery: channels already in WATCHED_CHANNELS_KEY on boot ──────

  describe('startup recovery', () => {
    it('skips a channel when its guildId is missing from redis', async () => {
      const { client, VoiceBot } = loadFresh();
      mockSmembers.mockResolvedValueOnce(['ch-1'] as never);
      mockGetBotId.mockResolvedValueOnce('test-bot-id' as never);
      mockGet.mockResolvedValueOnce(null as never); // no guild-id key in redis

      const done = onNextBrpop();
      client.emit('clientReady', client);
      await done;

      expect(VoiceBot.init).not.toHaveBeenCalled();
      expect(mockExec).toHaveBeenCalled(); // releaseChannel fired
    });

    it('skips a channel when its guild is already connected (deduplication guard)', async () => {
      const { client, VoiceBot, connectedGuilds } = loadFresh();
      connectedGuilds['guild-1'] = true; // bot already owns a channel in this guild

      mockSmembers.mockResolvedValueOnce(['ch-2'] as never); // second channel, same guild
      mockGetBotId.mockResolvedValueOnce('test-bot-id' as never);
      mockGet.mockResolvedValueOnce('guild-1' as never);

      const done = onNextBrpop();
      client.emit('clientReady', client);
      await done;

      expect(VoiceBot.init).not.toHaveBeenCalled();
      expect(mockExec).toHaveBeenCalled(); // releaseChannel fired
      expect(connectedGuilds['guild-1']).toBe(true); // pre-existing entry untouched
    });

    it('skips a channel owned by a different bot instance', async () => {
      const { client, VoiceBot } = loadFresh();
      mockSmembers.mockResolvedValueOnce(['ch-1'] as never);
      mockGetBotId.mockResolvedValueOnce('other-bot-id' as never); // not ours

      const done = onNextBrpop();
      client.emit('clientReady', client);
      await done;

      expect(VoiceBot.init).not.toHaveBeenCalled();
    });

    it('initializes VoiceBot and marks guild connected when channel is free', async () => {
      const { client, VoiceBot, connectedGuilds } = loadFresh();
      mockSmembers.mockResolvedValueOnce(['ch-1'] as never);
      mockGetBotId.mockResolvedValueOnce('test-bot-id' as never);
      mockGet.mockResolvedValueOnce('guild-1' as never);

      const initCalled = new Promise<void>(resolve => {
        VoiceBot.init.mockImplementationOnce(async () => { resolve(); return makeBotStub(); });
      });

      client.emit('clientReady', client);
      await initCalled;
      // One setImmediate lets the lines after `await VoiceBot.init()` in
      // initChannel run (setting connectedGuilds and calling playNext).
      await new Promise(resolve => setImmediate(resolve));

      expect(VoiceBot.init).toHaveBeenCalledWith(expect.objectContaining({
        channelId: 'ch-1',
        guildId: 'guild-1',
      }));
      expect(connectedGuilds['guild-1']).toBe(true);
    });

    it('releases channel without setting connectedGuilds when VoiceBot.init throws', async () => {
      const { client, VoiceBot, connectedGuilds } = loadFresh();
      mockSmembers.mockResolvedValueOnce(['ch-1'] as never);
      mockGetBotId.mockResolvedValueOnce('test-bot-id' as never);
      mockGet.mockResolvedValueOnce('guild-1' as never);
      VoiceBot.init.mockRejectedValueOnce(new Error('voice connect failed') as never);

      const done = onNextBrpop();
      client.emit('clientReady', client);
      await done;

      expect(VoiceBot.init).toHaveBeenCalled();
      expect(connectedGuilds['guild-1']).toBeUndefined();
      expect(mockExec).toHaveBeenCalled(); // releaseChannel in error path
    });
  });

  // ── Free-channels while loop: channels arriving at runtime ──────────────────

  describe('free-channels loop', () => {
    it('skips channel when SADD returns 0 (race — another bot instance won)', async () => {
      const { client, VoiceBot } = loadFresh();
      mockSadd.mockResolvedValueOnce(0 as never);

      // First brpop returns a channel; second signals that the first iteration
      // fully completed (so we can assert without a timing dependency).
      const firstIterationDone = new Promise<void>(resolve => {
        mockFreeClientBrpop
          .mockReturnValueOnce(Promise.resolve(['frybot:free-channels', 'ch-1']) as never)
          .mockImplementationOnce(() => { resolve(); return new Promise(() => {}); });
      });

      client.emit('clientReady', client);
      await firstIterationDone;

      expect(VoiceBot.init).not.toHaveBeenCalled();
    });

    it('initializes VoiceBot and marks guild connected when SADD returns 1', async () => {
      const { client, VoiceBot, connectedGuilds } = loadFresh();
      mockSadd.mockResolvedValueOnce(1 as never);
      mockGet.mockResolvedValueOnce('guild-1' as never);

      const initCalled = new Promise<void>(resolve => {
        VoiceBot.init.mockImplementationOnce(async () => { resolve(); return makeBotStub(); });
      });

      mockFreeClientBrpop
        .mockReturnValueOnce(Promise.resolve(['frybot:free-channels', 'ch-1']) as never)
        .mockReturnValue(new Promise(() => {}));

      client.emit('clientReady', client);
      await initCalled;
      await new Promise(resolve => setImmediate(resolve));

      expect(VoiceBot.init).toHaveBeenCalledWith(expect.objectContaining({
        channelId: 'ch-1',
        guildId: 'guild-1',
      }));
      expect(connectedGuilds['guild-1']).toBe(true);
    });
  });
});
