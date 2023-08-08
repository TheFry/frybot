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
import { dequeue, enqueue } from '../helpers/queue';

const VOICE_VOLUME = 0.28


interface AudioResources {
  player: AudioPlayer;
  readStream?: fs.ReadStream;
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


  constructor(options: ConstructorOptions) {
    this.guildId = options.guildId;
    this.channelId = options.channelId;
    this.channelName = options.channelName;
    this.idleTimeout = options.idleTimeout || 300000;  // Default timeout of 5 minutes
    this.audioResources = options.audioResources;
    this.isConnected = options.isConnected || true;
    this.redis_queueKey = `discord:channels:${this.channelId}:queue`;
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
    console.log(`Guild ${options.guildId} - audio player initialized in idle state to channel ${options.channelId} | ${options.channelName}`);
    return audioResources;
  }


  // Release a voice channel
  async releaseChannel(markFree = false) {
    const redis_watchedKey = 'frybot:reserved-channels';
    const redis_freeKey = 'frybot:free-channels';
    await redisClient.sRem(redis_watchedKey, this.channelId)
    if(markFree) await redisClient.rPush(redis_freeKey, this.channelId)
  }


  async addPlayerHandlers() {
    this.audioResources.player.on('error', err => {
      console.log(`Audio Player error channel ${this.channelId}\n${err}`);
    })

    this.audioResources.player.on(AudioPlayerStatus.Idle, async (oldSate) => {
      switch(oldSate.status) {
        case AudioPlayerStatus.Playing:
          try {
            await this.playNext();
          } catch(err) {
            console.log(`Failed playing song - ${err}`);
            this.cleanupAudio();
            await this.releaseChannel(true);
          } 
          break;
        case AudioPlayerStatus.Buffering:
          console.log('Was buffering or something');
      }
    })
  }


  // Called when player enters the idle state. After playing
  // If the queue isn't empty, play the next song.
  // Otherwise, clean up all resources associated with guild.
  async playNext(): Promise<void> {
    let retries = 3;

    let entry = await dequeue(this.channelId, this.idleTimeout);
    if(!entry) {
      await this.cleanupAudio();
      await this.releaseChannel();
      delete voicebotList[this.channelId];
      return;
    }
    
    while(retries > 0) {
      try {
        this.audioResources.readStream = await download(entry.youtubeVideoId, this.guildId);
        break;
      } catch(err) {
        console.log(err);
        retries--;
      }
    }

    // Failed downloading youtube video. For now, just skip the video
    if(!this.audioResources.readStream) {
      console.log(`Skipping ${entry.youtubeVideoId}`);
      return;
    }

    try {
      this.audioResources.discordResource = createAudioResource(this.audioResources.readStream, { inlineVolume: true });
      this.audioResources.discordResource.volume?.setVolume(VOICE_VOLUME);
      this.audioResources.player.play(this.audioResources.discordResource);
    } catch(err) {
      await enqueue(this.channelId, entry, true);
      throw err;
    }

    console.log(`Guild ${this.guildId} - playing ${entry.youtubeVideoTitle}`);
  }


  // Helper function to clean up guild resources.
  cleanupAudio(): void {
    console.log(`Guild ${this.guildId} cleanup`);
    this.audioResources.player.stop();
    if(this.audioResources.readStream) this.audioResources.readStream.close();
    delete this.audioResources.readStream;
    delete this.audioResources.discordResource;
    
    try {
      let channel = getVoiceConnection(this.guildId);
      if(channel) channel.destroy();
      if(fs.existsSync(`./${this.guildId}`)) fs.rmSync(`./${this.guildId}`);
    } catch(err) {
      console.log(`Cleanup error for guild ${this.guildId} - ${err}`)
    }
  }
}

export const voicebotList: { [key: string]: VoiceBot | undefined } = {};
export const connectedGuilds: { [key: string]: boolean } = {};
