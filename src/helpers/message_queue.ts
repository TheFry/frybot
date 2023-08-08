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

export interface Message { [key: string]: any }


export async function enqueue(queueKey: string, messages: Message[], front = false): Promise<0 | 1> {
  for(let message of messages) {
    let uuid = nanoid();
    let entryKey = `${queueKey}-entry:${uuid}`
    
    try {
      await redisClient.enqueue(queueKey, entryKey, uuid, message, front);
    } catch(err) {
      console.log(`Enqueue err on keys ${queueKey} / ${entryKey}\n${err}`);
      return 1;
    }
  }
  return 0;
}


export async function dequeue(queueKey: string, timeout?: number): Promise<Message | void> {
  let uuid: string | null | undefined;
  try {
    if(!timeout) {
      uuid = await redisClient.rPop(queueKey);
    } else {
      uuid = (await redisClient.executeIsolated(isolatedClient => isolatedClient.brPop(queueKey, timeout)))?.element;
    }
  } catch(err) {
    console.log(`Dequeue err on key ${queueKey} - ${err}`);
    return;
  }

  if(!uuid) return;
  let entryKey = `${queueKey}-entry:${uuid}`;

  let res = []; 
  try {
    res = await redisClient.multi()
      .json.get(entryKey, { path: [ '.' ] })
      .del(entryKey)
      .exec()
  } catch(err) {
    console.log(`Dequeue err on key ${entryKey} - ${err}`);
    return;
  }


  if(res[0] && res[1] && res[1].toString() === '0') {
    console.log(`Error deleting key ${entryKey}`);
  } else if(res[0]) {
    return res[0] as Message;
  } 
}