import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';

describe('logConsole', () => {
  let errorSpy: ReturnType<typeof jest.spyOn>;
  let warnSpy: ReturnType<typeof jest.spyOn>;
  let debugSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
    warnSpy.mockRestore();
    debugSpy.mockRestore();
    jest.resetModules();
  });

  it('logs errors when LOG_LEVEL >= 1', () => {
    process.env['LOG_LEVEL'] = '1';
     
    const { logConsole, LogType } = require('../../../src/helpers/logger');
    logConsole({ msg: 'test error', type: LogType.Error });
    expect(errorSpy).toHaveBeenCalled();
  });

  it('suppresses warnings when LOG_LEVEL = 1', () => {
    process.env['LOG_LEVEL'] = '1';
     
    const { logConsole, LogType } = require('../../../src/helpers/logger');
    logConsole({ msg: 'test warn', type: LogType.Warn });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('logs warnings when LOG_LEVEL >= 2', () => {
    process.env['LOG_LEVEL'] = '2';
     
    const { logConsole, LogType } = require('../../../src/helpers/logger');
    logConsole({ msg: 'test warn', type: LogType.Warn });
    expect(warnSpy).toHaveBeenCalled();
  });

  it('suppresses debug when LOG_LEVEL = 2', () => {
    process.env['LOG_LEVEL'] = '2';
     
    const { logConsole, LogType } = require('../../../src/helpers/logger');
    logConsole({ msg: 'test debug', type: LogType.Debug });
    expect(debugSpy).not.toHaveBeenCalled();
  });

  it('logs debug when LOG_LEVEL >= 3', () => {
    process.env['LOG_LEVEL'] = '3';
     
    const { logConsole, LogType } = require('../../../src/helpers/logger');
    logConsole({ msg: 'test debug', type: LogType.Debug });
    expect(debugSpy).toHaveBeenCalled();
  });

  it('defaults to Debug type when type is not specified', () => {
    process.env['LOG_LEVEL'] = '3';
     
    const { logConsole } = require('../../../src/helpers/logger');
    logConsole({ msg: 'no type specified' });
    expect(debugSpy).toHaveBeenCalled();
  });

  it('includes timestamp in output', () => {
    process.env['LOG_LEVEL'] = '1';
     
    const { logConsole, LogType } = require('../../../src/helpers/logger');
    logConsole({ msg: 'timestamp test', type: LogType.Error });
    const output = errorSpy.mock.calls[0][1] as string;
    expect(output).toMatch(/\[.+\] timestamp test/);
  });
});

describe('logDiscord', () => {
  it('returns early when dcClient is not provided', async () => {
    process.env['LOG_LEVEL'] = '1';
    jest.resetModules();
     
    const { logDiscord } = require('../../../src/helpers/logger');

    // Should not throw, and not attempt any Discord calls
    await expect(logDiscord({ msg: 'test', dcClient: null, dcErrorChannel: '123' })).resolves.toBeUndefined();
  });

  it('sends message to Discord channel', async () => {
    process.env['LOG_LEVEL'] = '1';
    jest.resetModules();
     
    const { logDiscord } = require('../../../src/helpers/logger');

    const mockChannel = {
      isTextBased: jest.fn().mockReturnValue(true),
      send: jest.fn().mockResolvedValue(undefined as never),
    };
    const mockClient = {
      channels: {
        fetch: jest.fn().mockResolvedValue(mockChannel as never),
      },
    };

    await logDiscord({
      msg: 'test discord log',
      dcClient: mockClient,
      dcErrorChannel: '123456',
    });

    expect(mockClient.channels.fetch).toHaveBeenCalledWith('123456');
    expect(mockChannel.send).toHaveBeenCalledWith(expect.stringContaining('test discord log'));
  });

  it('falls back to console when channel fetch fails', async () => {
    process.env['LOG_LEVEL'] = '1';
    jest.resetModules();
     
    const { logDiscord } = require('../../../src/helpers/logger');

    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const mockClient = {
      channels: {
        fetch: jest.fn().mockRejectedValue(new Error('not found') as never),
      },
    };

    await logDiscord({
      msg: 'test error',
      dcClient: mockClient,
      dcErrorChannel: '123456',
    });

    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('falls back to console when channel is not text-based', async () => {
    process.env['LOG_LEVEL'] = '1';
    jest.resetModules();
     
    const { logDiscord } = require('../../../src/helpers/logger');

    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const mockChannel = {
      isTextBased: jest.fn().mockReturnValue(false),
    };
    const mockClient = {
      channels: {
        fetch: jest.fn().mockResolvedValue(mockChannel as never),
      },
    };

    await logDiscord({
      msg: 'test',
      dcClient: mockClient,
      dcErrorChannel: '123456',
    });

    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('falls back to console when channel.send fails', async () => {
    process.env['LOG_LEVEL'] = '1';
    jest.resetModules();
     
    const { logDiscord } = require('../../../src/helpers/logger');

    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const mockChannel = {
      isTextBased: jest.fn().mockReturnValue(true),
      send: jest.fn().mockRejectedValue(new Error('send failed') as never),
    };
    const mockClient = {
      channels: {
        fetch: jest.fn().mockResolvedValue(mockChannel as never),
      },
    };

    await logDiscord({
      msg: 'test',
      dcClient: mockClient,
      dcErrorChannel: '123456',
    });

    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe('logBoth', () => {
  it('calls both logConsole and logDiscord', async () => {
    process.env['LOG_LEVEL'] = '3';
    jest.resetModules();
     
    const { logBoth } = require('../../../src/helpers/logger');

    const debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {});
    const mockChannel = {
      isTextBased: jest.fn().mockReturnValue(true),
      send: jest.fn().mockResolvedValue(undefined as never),
    };
    const mockClient = {
      channels: {
        fetch: jest.fn().mockResolvedValue(mockChannel as never),
      },
    };

    await logBoth({
      msg: 'both test',
      dcClient: mockClient,
      dcErrorChannel: '123456',
    });

    expect(debugSpy).toHaveBeenCalled();
    expect(mockChannel.send).toHaveBeenCalled();
    debugSpy.mockRestore();
  });
});
