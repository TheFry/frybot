import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';
import { addInteraction, interactions } from '../../../src/helpers/interactions';
import { BaseInteraction } from 'discord.js';

const CLEARLY_EXPIRED_TIMESTAMP = Date.now() - 1e9;

function mockInteraction(id: string, createdTimestamp: number): BaseInteraction {
  return { id, createdTimestamp } as unknown as BaseInteraction;
}

describe('addInteraction', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    for (const key of Object.keys(interactions)) {
      delete interactions[key];
    }
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('adds the interaction to the map', async () => {
    const interaction = mockInteraction('123', Date.now());
    await addInteraction(interaction);
    expect(interactions['123']).toBe(interaction);
  });

  it('removes the interaction after the timeout elapses', async () => {
    const interaction = mockInteraction('123', Date.now());
    await addInteraction(interaction);
    jest.runAllTimers();
    expect(interactions['123']).toBeUndefined();
  });

  it('does not pass a negative timeout for an already-expired interaction', async () => {
    const spy = jest.spyOn(global, 'setTimeout');
    try {
      await addInteraction(mockInteraction('456', CLEARLY_EXPIRED_TIMESTAMP));
      const timeoutMs = spy.mock.calls[0][1] as number;
      expect(timeoutMs).toBeGreaterThanOrEqual(0);
    } finally {
      spy.mockRestore();
    }
  });

  it('removes an already-expired interaction immediately', async () => {
    await addInteraction(mockInteraction('456', CLEARLY_EXPIRED_TIMESTAMP));
    jest.runAllTimers();
    expect(interactions['456']).toBeUndefined();
  });
});
