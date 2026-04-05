import { Client, Snowflake } from 'discord.js';
import { YTSearchResult } from './youtube';
import { LogType, logConsole } from './logger';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class DiscordClient extends Client { commands: any; }


export interface ChannelEvent {
	type: 'stop' | 'skip' | 'pause' | 'unpause' | 'replay';
	channelId: Snowflake;
  interactionId?: Snowflake;
}

export interface ClipJob {
  video: YTSearchResult;
  startTime: string;
  duration: number;
  interactionId: Snowflake;
}

export const FREE_CHANNELS_KEY = 'frybot:free-channels';
export const WATCHED_CHANNELS_KEY = 'frybot:reserved-channels';
export const CHANNEL_EVENT_KEY = 'discord:channel-events';
export const CLIP_QUEUE_KEY =  'frybot:clip-jobs-queue';
export const INTERACTION_QUEUE_KEY = 'frybot:interaction-queue';
export const MEDIA_DIR = '/frybot_media';

function usage(missing: string): void {
  logConsole({ msg: `
  Missing variable ${missing}
	Usage: DC_TOKEN=<bot token> \\
		  DC_CLIENT=<bot client id> \\
		  G_ID=<bot guild id> \\
		  YT_TOKEN=<youtube key> \\
		  MONGO_CONN_STRING=<mongodb conn string> \\
		  node ${__dirname}/main.js
	`, type: LogType.Error});
}

export function checkVars(): void {
  if (!process.env['DC_TOKEN']) usage('DC_TOKEN');
  if (!process.env['DC_CLIENT']) usage('DC_CLIENT');
  if (!process.env['YT_TOKEN']) usage('YT_TOKEN');
  if (!process.env['G_ID']) usage('G_ID');
}


export function timeConverter(time : string): TimeConverterReturn {
  let hours = '00';
  let minutes = '00';
  let seconds = '00';

  const isDigits = (s: string) => /^\d+$/.test(s);

  const parts = time.split(':');
  if(parts.length === 1 && isDigits(parts[0])) {
    // SS or S — seconds only
    seconds = parts[0].padStart(2, '0');
  } else if(parts.length === 2 && parts.every(isDigits)) {
    // MM:SS or M:SS
    minutes = parts[0].padStart(2, '0');
    seconds = parts[1].padStart(2, '0');
  } else if(parts.length >= 3 && parts.every(isDigits)) {
    // HH:MM:SS or H:MM:SS
    hours = parts[0].padStart(2, '0');
    minutes = parts[1].padStart(2, '0');
    seconds = parts[2].padStart(2, '0');
  }
  // Invalid input falls through, returning the 00:00:00 defaults

  const str = `${hours}:${minutes}:${seconds}`;
  const num = Number.parseInt(seconds, 10) + Number.parseInt(minutes, 10) * 60 + Number.parseInt(hours, 10) * 60 * 60;
  return { str, num };
}


export function hasProperties(object: unknown, properties: string | string[], returnMissing = false): boolean | string[] {
  if(typeof properties === 'string') properties = [properties];
  const missingProperties: string[] = [];

  for(const property of properties) {
    const levels = property.split('.');
    let tempObj: { [key: string]: unknown } = object as { [key: string]: unknown };
    let missing = false;
    for(let i = 0; i < levels.length; i++) {
      if(typeof tempObj !== 'object' || tempObj === null) {
        missing = true;
        break;
      }
      if(levels[i] in tempObj) {
        tempObj = tempObj[levels[i]] as { [key: string]: unknown };
      } else {
        missing = true;
        break;
      }
    }
    if(missing && returnMissing) missingProperties.push(property);
    else if(missing) return false;
  }
  if(returnMissing) {
    return missingProperties;
  }
  return true;
}


export interface TimeConverterReturn {
  str: string;
  num: number;
}
