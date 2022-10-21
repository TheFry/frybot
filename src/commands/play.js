const { SlashCommandBuilder } = require('discord.js');
const { activePlayer } = require('../state');
const yt = require('../youtube');
const {  VoiceConnectionStatus, 
         AudioPlayerStatus,
         joinVoiceChannel,
         createAudioPlayer,
         createAudioResource,
         NoSubscriberBehavior } = require('@discordjs/voice');

const YT_TOKEN = process.env['YT_TOKEN'];

async function playAudio(interaction, source) {
  const channelId = interaction.member.voice.channel.id;
  const channelName = interaction.member.voice.channel.name;
  const guildId = interaction.member.guild.id;

  const connection = joinVoiceChannel({
    channelId: `${channelId}`,
    guildId: `${guildId}`,
    adapterCreator: interaction.member.guild.voiceAdapterCreator
  });

  if(activePlayer.player) {
    return null;
  }

  activePlayer.player = createAudioPlayer({
    behaviors: {
      noSubscriber: NoSubscriberBehavior.Pause,
    },
  });
  activePlayer.source = source;
  activePlayer.resource = createAudioResource(source);
  
  connection.on(VoiceConnectionStatus.Ready, () => {
    console.log('Connection is in the Ready state!');
    activePlayer.player.play(activePlayer.resource);
    connection.subscribe(activePlayer.player);
  });

  connection.on(AudioPlayerStatus.Idle, () => {
    console.log('Done playing audio');
    activePlayer.player.stop();
    activePlayer.player = null;
    activePlayer.resource = null;
    activePlayer.source = null;
    connection.destroy();
  })
}

async function execute(interaction) {
  await interaction.reply({ content: "loading", ephemeral: true });
  const q = interaction.options.getString('query');
  let searchData = await yt.search(q, 5, YT_TOKEN);
  let songData = await(yt.download(searchData[0].id));
  if(songData === null) {
    await interaction.editReply('Failed to load youtube audio');
    throw err('Failed to load youtube audio')
  }
  try{
    await playAudio(interaction, songData);
  } catch(err) {
    throw err;
  }
  await interaction.editReply(`Playing ${searchData[0].name}`);
}

const command = new SlashCommandBuilder()
  .setName('play-yt')
  .setDescription('Play a song')
  .addStringOption(option => 
    option.setName('query')
      .setDescription('The song to search for')
      .setRequired(true)
  )

module.exports = { data: command, execute };