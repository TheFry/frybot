const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { guildList } = require('../helpers/state');
const yt = require('../helpers/youtube');

const YT_TOKEN = process.env['YT_TOKEN'];
const MAX_BTN_TEXT = 80;

async function getSelection(interaction) {
  const q = interaction.options.getString('query');
  let searchData = null;
  try {
    searchData = await yt.search(q, 5, YT_TOKEN);
    if(searchData === null) {
      await interaction.editReply('Failed to query youtube');
      throw err('Failed to query youtube');
    }
  } catch(err) {
    throw err;
  }

  const buttons = [];

  searchData.forEach(result => {
    let label = result.name.length > MAX_BTN_TEXT ? `${result.name.slice(0, MAX_BTN_TEXT - 4)} ...` : result.name;
    console.log(label.length);
    buttons.push(new ButtonBuilder()
      .setCustomId(`${result.id}`)
      .setLabel(`${label}`)
      .setStyle(ButtonStyle.Primary)
    )
  })

  const buttonRow = new ActionRowBuilder().addComponents(...buttons);
  const message = await interaction.editReply({content: 'Pick a song', components: [buttonRow], fetchReply: true});
  let choice = null;
  try {
    choice = await message.awaitMessageComponent({ time: 30_000, componentType: ComponentType.Button });
  } catch(err) {
    interaction.editReply({ content: 'Timeout waiting for input', components: [] })
    return [null, null];
  }
  return [choice.customId, choice.component.label]
}

async function execute(interaction) {
  const q = interaction.options.getString('query');
  await interaction.reply({ content: `Searcing youtube for ${q}` });
  const channelId = interaction.member.voice.channel.id;
  const channelName = interaction.member.voice.channel.name;
  const guildId = interaction.member.guild.id;

  let [songId, songName] = await getSelection(interaction);

  if(!songId || !songName) return null;
  try {
    if(!guildList.activeGuilds[`${guildId}`]) {
      console.log('Have to init guild');
      await guildList.initGuild(guildId, channelId, interaction);
    }
    guildList.addSong(guildId, songName, songId);
    console.log(guildList.activeGuilds[`${guildId}`].queue);
  } catch(err) {
    throw err;
  }
  
  interaction.editReply({content: `Added ${songName} to queue`, components: []})
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