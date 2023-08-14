import { nanoid } from 'nanoid/non-secure';
import { redisClient } from './redis';

export interface Message { [key: string]: any }

export interface EnqueueResponseStatus {
  jsonSet: string | object;
  listPush: number | object;
}

export interface EnqueueResponse {
  status?: EnqueueResponseStatus;
  entryKey: string;
  message: Message;
  error?: unknown;
}

export interface DequeueResponse {
  uuid?: string;
  message?: Message;
  error?: unknown;
}

export interface EnqueueOptions {
  queueKey: string;
  entryKey: string;
  uuid: string;
  message: Message;
  inFront?: boolean;
}


export async function enqueue(queueKey: string, messages: Message[], inFront = false) {
  let responses: Array<EnqueueResponse> = [];
  for(let message of messages) {
    let uuid = nanoid();
    let entryKey = `${queueKey}-entry:${uuid}`;
    let status;
    try {
      status = await redisClient?.enqueue(queueKey, entryKey, uuid, JSON.stringify(message), inFront.toString());
    } catch(err) {
      responses.push({ entryKey, message, error: err });
      continue;
    }
    if(!status) {
      responses.push({ entryKey, message, error: new Error(`Enqueue Error - no response from server for ${entryKey}`) })
    } else {
      responses.push({ entryKey,  message, status: { jsonSet: status[0], listPush: status[1] } });
    }
  }
  return responses;
}


export async function dequeue(queueKey: string, timeout?: number): Promise<DequeueResponse> {
  let uuid: string | null = null;
  try {
    if(timeout === undefined) {
      uuid = await redisClient?.rpop(queueKey) as string | null;
    } else {
      let res = await redisClient?.duplicate().brpop(queueKey, timeout);
      if(res) uuid = res[1];
    }
  } catch(err) {
    return { error: err };
  }

  if(!uuid) return { };

  let entryKey = `${queueKey}-entry:${uuid}`;
  let res = []; 
  try {
    res = await redisClient?.multi()
      .call('JSON.GET', entryKey)
      .del(entryKey)
      .exec() as any
  } catch(err) {
    return {
      uuid: uuid,
      error: err
    }
  }

  return {
    uuid: uuid,
    message: JSON.parse(res[0][1]) as Message,
    error: res[1] as number <= 0 ? new Error(`Error deleting key ${entryKey}. It doesn't exist.`) : undefined
  }
}