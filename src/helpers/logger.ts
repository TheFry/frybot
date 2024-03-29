import { Snowflake, TextChannel } from "discord.js";
import { DiscordClient } from "./common";

const DEBUG_COLOR = '37';
const WARN_COLOR = '33';
const ERR_COLOR = '31';
const LOG_LEVEL = Number(process.env['LOG_LEVEL']) || 1;

export enum LogType {
  Error = 1,
  Warn,
  Debug,
}

export interface LogOptions {
  msg: string;
  type?: LogType;
}

export interface DCLogOptions extends LogOptions {
  dcErrorChannel: Snowflake;
  dcClient: DiscordClient;
}


function ts() { return `[${new Date().toUTCString().split(' ').slice(1).join(' ')}]`; }


export async function logBoth(options: DCLogOptions) {
  logConsole(options);
  await logDiscord(options);
}


export async function logDiscord(options: DCLogOptions) {
  const msg = `${ts()} ${options.msg}`;
  if(options.dcClient && options.dcErrorChannel) {
    let channel;
    let error;
    try {
      channel = await options.dcClient.channels.fetch(options.dcErrorChannel) as TextChannel; 
    } catch(err) { 
      error = err;
    }
    
    if(error || !channel || !channel.isTextBased()) {
      const msg = `ErROr SEndInG eRrOR MeSsAgE tO DisCoRD ChAnNeL - ${error ? error : options.dcErrorChannel}`;
      logConsole({msg, type: LogType.Error});
      return;
    }

    try {
      await channel.send(msg);
    } catch(err) {  
      const msg = `ErROr SEndInG eRrOR MeSsAgE tO DisCoRD ChAnNeL - ${err}`;
      logConsole({msg, type: LogType.Error});
      return;
    }
  }
}


export function logConsole(options: LogOptions) {
  const msg = `${ts()} ${options.msg}`;
  const logType = options.type || LogType.Debug;
  switch(logType) {
    case LogType.Debug:
      if(LOG_LEVEL >= LogType.Debug) console.debug(`\x1b[${DEBUG_COLOR}m%s\x1b[0m`, msg);
      break;
    case LogType.Warn:
      if(LOG_LEVEL >= LogType.Warn)  console.warn(`\x1b[${WARN_COLOR}m%s\x1b[0m`, msg);
      break;
    case LogType.Error:
      if(LOG_LEVEL >= LogType.Error) console.error(`\x1b[${ERR_COLOR}m%s\x1b[0m`, msg);
      break;
  }
}