import { Snowflake } from 'discord.js';
import * as queue from './message_queue';
import { DiscordResponse } from './interactions';

export interface PlaylistEntry {
  youtubeVideoId: string;
  youtubeVideoTitle: string;
  interactionId: Snowflake;
}


export async function addSong(channelId: Snowflake, songs: PlaylistEntry[], inFront = false): Promise<Array<DiscordResponse>> {
  let responses = await queue.enqueue(channelId, songs, inFront);
  let discordResponses: DiscordResponse [] = [];
  for(let response of responses) {
    let status = response.status;
    let entry = response.message as PlaylistEntry;
    if(!status || status.jsonSet !== 'OK' || isNaN(status.listPush as number) || status.listPush as number <= 0) {
      discordResponses.push({ interactionId: entry.interactionId, message: `Error adding ${entry.youtubeVideoTitle} to queue.` });
    }
  }
  return discordResponses;
}


export async function getSong(channelId: Snowflake, timeout = 30): Promise<PlaylistEntry | void> {
  let response = await queue.dequeue(channelId, timeout);
  if(!response) return;

  if(response.error) {
    `Error getting song for channel ${channelId} - ${response.error}`;
    return;
  }

  if(response.message) return response.message as PlaylistEntry;
}