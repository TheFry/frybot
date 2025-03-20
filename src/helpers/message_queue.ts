
import { randomBytes } from 'crypto';
import { redisClient } from './redis';

export interface EnqueueResponseStatus {
  jsonSet: string | object;
  listPush: number | object;
}

export interface EnqueueResponse {
  status?: EnqueueResponseStatus;
  entryKey: string;
  message: unknown;
  error?: string;
}

export interface DequeueResponse {
  uuid?: string;
  message?: unknown;
  error?: string;
}

export interface EnqueueOptions {
  queueKey: string;
  entryKey: string;
  uuid: string;
  message: unknown;
  inFront?: boolean;
}


export async function enqueue(queueKey: string, messages: unknown[], inFront = false) {
  const responses: Array<EnqueueResponse> = [];
  for(const message of messages) {
    const uuid = randomBytes(8).toString('base64url');
    const entryKey = `${queueKey}-entry:${uuid}`;
    let status;
    try {
      status = await redisClient?.enqueue(queueKey, entryKey, uuid, JSON.stringify(message), inFront.toString());
    } catch(err) {
      responses.push({ entryKey, message, error: `${err}` });
      continue;
    }
    if(!status) {
      responses.push({ entryKey, message, error: `Enqueue Error - no response from server for ${entryKey}` })
    } else {
      responses.push({ entryKey,  message, status: { jsonSet: status[0], listPush: status[1] } });
    }
  }
  return responses;
}


export async function dequeue(queueKey: string, count: number, timeout?: number): Promise<DequeueResponse[]> {
  const responses: DequeueResponse [] = [];
  
  if(count < 0) {
    try {
      count = await redisClient?.llen(queueKey) || 0;
    } catch(err) {
      count = 0;
    }
  }

  while(count > 0) {
    let uuid: string | null = null;
    try {
      if(timeout === undefined || timeout < 0) {
        uuid = await redisClient?.rpop(queueKey) as string | null;
      } else {
        const tempClient = await redisClient?.duplicate(); 
        const res = await tempClient?.brpop(queueKey, timeout);
        tempClient?.disconnect();
        if(res) uuid = res[1];
      }
    } catch(err) {
      responses.push({ error: `${err}` });
      count--;
      continue;
    }
  
    if(!uuid) {
      break;
    }
  
    const entryKey = `${queueKey}-entry:${uuid}`;
    let res; 
    try {
      res = await redisClient?.multi()
        .call('JSON.GET', entryKey)
        .del(entryKey)
        .exec()
    } catch(err) {
      responses.push({
        uuid: uuid,
        error: `${err}`
      });
      count--;
      continue;
    }

    if(res) {
      const [jsonErr, jsonRes] = res[0];
      const delErr = res[1][0];
      let errorString = '';

      if(jsonErr) errorString += `dequeue JSON.GET error for entryKey ${entryKey} - ${jsonErr}\n`;
      if(delErr) errorString += `dequeue del error for entryKey ${entryKey} - ${delErr}`;

      responses.push({
        uuid: uuid,
        message: JSON.parse(jsonRes as string),
        error: errorString === '' ? undefined : errorString
      })
    } else {
      responses.push({
        uuid: uuid,
        error: 'Dequeue Error - no response from server'
      })
    }
    count--;
  }

  return responses;
}