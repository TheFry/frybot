const { SlashCommandBuilder } = require('discord.js');
const { guildList } = require('../helpers/guild');

const DEBUG = process.env['DEBUG'] === "1" ? true : false;
async function execute(interaction) {
  const guild = guildList[`${interaction.member.guild.id}`]
  await interaction.reply({ content: "Stopping and clearing queue..." });
  if(guild) guild.cleanupAudio();
  await interaction.editReply(`Queue cleared`);
}

const command = new SlashCommandBuilder()
  .setName(`${DEBUG ? 'dev-stop' : 'stop'}`)
  .setDescription('Stop music player')

module.exports = { data: command, execute };