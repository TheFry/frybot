const { SlashCommandBuilder } = require('discord.js');
const { guildList } = require('../helpers/state');
const yt = require('../helpers/youtube');

const YT_TOKEN = process.env['YT_TOKEN'];

async function execute(interaction) {
  const q = interaction.options.getString('query');
  await interaction.reply({ content: `Searcing youtube for ${q}`});
  const channelId = interaction.member.voice.channel.id;
  const channelName = interaction.member.voice.channel.name;
  const guildId = interaction.member.guild.id;
  let searchData = null;

  try {
    searchData = await yt.search(q, 5, YT_TOKEN);
    if(searchData === null) {
      await interaction.editReply('Failed to query youtube');
      throw err('Failed to load youtube audio');
    }
    if(!guildList.activeGuilds[`${guildId}`]) {
      console.log('Have to init guild');
      await guildList.initGuild(guildId, channelId, interaction);
    }
    guildList.addSong(guildId, searchData[0].name, searchData[0].id);
    console.log(guildList.activeGuilds[`${guildId}`].queue);
  } catch(err) {
    throw err;
  }
  await interaction.editReply(`Added ${searchData[0].name} to queue`);
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