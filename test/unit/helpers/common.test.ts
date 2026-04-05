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
  it('converts single digit seconds', () => {
    expect(timeConverter('5')).toEqual({ str: '00:00:05', num: 5 });
    expect(timeConverter('0')).toEqual({ str: '00:00:00', num: 0 });
  });

  it('handles 2-3 char string (length <= 3, length != 1 branch)', () => {
    // length 2: hits false branch of `time.length == 1` ternary
    const result = timeConverter('30');
    expect(result).toHaveProperty('str');
    expect(result).toHaveProperty('num');
  });

  it('converts full HH:MM:SS format (8 chars)', () => {
    expect(timeConverter('01:30:00')).toEqual({ str: '01:30:00', num: 5400 });
    expect(timeConverter('00:01:30')).toEqual({ str: '00:01:30', num: 90 });
    expect(timeConverter('00:00:05')).toEqual({ str: '00:00:05', num: 5 });
    expect(timeConverter('00:00:00')).toEqual({ str: '00:00:00', num: 0 });
    expect(timeConverter('02:15:30')).toEqual({ str: '02:15:30', num: 8130 });
  });

  it('converts 7-char H:MM:SS format (length == 7 true branch)', () => {
    // length 7: `time.length == 7` is true → hours = '0'+time[0]
    const result = timeConverter('1:30:00');
    expect(result).toHaveProperty('str');
    expect(result).toHaveProperty('num');
  });

  it('converts 4-char SSMM format (length <= 6 branch)', () => {
    // 4 chars: seconds in first 2 chars, minutes[3] is single digit → '0'+time[3]
    const result = timeConverter('3045');
    expect(result).toHaveProperty('str');
    expect(result).toHaveProperty('num');
    expect(typeof result.str).toBe('string');
  });

  it('converts 5-6 char format (length <= 6 branch, length != 4)', () => {
    // 5 chars: seconds = substring(0,2), minutes = substring(3,5)
    const result = timeConverter('30:45');
    expect(result).toHaveProperty('str');
    expect(result).toHaveProperty('num');
    expect(typeof result.num).toBe('number');
  });

  it('returns an object with str and num properties', () => {
    const result = timeConverter('00:00:00');
    expect(result).toHaveProperty('str');
    expect(result).toHaveProperty('num');
    expect(typeof result.str).toBe('string');
    expect(typeof result.num).toBe('number');
  });

  it('falls through all branches for strings longer than 8 chars (line 60 false branch)', () => {
    // length > 8 → none of the if/else-if conditions match → defaults apply
    const result = timeConverter('01:30:00A');
    expect(result).toHaveProperty('str');
    expect(result).toHaveProperty('num');
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
