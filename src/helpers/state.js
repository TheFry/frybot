const yt = require('./youtube');
const { createAudioPlayer, 
        createAudioResource,
        NoSubscriberBehavior,
        AudioPlayerStatus,
        getVoiceConnection,
        joinVoiceChannel,
        VoiceConnectionStatus, 
        entersState} = require('@discordjs/voice');

        
const GuildQueues = function() {
  // Queue data. Designed to work with multiple guilds
  // Each player's key should be a string of guildID
  // Note that discordjs voice connections are not stored.
  // The library handles that for us.
  // youtubeId and song name persist to storage if enabled (not implemented yet)
  this.activeGuilds = {
    _default: {
      player: null,
      resource: null,
      source: null,
      idle: null,
      queue: [
        {
          songName: '',
          youtubeId: '',
        }
      ],
      channelId: ''
    }
  }


  // add an entry in activeGuilds with guildId as the key
  // Follows same format of _default
  this.initGuild = async function(guildId, channelId, interaction) {
    // init voice connection
    let connection = null;
    try {
      connection = getVoiceConnection(`${guildId}`);
      if(!connection) {
        connection = joinVoiceChannel({
          channelId: `${channelId}`,
          guildId: `${guildId}`,
          adapterCreator: interaction.member.guild.voiceAdapterCreator
        });
        await entersState(connection, VoiceConnectionStatus.Ready, 5000);
      }
    } catch(err) {
      throw err;
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
      console.log(`Guild ${guildId} - audio player initialized in idle state to channel ${channelId}`);
    } catch(err) {
      connection.destroy();
      if(player) player.stop();
      throw err;
    }

    // Note: we don't keep track of voice connection
    // discord.js does this for us with getVoiceConnection
    this.activeGuilds[`${guildId}`] = {
      player: player,
      resource: null,
      source: null,
      idle: true,
      queue: [],
      channelId: channelId,
    }

    player.on(AudioPlayerStatus.Idle, () => {
      this.playNext(guildId);
    });
  }


  // Add song data (name and youtube id) to guild's queue
  this.addSong = async function(guildId, songName, youtubeId) {
    if(!guildId || !songName || !youtubeId) {
      throw Error(`addSong error: missing input
        guild: ${guildId}
        song: ${songName}
        songId: ${youtubeId}
      `);
    } else if(!this.activeGuilds[guildId]) {
      throw Error(`addSong error: player not initialized for guild ${guildId}`);
    }

    this.activeGuilds[guildId].queue.push({
      songName: songName,
      youtubeId: youtubeId
    });

    // If we just added to the queue and nothing is playing, start something.
    if(!this.activeGuilds[guildId].player.checkPlayable()) {
      this.playNext(guildId);
    }
  }


  // Called when player enters the idle state.
  // If the queue isn't empty, play the next song.
  // Otherwise, clean up all resources associated with guild.
  this.playNext = function(guildId) {
    const guild = this.activeGuilds[guildId];
    if(!guild || !guild.player) {
      throw Error(`addSong error: player not initialized for guild ${guildId}`);
    }

    const song = guild.queue.shift();
    if(!song) {
      this.cleanup(guildId);
      return
    }

    try {
      guild.source = yt.download(song.youtubeId);
      guild.resource = createAudioResource(guild.source);
      guild.player.play(guild.resource);
      console.log(`Guild ${guildId} - playing ${song.songName}`);
    } catch(err) {
      throw err;
    }
  }


  // Helper function to clean up guild resources.
  this.cleanup = function(guildId) {
    console.log(`Guild ${guildId} cleanup`);
    const guild = this.activeGuilds[guildId];
    try {
      if(guild) {
        if(guild.player) {
          guild.player.stop();
        }
        guild.player = null;
        guild.resource = null;
        guild.source = null;
        let channel = getVoiceConnection(guildId);
        if(channel) channel.destroy();
        delete this.activeGuilds[guildId]
      }
    } catch(err) {
      console.log(`Cleanup error for guild ${guildId} - ${err}`)
    }
  }
}

exports.guildList = new GuildQueues();