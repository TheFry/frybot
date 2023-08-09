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