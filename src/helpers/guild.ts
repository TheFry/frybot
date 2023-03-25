import { search, download } from './youtube';
import { createAudioPlayer, 
  createAudioResource,
  NoSubscriberBehavior,
  AudioPlayerStatus,
  getVoiceConnection,
  joinVoiceChannel,
  VoiceConnectionStatus, 
  entersState} from '@discordjs/voice'
import { ChatInputCommandInteraction, GuildMember, MembershipScreeningFieldType } from 'discord.js';
const fs = require('fs');

const DEBUG = process.env['DEBUG'] ? true : false;
const DEBUG_GUILD = '446523561537044480';
const DEBUG_CHANNEL = '699467902977572965';
const VOICE_VOLUME = 0.28
   
exports.Guild = function(guildId: string, idleTimeout: number) {
  // Queue data. Designed to work with multiple guilds
  // Each player's key should be a string of guildID
  // Note that discordjs voice connections are not stored.
  // The library handles that for us.
  // youtubeId and song name persist to storage if enabled (not implemented yet)

  this.guildId = DEBUG ? DEBUG_GUILD : guildId;
  if(!this.guildId) throw Error('guild init - must provide guild id');
  this.audio = null;    // Call initAudio
  this.idleTimer = null;  // timer object created when player goes into idle state
  this.idleTimeout = idleTimeout || 300000;  // Default timeout of 5 minutes

  // init voice connection
  this.initAudio = async function(interaction: ChatInputCommandInteraction) {
    let connection = getVoiceConnection(`${this.guildId}`);
    const member = interaction.member as GuildMember;
    const voiceChannel = member.voice.channelId;
    if(!voiceChannel) {
      interaction.editReply({ content: "You must join a voice channel before you can play music." });
    }

    if(!connection) {
      connection = joinVoiceChannel({
        channelId: `${DEBUG ? DEBUG_CHANNEL : member.voice.channel?.id}`,
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
    this.audio = {
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
  this.addSong = async function(songName: string, youtubeId: string) {
    if(!songName || !youtubeId) {
      throw Error(`addSong error: missing input
        song: ${songName}
        songId: ${youtubeId}
      `);
    } else if(!this.audio) {
      throw Error(`addSong error: player not initialized for guild ${this.guildId}`);
    }

    this.audio.queue.push({
      songName: songName,
      youtubeId: youtubeId
    });

    // If we just added to the queue and nothing is playing, start something.
    if(!this.audio.player.checkPlayable()) {
      this.playNext(this.guildId);
    }
  }


  // Called when player enters the idle state.
  // If the queue isn't empty, play the next song.
  // Otherwise, clean up all resources associated with guild.
  this.playNext = async function() {
    if(!this.audio.player) {
      throw Error(`addSong error: player not initialized for guild ${this.guildId}`);
    }

    const song = this.audio.queue.shift();
    if(!song) {
      this.setIdleTimeout();
      return;
    }

    this.audio.source.source = await download(song.youtubeId, this.guildId);
    this.audio.source.audioResource = createAudioResource(this.audio.source.source, { inlineVolume: true,  });
    this.audio.source.audioResource.volume.setVolume(VOICE_VOLUME);
    this.audio.player.play(this.audio.source.audioResource);
    console.log(`Guild ${this.guildId} - playing ${song.songName}`);
  }


  // Helper function to clean up guild resources.
  this.cleanupAudio = function() {
    console.log(`Guild ${this.guildId} cleanup`);
    if(this.idleTimer !== null) this.setIdleTimeout(0);
    if(this.audio && this.audio.player) this.audio.player.stop();
    this.audio = null;
    try {
      let channel = getVoiceConnection(this.guildId);
      if(channel) channel.destroy();
      if(fs.existsSync(`./${this.guildId}`)) fs.rmSync(`./${this.guildId}`);
    } catch(err) {
      console.log(`Cleanup error for guild ${this.guildId} - ${err}`)
    }
  }


  // Small wrapper to set this.idleTimeout
  this.setIdleTimeout = function(time: number) {
    time = typeof time === 'undefined' ? this.idleTimeout : Number(time);
    
    if(this.idleTimer !== null) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    if(time > 0) {
      this.idleTimer = setTimeout(this.cleanupAudio.bind(this), time);
    }
  }
}

exports.guildList = [];