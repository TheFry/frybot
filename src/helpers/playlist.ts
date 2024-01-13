import { Snowflake } from 'discord.js';
import * as queue from './message_queue';
import { DiscordResponse } from './interactions';
import { redisClient } from './redis';
import { LogType, logConsole } from './logger';
import { hasProperties } from './common';

export interface PlaylistEntry {
  youtubeVideoId: string;
  youtubeVideoTitle: string;
  interactionId: Snowflake;
}


export async function addSong(channelId: Snowflake, songs: PlaylistEntry[], inFront = false): Promise<Array<DiscordResponse>> {
  const queueKey = `discord:channel:${channelId}:queue`
  const responses = await queue.enqueue(queueKey, songs, inFront);
  const discordResponses: DiscordResponse [] = [];
  for(const response of responses) {
    const status = response.status;
    const entry = response.message as PlaylistEntry;
    if(!status || status.jsonSet !== 'OK' || isNaN(status.listPush as number) || status.listPush as number <= 0) {
      discordResponses.push({ interactionId: entry.interactionId, content: `Error adding ${entry.youtubeVideoTitle} to queue.` });
    }
  }
  return discordResponses;
}


export async function getSong(channelId: Snowflake, timeout = 30): Promise<PlaylistEntry | void> {
  const queueKey = `discord:channel:${channelId}:queue`
  const response = await queue.dequeue(queueKey, 1, timeout);
  if(response.length === 0) return;

  if(response[0].error) {
    logConsole({ msg: `Error getting song for channel ${channelId} - ${response[0].error}`, type: LogType.Error });
    return;
  }

  const missing = hasProperties(response[0].message, ['youtubeVideoId', 'youtubeVideoTitle', 'interactionId'], true) as string[];
  if(missing.length == 0) {
    return response[0].message as PlaylistEntry;
  } else {
    logConsole({ msg: `Error getting song for channel ${channelId} - Response is missing props ${missing}` })
  }
}


export async function getBotId(channelId: Snowflake) {
  const botIdKey = `discord:channel:${channelId}:bot-id`;

  try {
    return await redisClient?.get(botIdKey);
  } catch(err) {
    logConsole({ msg: `Error getting bot id - ${err}`, type: LogType.Error });
    return null;
  }
}
