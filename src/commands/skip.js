const { SlashCommandBuilder } = require('discord.js');
const { guildList } = require('../helpers/guild');

const DEBUG = process.env['DEBUG'] === "1" ? true : false;
async function execute(interaction) {
  const guild = guildList[`${interaction.member.guild.id}`];

  if(guild && guild.audio && guild.audio.queue.length !== 0) {
    await interaction.reply({ content: `Skipping to => ${guild.audio.queue[0].songName}` });
    await guild.playNext();
    return;
  } else {
    await interaction.reply({ content: `Queue is empty` });
    if(guild) await guild.cleanupAudio();
    return;
  }
}

const command = new SlashCommandBuilder()
  .setName(`${DEBUG ? 'dev-skip-yt' : 'skip-yt'}`)
  .setDescription('Skip to the next track')

module.exports = { data: command, execute };