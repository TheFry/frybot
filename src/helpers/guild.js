const yt = require('./youtube');
const { createAudioPlayer, 
        createAudioResource,
        NoSubscriberBehavior,
        AudioPlayerStatus,
        getVoiceConnection,
        joinVoiceChannel,
        VoiceConnectionStatus, 
        entersState} = require('@discordjs/voice');

const DEBUG = process.env['DEBUG'] ? true : false;
const DEBUG_GUILD = '446523561537044480';
const DEBUG_CHANNEL = '805526809667829780';
   
exports.Guild = function(guildId) {
  // Queue data. Designed to work with multiple guilds
  // Each player's key should be a string of guildID
  // Note that discordjs voice connections are not stored.
  // The library handles that for us.
  // youtubeId and song name persist to storage if enabled (not implemented yet)

  this.guildId = DEBUG ? DEBUG_GUILD : guildId;
  if(!this.guildId) throw Error('guild init - must provide guild id');
  this.audio = null;    // Call initAudio


  this.initAudio = async function(interaction) {
    // init voice connection
    let connection = getVoiceConnection(`${this.guildId}`);
    if(!connection) {
      connection = joinVoiceChannel({
        channelId: `${DEBUG ? DEBUG_CHANNEL : interaction.member.voice.channel.id}`,
        guildId: `${this.guildId}`,
        adapterCreator: interaction.member.guild.voiceAdapterCreator
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
      console.log(`Guild ${this.guildId} - audio player initialized in idle state to channel ${interaction.channelId}`);
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
      channelId: interaction.channelId,
      channelName: interaction.channel.name,
    }

    player.on(AudioPlayerStatus.Idle, () => {
      this.playNext();
    });
  }


  // Add song data (name and youtube id) to guild's queue
  this.addSong = async function(songName, youtubeId) {
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
  this.playNext = function() {
    if(!this.audio.player) {
      throw Error(`addSong error: player not initialized for guild ${this.guildId}`);
    }

    const song = this.audio.queue.shift();
    if(!song) {
      this.cleanupAudio();
      return
    }

    this.audio.source.source = yt.download(song.youtubeId);
    this.audio.source.audioResource = createAudioResource(this.audio.source.source);
    this.audio.player.play(this.audio.source.audioResource);
    console.log(`Guild ${this.guildId} - playing ${song.songName}`);
  }


  // Helper function to clean up guild resources.
  this.cleanupAudio = function() {
    console.log(`Guild ${this.guildId} cleanup`);
    this.audio = null;
    try {
      let channel = getVoiceConnection(this.guildId);
      if(channel) channel.destroy();
    } catch(err) {
      console.log(`Cleanup error for guild ${this.guildId} - ${err}`)
    }
  }
}

exports.guildList = [];