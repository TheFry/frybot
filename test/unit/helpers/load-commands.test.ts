import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import path from 'path';

const mockReaddirSync = jest.fn().mockReturnValue(['play.js', 'skip.js']);
const mockRestPut = jest.fn().mockResolvedValue({ length: 2 } as never);

jest.mock('fs', () => ({
  readdirSync: mockReaddirSync,
  readFileSync: jest.fn(),
}));

jest.mock('discord.js', () => {
  const mockRest = jest.fn().mockImplementation(() => ({
    setToken: jest.fn().mockReturnThis(),
    put: mockRestPut,
  }));
  return {
    Client: jest.fn(),
    REST: mockRest,
    Routes: {
      applicationGuildCommands: jest.fn().mockReturnValue('/guild-commands'),
      applicationCommands: jest.fn().mockReturnValue('/global-commands'),
    },
  };
});

jest.mock('../../../src/helpers/logger', () => ({
  logConsole: jest.fn(),
  LogType: { Error: 1, Warn: 2, Debug: 3 },
}));

jest.mock('../../../src/helpers/common', () => ({
  hasProperties: jest.fn().mockReturnValue(true),
  DiscordClient: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const loadModule = require('../../../src/helpers/load-commands');
const load = loadModule.default || loadModule;

describe('load-commands', () => {
  const mockClient = {
    commands: {
      set: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env['DEPLOY'];
    delete process.env['DELETE'];
    delete process.env['GLOBAL'];
  });

  it('loads command files and sets them on client', async () => {
    // Mock the dynamic imports that load() performs
    const mockPlayCommand = {
      data: { name: 'play', toJSON: jest.fn().mockReturnValue({ name: 'play' }) },
      execute: jest.fn(),
    };
    const mockSkipCommand = {
      data: { name: 'skip', toJSON: jest.fn().mockReturnValue({ name: 'skip' }) },
      execute: jest.fn(),
    };

    // We need to mock the dynamic import in load()
    // Since it uses `await import(filePath)`, we mock the file paths
    jest.mock(path.join(__dirname, '../../../src/helpers', '../cmd_processor/commands', 'play.js'), () => mockPlayCommand, { virtual: true });
    jest.mock(path.join(__dirname, '../../../src/helpers', '../cmd_processor/commands', 'skip.js'), () => mockSkipCommand, { virtual: true });

    await load(mockClient, 'token', 'clientId', '../cmd_processor/commands', 'guildId');

    expect(mockClient.commands.set).toHaveBeenCalledTimes(2);
  });

  it('returns early when guildID is not provided', async () => {
    await load(mockClient, 'token', 'clientId', '../cmd_processor/commands');
    // Should not throw, should not call REST
    expect(mockRestPut).not.toHaveBeenCalled();
  });

  it('calls DELETE routes when DELETE env var is set at module load', async () => {
    process.env['DELETE'] = '1';
    let loadFn: typeof load;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('../../../src/helpers/load-commands');
      loadFn = mod.default || mod;
    });
    await loadFn!(mockClient, 'token', 'clientId', '../cmd_processor/commands', 'guildId');
    expect(mockRestPut).toHaveBeenCalledTimes(2);
    delete process.env['DELETE'];
  });

  it('deploys guild commands when DEPLOY env var is set at module load', async () => {
    process.env['DEPLOY'] = '1';
    let loadFn: typeof load;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('../../../src/helpers/load-commands');
      loadFn = mod.default || mod;
    });
    await loadFn!(mockClient, 'token', 'clientId', '../cmd_processor/commands', 'guildId');
    expect(mockRestPut).toHaveBeenCalledTimes(1);
    delete process.env['DEPLOY'];
  });

  it('deploys globally when DEPLOY and GLOBAL are set at module load', async () => {
    process.env['DEPLOY'] = '1';
    process.env['GLOBAL'] = '1';
    let loadFn: typeof load;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('../../../src/helpers/load-commands');
      loadFn = mod.default || mod;
    });
    const { Routes } = require('discord.js') as { Routes: { applicationCommands: jest.Mock } };
    await loadFn!(mockClient, 'token', 'clientId', '../cmd_processor/commands', 'guildId');
    expect(Routes.applicationCommands).toHaveBeenCalled();
    delete process.env['DEPLOY'];
    delete process.env['GLOBAL'];
  });

  it('skips logging when REST put returns data without length property', async () => {
    process.env['DEPLOY'] = '1';
    let loadFn: typeof load;
    let hasPropertiesMock: ReturnType<typeof jest.fn>;
    jest.isolateModules(() => {
      // Require common first so we get the same mock instance load-commands will use
      const common = require('../../../src/helpers/common') as { hasProperties: ReturnType<typeof jest.fn> };
      hasPropertiesMock = common.hasProperties;
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('../../../src/helpers/load-commands');
      loadFn = mod.default || mod;
    });
    // Make hasProperties return false so the logging branch is skipped
    hasPropertiesMock!.mockReturnValueOnce(false);
    await loadFn!(mockClient, 'token', 'clientId', '../cmd_processor/commands', 'guildId');
    expect(mockRestPut).toHaveBeenCalledTimes(1);
    delete process.env['DEPLOY'];
  });
});
