const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { Guild, guildList } = require('../helpers/guild');
const yt = require('../helpers/youtube');

const YT_TOKEN = process.env['YT_TOKEN'];
const MAX_BTN_TEXT = 80;
const DEBUG = process.env['DEBUG'] === "1" ? true : false

async function getSelection(interaction) {
  const guildId = interaction.member.guild.id;
  const q = interaction.options.getString('query');
  const searchData = await yt.search(q, 5, YT_TOKEN);
  if(searchData === null) {
    await interaction.editReply('Failed to query youtube');
    guildList[`${guildId}`].setIdleTimeout();
    return [null, null];
  }

  const rows = [];

  searchData.forEach(result => {
    let label = result.name.length > MAX_BTN_TEXT ? `${result.name.slice(0, MAX_BTN_TEXT - 4)} ...` : result.name;
    rows.push(new ActionRowBuilder().addComponents(
      [ new ButtonBuilder()
        .setCustomId(`${result.id}`)
        .setLabel(`${label}`)
        .setStyle(ButtonStyle.Primary) 
      ]
    ))
  })

  // const buttonRow = new ActionRowBuilder().addComponents(...buttons);
  const message = await interaction.editReply({content: 'Pick a song', components: rows, fetchReply: true});
  let choice = null;
  try {
    choice = await message.awaitMessageComponent({ time: 30_000, componentType: ComponentType.Button });
  } catch(err) {
    interaction.editReply({ content: 'Timeout waiting for input', components: [] })
    guildList[`${guildId}`].setIdleTimeout();
    return [null, null];
  }
  return [choice.customId, choice.component.label]
}

async function execute(interaction) {
  const guildId = interaction.member.guild.id;
  if(!guildList[`${guildId}`]) {
    guildList[`${guildId}`] = new Guild(guildId);
  } else if(guildList[`${guildId}`].idleTimeout !== null) {
    console.log(`Clearing idle timeout for guild ${guildId}`)
    clearTimeout(guildList[`${guildId}`].idleTimeout)
  }
  const q = interaction.options.getString('query');
  await interaction.reply({ content: `Searcing youtube for ${q}` });

  let [songId, songName] = await getSelection(interaction);
  if(!songId || !songName) return null;
  if(!guildList[`${guildId}`].audio) {
    await guildList[`${guildId}`].initAudio(interaction);
    console.log('done audio')
  } 

  guildList[`${guildId}`].addSong(songName, songId);  
  interaction.editReply({content: `Added ${songName} to queue`, components: []})
}

const command = new SlashCommandBuilder()
  .setName(`${DEBUG ? 'dev-play' : 'play'}`)
  .setDescription('Play a song')
  .addStringOption(option => 
    option.setName('query')
      .setDescription('The song to search for')
      .setRequired(true)
  )

module.exports = { data: command, execute };