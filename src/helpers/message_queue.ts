import { nanoid } from 'nanoid/non-secure';
import { redisClient } from './redis';

export interface Message { [key: string]: any }

export interface EnqueueResponseStatus {
  jsonSet: string | object;
  listPush: number;
}

export interface EnqueueResponse {
  status: EnqueueResponseStatus | null;
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
    let status: EnqueueResponseStatus;
    try {
      status = await redisClient.enqueue({ queueKey, entryKey, uuid, message, inFront });
    } catch(err) {
      responses.push({ status: null, message: message, error: err });
      continue;
    }
    responses.push({ status, message });
  }
  return responses;
}


export async function dequeue(queueKey: string, timeout?: number): Promise<DequeueResponse> {
  let uuid: string | null = null;
  try {
    if(timeout === undefined) {
      uuid = await redisClient.rPop(queueKey);
    } else {
      let res = await redisClient.executeIsolated(isolatedClient => isolatedClient.brPop(queueKey, timeout));
      if(res) uuid = res.element;
    }
  } catch(err) {
    return { error: err };
  }

  if(!uuid) return { };

  let entryKey = `${queueKey}-entry:${uuid}`;
  let res = []; 
  try {
    res = await redisClient.multi()
      .json.get(entryKey, { path: [ '.' ] })
      .del(entryKey)
      .exec()
  } catch(err) {
    return {
      uuid: uuid,
      error: err
    }
  }

  return {
    uuid: uuid,
    message: res[0] as Message,
    error: res[1] as number <= 0 ? new Error(`Error deleting key ${entryKey}. It doesn't exist.`) : undefined
  }
}