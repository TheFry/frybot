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
  entersState} from '@discordjs/voice'
import { ChatInputCommandInteraction, GuildMember, MembershipScreeningFieldType } from 'discord.js';
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
  player: AudioPlayer;
  source: {
    readStream?: fs.ReadStream;
    audioResource?: AudioResource;
  }
  idle: boolean;
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
  guildId: string
  idleTimeout: number
  #audio: GuildAudio | null = null;
  #idleTimer: NodeJS.Timeout | null = null;

  constructor(guildId: string, idleTimeout: number = 30000) {
    this.guildId = DEBUG ? DEBUG_GUILD : guildId;
    this.idleTimeout = idleTimeout || 300000;  // Default timeout of 5 minutes
  }


  // init voice connection
  async initAudio(interaction: ChatInputCommandInteraction): Promise<void> {
    let connection = getVoiceConnection(`${this.guildId}`);
    const member = interaction.member as GuildMember;
    const voiceChannel = member.voice.channelId;
    if(!voiceChannel) {
      interaction.editReply({ content: "You must join a voice channel before you can play music." });
    }

    if(!connection) {
      connection = joinVoiceChannel({
        channelId: `${member.voice.channel?.id}`,
        guildId: `${this.guildId}`,
        adapterCreator: member.guild.voiceAdapterCreator
      });
      await entersState(connection, VoiceConnectionStatus.Ready, 5000);
    }

    // init audio player
    let player = null;
    try {
      player = createAudioPlayer({
        behaviors: {
          noSubscriber: NoSubscriberBehavior.Pause,
        },
      });
      await entersState(player, AudioPlayerStatus.Idle, 5000);
      connection.subscribe(player);
      console.log(`Guild ${this.guildId} - audio player initialized in idle state to channel ${member.voice.channel?.id} | ${member.voice.channel?.name}`);
    } catch(err) {
      connection.destroy();
      if(player) player.stop();
      throw err;
    }

    // Note: we don't keep track of voice connection
    // discord.js does this for us with getVoiceConnection
    this.#audio = {
      player: player,
      source: {},
      idle: true,
      queue: [],
      channelId: member.voice.channel?.id,
      channelName: member.voice.channel?.name
    }

    player.on(AudioPlayerStatus.Idle, () => {
      this.playNext();
    });
  }


  // Add song data (name and youtube id) to guild's queue
  async addSong(songName: string, youtubeId: string): Promise<void> {
    if(!songName || !youtubeId) {
      throw Error(`addSong error: missing input
        song: ${songName}
        songId: ${youtubeId}
      `);
    } else if(this.#audio === null) {
      throw Error(`addSong error: player not initialized for guild ${this.guildId}`);
    }
    this.#audio.queue.push({
      songName: songName,
      youtubeId: youtubeId
    });

    // If we just added to the queue and nothing is playing, start something.
    if(!this.#audio.player.checkPlayable()) {
      this.playNext();
    }
  }


  getQueue(): Array<QueueEntry> {
    return this.#audio?.queue || []
  }


  // Called when player enters the idle state.
  // If the queue isn't empty, play the next song.
  // Otherwise, clean up all resources associated with guild.
  async playNext(): Promise<void> {
    if(!this.#audio || !this.#audio.player) {
      throw Error(`playNext error: player not initialized for guild ${this.guildId}`);
    }
    const song = this.#audio.queue.shift();
    if(!song) {
      this.setIdleTimeout();
      return;
    }

    this.#audio.source.readStream = await download(song.youtubeId, this.guildId);
    this.#audio.source.audioResource = createAudioResource(this.#audio.source.readStream, { inlineVolume: true });
    this.#audio.source.audioResource.volume?.setVolume(VOICE_VOLUME);
    this.#audio.player.play(this.#audio.source.audioResource);
    console.log(`Guild ${this.guildId} - playing ${song.songName}`);
  }


  // Helper function to clean up guild resources.
  cleanupAudio(): void {
    console.log(`Guild ${this.guildId} cleanup`);
    if(this.#idleTimer !== null) this.setIdleTimeout(0);
    if(this.#audio && this.#audio.player) this.#audio.player.stop();
    this.#audio = null;
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
    if(this.#audio) return true;
    else return false
  }

  checkPlayable(): boolean {
    if(this.#audio?.player.checkPlayable()) return true
    else return false 
  }
}

export const guildList: { [key: string]: Guild | undefined } = {};