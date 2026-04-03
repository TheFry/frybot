import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';
import { addInteraction, interactions } from '../../src/helpers/interactions';
import { BaseInteraction } from 'discord.js';

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
    const expiredTimestamp = Date.now() - 1000 * 825 - 10000;
    await addInteraction(mockInteraction('456', expiredTimestamp));
    const timeoutMs = spy.mock.calls[0][1] as number;
    expect(timeoutMs).toBeGreaterThanOrEqual(0);
    spy.mockRestore();
  });

  it('removes an already-expired interaction immediately', async () => {
    const expiredTimestamp = Date.now() - 1000 * 825 - 10000;
    await addInteraction(mockInteraction('456', expiredTimestamp));
    jest.runAllTimers();
    expect(interactions['456']).toBeUndefined();
  });
});
