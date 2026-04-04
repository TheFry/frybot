import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { Redis } from 'ioredis';
import { newClient } from '../../src/helpers/redis';
import { dequeue, enqueue } from '../../src/helpers/message_queue';
import { CLIP_QUEUE_KEY, INTERACTION_QUEUE_KEY, ClipJob } from '../../src/helpers/common';
import { DiscordResponse } from '../../src/helpers/interactions';

const REDIS_URL = process.env['REDIS_URL'] || 'redis://localhost:6379';

// Use test-prefixed keys to avoid interference with live production processes
// (production ffmpeg/cmd_processor consume the real queues via BRPOP)
const TEST_CLIP_KEY = `test:${CLIP_QUEUE_KEY}`;
const TEST_INTERACTION_KEY = `test:${INTERACTION_QUEUE_KEY}`;

describe('E2E: Clip flow', () => {
  let client: Redis;

  beforeAll(async () => {
    client = await newClient(REDIS_URL);
  });

  beforeEach(async () => {
    await dequeue(TEST_CLIP_KEY, -1);
    await dequeue(TEST_INTERACTION_KEY, -1);
  });

  afterAll(async () => {
    await dequeue(TEST_CLIP_KEY, -1);
    await dequeue(TEST_INTERACTION_KEY, -1);
    client.disconnect();
  });

  it('simulates full clip pipeline: command -> clip queue -> response queue', async () => {
    // Step 1: Enqueue a clip job (simulating what the clip command does)
    const job: ClipJob = {
      video: { name: 'Test Video', id: 'abc123', type: 'video' },
      startTime: '00:00:00',
      duration: 5,
      interactionId: 'test-interaction',
    };
    const enqRes = await enqueue(TEST_CLIP_KEY, [job]);
    expect(enqRes[0].error).toBeUndefined();
    expect(enqRes[0].status?.jsonSet).toBe('OK');
    expect(enqRes[0].status?.listPush).toBeGreaterThan(0);

    // Verify it's in the queue
    const clipJobs = await dequeue(TEST_CLIP_KEY, 1);
    expect(clipJobs).toHaveLength(1);
    expect(clipJobs[0].error).toBeUndefined();
    expect((clipJobs[0].message as ClipJob).video.id).toBe('abc123');

    // Step 2: Simulate ffmpeg completing and enqueuing response
    const response: DiscordResponse = {
      interactionId: 'test-interaction',
      content: 'Here is your file',
      files: ['/frybot_media/output.mp3'],
    };
    const respEnq = await enqueue(TEST_INTERACTION_KEY, [response]);
    expect(respEnq[0].error).toBeUndefined();
    expect(respEnq[0].status?.jsonSet).toBe('OK');

    // Step 3: Verify the response is in the interaction queue
    const responses = await dequeue(TEST_INTERACTION_KEY, 1);
    expect(responses).toHaveLength(1);
    expect(responses[0].error).toBeUndefined();

    const msg = responses[0].message as DiscordResponse;
    expect(msg.interactionId).toBe('test-interaction');
    expect(msg.content).toBe('Here is your file');
    expect(msg.files).toContain('/frybot_media/output.mp3');
  });

  it('enqueues multiple clip jobs and dequeues them in order', async () => {
    const jobs: ClipJob[] = [
      { video: { name: 'Video 1', id: 'v1', type: 'video' }, startTime: '00:00:00', duration: 5, interactionId: 'i1' },
      { video: { name: 'Video 2', id: 'v2', type: 'video' }, startTime: '00:01:00', duration: 10, interactionId: 'i2' },
      { video: { name: 'Video 3', id: 'v3', type: 'video' }, startTime: '00:02:00', duration: 15, interactionId: 'i3' },
    ];

    for (const job of jobs) {
      await enqueue(TEST_CLIP_KEY, [job]);
    }

    const dequeued = await dequeue(TEST_CLIP_KEY, 3);
    expect(dequeued).toHaveLength(3);
    expect((dequeued[0].message as ClipJob).video.id).toBe('v1');
    expect((dequeued[1].message as ClipJob).video.id).toBe('v2');
    expect((dequeued[2].message as ClipJob).video.id).toBe('v3');
  });

  it('verifies production clip queue key constant is correct', () => {
    // Ensure the constant matches the expected production key so changes are caught
    expect(CLIP_QUEUE_KEY).toBe('frybot:clip-jobs-queue');
    expect(INTERACTION_QUEUE_KEY).toBe('frybot:interaction-queue');
  });
});
