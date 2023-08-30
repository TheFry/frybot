import { Snowflake } from 'discord.js';
import * as queue from './message_queue';
import { DiscordResponse } from './interactions';
import { redisClient } from './redis';

export interface PlaylistEntry {
  youtubeVideoId: string;
  youtubeVideoTitle: string;
  interactionId: Snowflake;
}


export async function addSong(channelId: Snowflake, songs: PlaylistEntry[], inFront = false): Promise<Array<DiscordResponse>> {
  let queueKey = `discord:channel:${channelId}:queue`
  let responses = await queue.enqueue(queueKey, songs, inFront);
  let discordResponses: DiscordResponse [] = [];
  for(let response of responses) {
    let status = response.status;
    let entry = response.message as PlaylistEntry;
    if(!status || status.jsonSet !== 'OK' || isNaN(status.listPush as number) || status.listPush as number <= 0) {
      discordResponses.push({ interactionId: entry.interactionId, content: `Error adding ${entry.youtubeVideoTitle} to queue.` });
    }
  }
  return discordResponses;
}


export async function getSong(channelId: Snowflake, timeout = 30): Promise<PlaylistEntry | void> {
  let queueKey = `discord:channel:${channelId}:queue`
  let response = await queue.dequeue(queueKey, 1, timeout);
  if(response.length === 0) return;

  if(response[0].error) {
    `Error getting song for channel ${channelId} - ${response[0].error}`;
    return;
  }

  if(response[0].message) return response[0].message as PlaylistEntry;
}


export async function getBotId(channelId: Snowflake) {
  let botIdKey = `discord:channel:${channelId}:bot-id`;

  try {
    return await redisClient?.get(botIdKey);
  } catch(err) {
    console.log(`Error getting bot id - ${err}`);
    return null;
  }
}
