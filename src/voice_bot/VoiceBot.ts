import fs from 'fs';
import { 
  AudioPlayer,
  AudioResource,
  createAudioPlayer, 
  createAudioResource,
  NoSubscriberBehavior,
  AudioPlayerStatus,
  getVoiceConnection,
  joinVoiceChannel,
  VoiceConnectionStatus, 
  entersState } from '@discordjs/voice';

import { InternalDiscordGatewayAdapterCreator, Snowflake } from 'discord.js';

import { client } from './main';
import { download } from '../helpers/youtube';
import { redisClient } from '../helpers/redis';
import { getSong, addSong, PlaylistEntry } from '../helpers/playlist';
import { dequeue } from '../helpers/message_queue';
import { Mutex } from 'async-mutex';
import { List } from '../helpers/list';
import { ChannelEvent } from '../helpers/common';
import { LogType, logConsole } from '../helpers/logger';
import { EventEmitter, once } from 'events';
import { Readable } from 'stream';

const VOICE_VOLUME = 0.15;
const CANCEL_WATCH_EVENT = 'stop';


interface AudioResources {
  player: AudioPlayer;
  readStream?: Readable;
  discordResource?: AudioResource;
}

interface InitOptions {
  channelId: Snowflake;
  guildId: Snowflake;
  voiceAdapter: InternalDiscordGatewayAdapterCreator;
  idleTimeout: number;
}

interface ConstructorOptions {
  channelId: Snowflake;
  channelName: string;
  guildId: Snowflake;
  idleTimeout?: number;
  audioResources: AudioResources;
  isConnected?: boolean
}

interface ConnectOptions {
  channelId: Snowflake;
  guildId: Snowflake;
  voiceAdapter: InternalDiscordGatewayAdapterCreator;
  channelName?: string;
}

export class VoiceBot {
  guildId: Snowflake;
  channelId: Snowflake;
  isConnected: boolean;
  idleTimeout: number;
  channelName: string;
  audioResources: AudioResources;
  redis_queueKey: string;
  resourceLock: Mutex;
  eventList: List<ChannelEvent>;
  readyForEvents: boolean;
  cancelWatch: EventEmitter;


  constructor(options: ConstructorOptions) {
    this.guildId = options.guildId;
    this.channelId = options.channelId;
    this.channelName = options.channelName;
    this.idleTimeout = options.idleTimeout || 30;  // Default timeout of 5 minutes
    this.audioResources = options.audioResources;
    this.isConnected = options.isConnected || true;
    this.redis_queueKey = `discord:channel:${this.channelId}:queue`;
    this.resourceLock = new Mutex();
    this.eventList = new List();
    this.readyForEvents = false;
    this.cancelWatch = new EventEmitter();
  }

  
  static async init(options: InitOptions): Promise<VoiceBot> {
    let channel = await client.channels.fetch(options.channelId);
    if(!channel) throw Error(`VoiceBotInitError - Channel ${options.channelId}. The bot might not be connected to guild ${options.guildId}`);
    if(!channel.isVoiceBased()) throw Error(`VoiceBotInitError - Channel ${options.channelId} is not a voice channel!`);
    let audioResources = await VoiceBot.connect({
      channelId: options.channelId, 
      guildId: options.guildId, 
      voiceAdapter: options.voiceAdapter,
      channelName: channel.name
    }) as AudioResources;
    
    let bot = new VoiceBot({
      channelId: options.channelId,
      channelName: channel.name,
      guildId: options.guildId,
      idleTimeout: options.idleTimeout,
      audioResources: audioResources,
      isConnected: true
    })

    await bot.addPlayerHandlers();
    return bot;
  }


  // init voice connection
  static async connect(options: ConnectOptions): Promise<AudioResources> {
    let connection = getVoiceConnection(options.guildId);
    if(!connection) {
      connection = joinVoiceChannel({
        channelId: options.channelId,
        guildId: options.guildId,
        adapterCreator: options.voiceAdapter
      });
      await entersState(connection, VoiceConnectionStatus.Ready, 5000);
    }

    // init audio player
    let player = createAudioPlayer({
      behaviors: {
        noSubscriber: NoSubscriberBehavior.Pause,
      },
    });

    await entersState(player, AudioPlayerStatus.Idle, 5000);
    let audioResources = { player: player };
    connection.subscribe(player);
    logConsole({msg: `Guild ${options.guildId} - audio player initialized in idle state to channel ${options.channelId} | ${options.channelName}`});
    return audioResources;
  }


  // Release a voice channel
  async releaseChannel(markFree = false) {
    const redis_watchedKey = 'frybot:reserved-channels';
    const redis_freeKey = 'frybot:free-channels';
    await redisClient?.srem(redis_watchedKey, this.channelId)
    if(markFree) await redisClient?.rpush(redis_freeKey, this.channelId)
  }


