import { Client, Snowflake } from 'discord.js';
import { YTSearchResult } from './youtube';

export class DiscordClient extends Client { commands: any };

export interface ChannelEvent {
	eventName: string;
	channelId: Snowflake;
  interactionId: Snowflake;
}

export interface ClipJob {
  video: YTSearchResult;
  startTime: string;
  duration: Number;
  interactionId: Snowflake;
}

export const CHANNEL_EVENT_KEY = 'discord:channel-events';
export const CLIP_QUEUE_KEY =  'frybot:clip-jobs-queue';
export const INTERACTION_QUEUE_KEY = 'frybot:interaction-queue';
export const MEDIA_DIR = '/frybot_media';

function usage(missing: string): void {
  console.log(`
  Missing variable ${missing}
	Usage: DC_TOKEN=<bot token> \\
		  DC_CLIENT=<bot client id> \\
		  G_ID=<bot guild id> \\
		  YT_TOKEN=<youtube key> \\
		  MONGO_CONN_STRING=<mongodb conn string> \\
		  node ${__dirname}/main.js
	`);
}

export function checkVars(): void {
  process.env['DC_TOKEN'] || usage('DC_TOKEN'); 
  process.env['DC_CLIENT'] || usage('DC_CLIENT');
  process.env['YT_TOKEN'] || usage('YT_TOKEN');
  process.env['G_ID'] || usage('G_ID');
  // process.env['MONGO_CONN_STRING'] || usage();
}


export function timeConverter(time : string): TimeConverterReturn {
  let hours = "00";
  let minutes = "00";
  let seconds = "00";
  let str: string, num: number;
  if(time.length <= 3) {
    seconds = time.length == 1? `0`+time : time.substring(6, 8);
  } else if(time.length<=6) {
    minutes = time.length == 4? `0`+time[3]: time.substring(3,5);
    seconds = time.substring(0,2);
  } else if(time.length <= 8) {
    hours = time.length == 7? `0`+time[0]: time.substring(0, 2);
    minutes = time.substring(3,5);
    seconds = time.substring(6, 8);
  }
  str = `${hours}:${minutes}:${seconds}`;
  num = parseInt(seconds)+ parseInt(minutes)*60 + parseInt(hours)*60*60;
  return { str:str, num:num };
}


export interface TimeConverterReturn {
  str: string;
  num: number;
}
