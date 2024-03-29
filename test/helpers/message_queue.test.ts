import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { enqueue, dequeue, EnqueueResponse } from '../../src/helpers/message_queue';
import { newClient } from '../../src/helpers/redis';
import { setTimeout } from 'timers';
import { setTimeout as setTimeoutPromise } from 'timers/promises'
import { Redis } from 'ioredis';
import { hasProperties } from '../../src/helpers/common';

const messageCases = [1, 3, 5, 10]
const queueKey = 'test_queue'
const REDIS_URL = process.env['REDIS_URL'] || 'redis://redis.service.consul:6379';

describe('Message Queue Tests', () => {
  let client: Redis;
  beforeAll(async () => client = await newClient(REDIS_URL));
  beforeEach(async () => await dequeue(queueKey, -1));
  afterAll(async () => {
    await dequeue(queueKey, -1);
    client.disconnect();
  });
  
  it.each(messageCases)('enqueues %i messages at a time', async count => {
    const messages: unknown[] = [];
    for(let i = 0; i < count; i++) {
      messages.push({ name: `test ${i}`, id: i });
    }
    const res = await enqueue(queueKey, messages);
    res.forEach(response => {
      expect(hasProperties(response.message, ['id'])).toBe(true)
      const message = response.message as { [id: string]: number }
      expect(response.error).toBeUndefined();
      expect(message).toEqual(messages[message.id]);
      expect(response.status).toBeDefined;
      expect(response.status?.jsonSet).toBe('OK');
      expect(response.status?.listPush).toBe(message.id + 1);
    })
  })


  it.each(messageCases)('dequeues %i messages 1 at a time', async count => {
    const messages: unknown[] = [];
    for(let i = 0; i < count; i++) {
      messages.push({ name: `test ${i}`, id: i });
    }
    const enqs = await enqueue(queueKey, messages);
    for(const enq of enqs) {
      const deq = (await dequeue(queueKey, 1))[0];
      expect(enq.error).toBeUndefined();
      expect(deq.error).toBeUndefined();
      expect(deq.message).toEqual(enq.message);
    }
  })

  it.each(messageCases)('dequeues %i messages 3 at a time with no timeout', async count => {
    const messages: unknown[] = [];
    for(let i = 0; i < count; i++) {
      messages.push({ name: `test ${i}`, id: i });
    }
    const enqs = await enqueue(queueKey, messages);

    let deqs = await dequeue(queueKey, 3);
    while(deqs.length > 0) {
      if(deqs.length == 0) break;
      for(const deq of deqs) {
        const expected = enqs.splice(0, 1)[0];
        expect(expected).toBeDefined();
        expect(deq.error).toBeUndefined();
        expect(deq.message).toEqual(expected?.message);
      }
      deqs = await dequeue(queueKey, 3)
    }
    expect(enqs.length).toBe(0);
  })

  it.each(messageCases)('dequeues %i messages 3 at a time with 3s timeout', async count => {
    const messages: unknown[] = [];
    for(let i = 0; i < count; i++) {
      messages.push({ name: `test ${i}`, id: i });
    }

    const enqs = await enqueue(queueKey, messages);
    let deqs = await dequeue(queueKey, 3, 3);
    while(deqs.length > 0) {
      for(const deq of deqs) {
        const expected = enqs.splice(0, 1)[0];
        expect(expected).toBeDefined();
        expect(deq.error).toBeUndefined();
        expect(deq.message).toEqual(expected?.message);
      }
      if(enqs.length == 0) break;
      deqs = await dequeue(queueKey, 3, 3);
    }
    expect(enqs.length).toBe(0);
  })

  it.each(messageCases)('blocks for new messages and then dequeues %i fresh messages', async count => {
    const messages: unknown[] = [];
    let enqs: EnqueueResponse[] = [];
    for(let i = 0; i < count; i++) {
      messages.push({ name: `test ${i}`, id: i });
    }

    setTimeout(async () => {
      enqs = await enqueue(queueKey, messages);
    }, 2000);

    const deqs = await dequeue(queueKey, count, 5);
    expect(deqs.length).toBe(count);
    for(const deq of deqs) {
      const expected = enqs.splice(0, 1)[0];
      expect(expected).toBeDefined();
      expect(deq.error).toBeUndefined();
      expect(deq.message).toEqual(expected?.message);
    }
  }, 10000)

  it.each(messageCases)('blocks for new messages and times out with no results', async count => {
    const messages: unknown[] = [];
    for(let i = 0; i < count; i++) {
      messages.push({ name: `test ${i}`, id: i });
    }

    dequeue(queueKey, count, 2)
      .then(deqs => {
        expect(deqs.length).toBe(0);
      })

    await setTimeoutPromise(5000);
    await enqueue(queueKey, messages);
  }, 10000)
})