  async addPlayerHandlers() {
    this.audioResources.player.on('error', err => {
      logConsole({ msg: `Audio Player error channel ${this.channelId}`, type: LogType.Error });
      logConsole({ msg: `${err}`, type: LogType.Error });
    })

    this.audioResources.player.on(AudioPlayerStatus.Idle, async (oldSate) => {
      switch(oldSate.status) {
        case AudioPlayerStatus.Playing:
          await this.resourceLock.acquire();
          try {
            await this.playNext();
          } catch(err) {
            logConsole({ msg: `Failed playing song - ${err}`, type: LogType.Error });
            this.cleanupAudio();
            await this.releaseChannel(true);
          } 
          await this.resourceLock.release();
          break;
        case AudioPlayerStatus.Buffering:
          logConsole({ msg: 'Was buffering or something', type: LogType.Error });
      }
    })
  }


  // Called when player enters the idle state. After playing
  // If the queue isn't empty, play the next song.
  // Otherwise, clean up all resources associated with guild.
  async playNext(skip = false): Promise<void> {
    let retries = 3;

    if(this.audioResources.player.state.status === AudioPlayerStatus.Playing && !skip) {
      return;
    }

    let promises: Promise<any> [] = [];
    promises.push(getSong(this.channelId, skip ? -1 : this.idleTimeout));
    promises.push(once(this.cancelWatch, CANCEL_WATCH_EVENT));
    let event = await Promise.race(promises);
    if(event === CANCEL_WATCH_EVENT) {
      logConsole({ msg: `playNext cancel event on channel ${this.channelId}`});
      return;
    }

    let entry = event as PlaylistEntry;
    if(!entry) {
      logConsole({ msg: `Nothing in the queue for ${this.channelId}. Cleaning up` });
      this.eventList.lpush({ type: 'stop', channelId: this.channelId });
      return;
    }
    
    while(retries > 0) {
      try {
        this.audioResources.readStream = await download(entry.youtubeVideoId, this.guildId);
        break;
      } catch(err) {
        logConsole({ msg: `${err}`, type: LogType.Error });
        retries--;
      }
    }

    // Failed downloading youtube video. For now, just skip the video
    if(!this.audioResources.readStream) {
      logConsole({ msg: `Skipping ${entry.youtubeVideoId}`, type: LogType.Warn });
      return;
    }

    try {
      this.audioResources.discordResource = createAudioResource(this.audioResources.readStream, { inlineVolume: true });
      this.audioResources.discordResource.volume?.setVolume(VOICE_VOLUME);
      this.audioResources.player.play(this.audioResources.discordResource);
    } catch(err) {
      await addSong(this.channelId, [entry], true);
      throw err;
    }

    logConsole({ msg: `Channel ${this.channelId} - playing ${entry.youtubeVideoTitle}`, type: LogType.Debug });
  }


  async stop(interactionId?: Snowflake) {
    this.readyForEvents = false;
    this.cancelWatch.emit(CANCEL_WATCH_EVENT);
    this.cleanupAudio();
    this.eventList.abortBlocks();
    await dequeue(`${this.redis_queueKey}`, -1);
    await this.releaseChannel();
    delete connectedGuilds[this.channelId];
    delete voicebotList[this.channelId];
  }

  
  async pause(unpause = false, interactionId?: Snowflake) {
    let currentState = this.audioResources.player.state.status;
    let status;
    if(unpause && currentState == AudioPlayerStatus.Paused) {
      status = this.audioResources.player.unpause();
    } else if(!unpause && currentState == AudioPlayerStatus.Playing) {
      status = this.audioResources.player.pause();
    }
    
    if(!status) { 
      let msg = `Error ${unpause ? 'unpausing' : 'pausing'} the queue`
      logConsole({ msg: `Channel ${this.channelId} - ${msg}`, type: LogType.Error }) 
    } else {
      let msg = `Queue is ${unpause ? 'unpaused' : 'paused'}`
      logConsole({ msg: `Channel ${this.channelId} - ${msg}`, type: LogType.Debug }) 
    }
  }


  // Helper function to clean up guild resources.
  cleanupAudio(): void {
    logConsole({ msg: `Guild ${this.guildId} cleanup`, type: LogType.Debug });
    this.audioResources.player.removeAllListeners(AudioPlayerStatus.Idle);
    this.audioResources.player.stop();
    if(this.audioResources.readStream) this.audioResources.readStream.destroy();
    delete this.audioResources.readStream;
    delete this.audioResources.discordResource;
    
    try {
      let channel = getVoiceConnection(this.guildId);
      if(channel) channel.destroy();
      if(fs.existsSync(`./${this.guildId}`)) fs.rmSync(`./${this.guildId}`);
    } catch(err) {
      logConsole({ msg: `Cleanup error for guild ${this.guildId} - ${err}`, type: LogType.Error })
    }
  }


  async processEvents(): Promise<void> {
    while(this.readyForEvents) {
      let event = await this.eventList.brpop();
      if(!event) continue;
      
      switch(event.type) {
        case 'stop':
          this.readyForEvents = false;
          await this.stop();
          break;
        case 'skip':
          await this.playNext(true);
          break;
        case 'pause':
          await this.pause(false, event.interactionId);
          break;
        case 'unpause':
          await this.pause(true, event.interactionId);
          break;
      }
    }
  }
}

export const voicebotList: { [key: string]: VoiceBot | undefined } = {};
export const connectedGuilds: { [key: string]: boolean } = {};
