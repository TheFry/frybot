import { Snowflake } from 'discord.js';
import { nanoid } from 'nanoid/non-secure';
import { redisClient } from './redis';


export interface QueueEntry {
  youtubeVideoId: string;
  youtubeVideoTitle: string;
  interactionId: Snowflake;
}


export interface QueueOptions {
  priority?: number,
  delay?: number,
  ttr?: number,
}


// export async function getQueue(channelId: Snowflake) { 
//   let tubes;
//   try {
//     tubes = await queue.listTubes();
//   } catch(err: any) {
//     console.log(err);
//     return;
//   }
//   return tubes;
// }


export async function enqueue(channelId: Snowflake, entry: QueueEntry, inFront = false) {
  let uuid = nanoid();
  let redis_queueKey = `discord:channel:${channelId}:queue`;
  let redis_entryKey = `${redis_queueKey}-entry:${uuid}`;

  await redisClient.json.set(redis_entryKey, '.', {
    youtubeVideoId: entry.youtubeVideoId,
    youtubeVideoTitle: entry.youtubeVideoTitle,
    interactionId: entry.interactionId
  });

  if(inFront) {
    await redisClient.rPush(redis_queueKey, uuid);
  } else  {
    await redisClient.lPush(redis_queueKey, uuid);
  }
}


export async function dequeue(channelId: Snowflake, timeout = 30000): Promise<QueueEntry | void> {
  let redis_queueKey = `discord:channel:${channelId}:queue`;
  let uuid = (await redisClient.brPop(redis_queueKey, timeout))?.element;
  if(!uuid) return;
  let redis_entryKey = `${redis_queueKey}-entry:${uuid}`;
  let results = (await redisClient.json.get(redis_entryKey, {
    path: [
      '.youtubeVideoId',
      '.youtubeVideoTitle',
      '.interactionId'
    ]
  })) as any;

  if(!results || Object.keys(results).length !== 3) {
    console.log(`Error dequeing - ${results}`);
    return;
  }

  await redisClient.del(redis_entryKey);

  return {
    youtubeVideoId: results['.youtubeVideoId'],
    youtubeVideoTitle: results['.youtubeVideoTitle'],
    interactionId: results['.interactionId'],
  }
}