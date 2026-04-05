import { describe, expect, it, beforeEach, afterEach } from '@jest/globals';
import { hasProperties, timeConverter, checkVars } from '../../../src/helpers/common';

describe('hasProperties', () => {
  const propCases = [
     { obj: null, props: ['prop1', 'prop2', 'prop3'], expected: ['prop1', 'prop2', 'prop3'] },
     {
      obj: { prop1: '', prop2: '', prop3: '' },
      props: ['prop1', 'prop2', 'prop3'],
      expected: []
    },
    {
      obj: { prop1: '', prop3: '' },
      props: ['prop1', 'prop2', 'prop3'],
      expected: ['prop2']
    },
    {
      obj: {
        prop1: '',
        prop2: {
          level1: ''
        },
        prop3: {
          level1: {
            level2: ''
          }
        }
      },
      props: ['prop1', 'prop2.level1', 'prop3.level1.level2'],
      expected: []
    },
    {
      obj: {
        prop1: '',
        prop2: '',
        prop3: {
          level1: {
            level2: ''
          }
        }
      },
      props: ['prop1', 'prop2.level1', 'prop3.level1.level2'],
      expected: ['prop2.level1']
    },
    {
      obj: {
        prop1: '',
        prop3: {
          level1: {
            level2: ''
          }
        }
      },
      props: ['prop1', 'prop2.level1', 'prop3.level1.level2'],
      expected: ['prop2.level1']
    }
  ];

  it.each(propCases)('check for properties $props on obj $obj', ({ obj, props, expected }) => {
    expect(hasProperties(obj, props, true)).toEqual(expected);
    expect(hasProperties(obj, props)).toBe(expected.length === 0);
  });

  it('accepts a single string property', () => {
    expect(hasProperties({ foo: 1 }, 'foo')).toBe(true);
    expect(hasProperties({ foo: 1 }, 'bar')).toBe(false);
  });
});


describe('timeConverter', () => {
  it('converts single digit seconds (S format)', () => {
    expect(timeConverter('5')).toEqual({ str: '00:00:05', num: 5 });
    expect(timeConverter('0')).toEqual({ str: '00:00:00', num: 0 });
  });

  it('converts two-digit seconds (SS format)', () => {
    expect(timeConverter('30')).toEqual({ str: '00:00:30', num: 30 });
    expect(timeConverter('59')).toEqual({ str: '00:00:59', num: 59 });
  });

  it('converts MM:SS format', () => {
    expect(timeConverter('30:45')).toEqual({ str: '00:30:45', num: 1845 });
    expect(timeConverter('1:30')).toEqual({ str: '00:01:30', num: 90 });
  });

  it('converts full HH:MM:SS format', () => {
    expect(timeConverter('01:30:00')).toEqual({ str: '01:30:00', num: 5400 });
    expect(timeConverter('00:01:30')).toEqual({ str: '00:01:30', num: 90 });
    expect(timeConverter('00:00:05')).toEqual({ str: '00:00:05', num: 5 });
    expect(timeConverter('00:00:00')).toEqual({ str: '00:00:00', num: 0 });
    expect(timeConverter('02:15:30')).toEqual({ str: '02:15:30', num: 8130 });
  });

  it('converts H:MM:SS format (single-digit hours)', () => {
    expect(timeConverter('1:30:00')).toEqual({ str: '01:30:00', num: 5400 });
    expect(timeConverter('9:59:59')).toEqual({ str: '09:59:59', num: 36000 - 1 });
  });

  it('returns 00:00:00 fallback for non-numeric input', () => {
    // Non-digit segments must not produce NaN in num (which would be passed to ffmpeg)
    const fallback = { str: '00:00:00', num: 0 };
    expect(timeConverter('abc')).toEqual(fallback);
    expect(timeConverter('00:00:0x')).toEqual(fallback);
    expect(timeConverter('1:30:xx')).toEqual(fallback);
    expect(timeConverter('')).toEqual(fallback);
  });
});


describe('checkVars', () => {
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnv = {
      DC_TOKEN: process.env['DC_TOKEN'],
      DC_CLIENT: process.env['DC_CLIENT'],
      YT_TOKEN: process.env['YT_TOKEN'],
      G_ID: process.env['G_ID'],
    };
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('does not throw when all vars are set', () => {
    process.env['DC_TOKEN'] = 'tok';
    process.env['DC_CLIENT'] = 'cli';
    process.env['YT_TOKEN'] = 'yt';
    process.env['G_ID'] = 'g';
    expect(() => checkVars()).not.toThrow();
  });

  it('calls usage (does not throw) when vars are missing', () => {
    delete process.env['DC_TOKEN'];
    delete process.env['DC_CLIENT'];
    delete process.env['YT_TOKEN'];
    delete process.env['G_ID'];
    expect(() => checkVars()).not.toThrow();
  });
});
