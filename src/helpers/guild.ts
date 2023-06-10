import { download } from './youtube';
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

import { Mutex } from 'async-mutex';

import { GuildMember } from 'discord.js';
import fs from 'fs';



const DEBUG = process.env['DEBUG'] ? true : false;
const DEBUG_GUILD = '446523561537044480';
// const DEBUG_CHANNEL = '805526809667829780';
const VOICE_VOLUME = 0.28

interface QueueEntry {
  songName: string;
  youtubeId: string;
}

interface GuildAudio {
  player?: AudioPlayer;
  source: {
    readStream?: fs.ReadStream;
    audioResource?: AudioResource;
  }
  queue: QueueEntry [];
  channelId?: string;
  channelName?: string;
}

   
export class Guild {
  // Queue data. Designed to work with multiple guilds
  // Each player's key should be a string of guildID
  // Note that discordjs voice connections are not stored.
  // The library handles that for us.
  // youtubeId and song name persist to storage if enabled (not implemented yet)
  guildId: string;
  idleTimeout: number;
  soundBiteFile: string;
  #idleTimer: NodeJS.Timeout | null = null;
  initAudioMutex = new Mutex();  
  audio: GuildAudio = {
    queue: [],
    source: {}
  }

  constructor(guildId: string, idleTimeout: number = 30000) {
    this.guildId = DEBUG ? DEBUG_GUILD : guildId;
    this.idleTimeout = idleTimeout || 300000;  // Default timeout of 5 minutes
    this.soundBiteFile = "";
  }

  // init voice connection
  async initAudio(member: GuildMember, channelId: string | null = null): Promise<void> {
    const release = await this.initAudioMutex.acquire();
    let connection = getVoiceConnection(this.guildId);
    const voiceChannel = channelId ? channelId : member.voice.channelId;

    if(this.audio.player && connection) {
      release();
      return;
    }

    if(!voiceChannel) {
      release();
      throw Error('ERROR initAudio - cannot get voice channel Id');
    }

    if(!connection) {
      connection = joinVoiceChannel({
        channelId: voiceChannel,
        guildId: this.guildId,
        adapterCreator: member.guild.voiceAdapterCreator
      });
      await entersState(connection, VoiceConnectionStatus.Ready, 5000);
    }

    // init audio player
    if(!this.audio.player) {
      try {
        this.audio.player = createAudioPlayer({
          behaviors: {
            noSubscriber: NoSubscriberBehavior.Pause,
          },
        });
        await entersState(this.audio.player, AudioPlayerStatus.Idle, 5000);
        connection.subscribe(this.audio.player);
        console.log(`Guild ${this.guildId} - audio player initialized in idle state to channel ${member.voice.channel?.id} | ${member.voice.channel?.name}`);
      } catch(err) {
        connection.destroy();
        if(this.audio.player) this.audio.player.stop();
        this.audio.player = undefined;
        release();
        throw err;
      }

      this.audio.player.on(AudioPlayerStatus.Idle, () => {
        this.playNext();
      });
    }
    release();
  }


  // Add song data (name and youtube id) to guild's queue
  async addSong(songName: string, youtubeId: string): Promise<void> {
    if(!songName || !youtubeId) {
      throw Error(`addSong error: missing input
        song: ${songName}
        songId: ${youtubeId}
      `);
    } 
    
    this.audio.queue.push({
      songName: songName,
      youtubeId: youtubeId
    });

    // If we just added to the queue and nothing is playing, start something.
    if(this.checkInitAudio() && this.audio.player?.state.status === AudioPlayerStatus.Idle) {
      this.playNext();
    }
  }


  getQueue(): Array<QueueEntry> {
    return this.audio?.queue || []
  }


  // Called when player enters the idle state.
  // If the queue isn't empty, play the next song.
  // Otherwise, clean up all resources associated with guild.
  async playNext(): Promise<void> {
    if(!this.checkInitAudio()) {
      throw Error(`playNext error: player not initialized for guild ${this.guildId}`);
    }
    const song = this.audio.queue.shift();
    if(!song) {
      this.setIdleTimeout();
      return;
    }

    if(!this.audio.source) this.audio.source = {}
    this.audio.source.readStream = await download(song.youtubeId, this.guildId);
    this.audio.source.audioResource = createAudioResource(this.audio.source.readStream, { inlineVolume: true });
    this.audio.source.audioResource.volume?.setVolume(VOICE_VOLUME);
    this.audio.player?.play(this.audio.source.audioResource);
    console.log(`Guild ${this.guildId} - playing ${song.songName}`);
  }


  // Helper function to clean up guild resources.
  cleanupAudio(): void {
    console.log(`Guild ${this.guildId} cleanup`);
    if(this.#idleTimer !== null) this.setIdleTimeout(0);
    if(this.audio && this.audio.player) this.audio.player.stop();
    if(this.audio.source.readStream) this.audio.source.readStream.destroy();
    this.audio.source.audioResource = undefined; 
    this.audio.player = undefined;
    this.audio.queue = [];
    this.audio.source = {};
    this.audio.channelId = undefined;
    this.audio.channelName = undefined;
    
    try {
      let channel = getVoiceConnection(this.guildId);
      if(channel) channel.destroy();
      if(fs.existsSync(`./${this.guildId}`)) fs.rmSync(`./${this.guildId}`);
    } catch(err) {
      console.log(`Cleanup error for guild ${this.guildId} - ${err}`)
    }
  }


  // Small wrapper to set this.idleTimeout
  setIdleTimeout(time: number = this.idleTimeout): void {    
    if(this.#idleTimer !== null) {
      clearTimeout(this.#idleTimer);
      this.#idleTimer = null;
    }
    if(time > 0) {
      this.#idleTimer = setTimeout(this.cleanupAudio.bind(this), time);
    }
  }


  checkTimeout(): boolean {
    if (!this.#idleTimer) return true
    else return false
  }


  checkInitAudio(): boolean {
    let connection = getVoiceConnection(this.guildId);
    if(this.audio.player && connection) return true;
    else return false
  }
  async setSoundBite(fileName : string){
    this.soundBiteFile = fileName;
  }
  async getSoundBite(): Promise<string>{
    return this.soundBiteFile;
  }
}

export const guildList: { [key: string]: Guild | undefined } = {};