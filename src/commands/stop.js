const { SlashCommandBuilder } = require('discord.js');
const { guildList } = require('../helpers/guild');

const DEBUG = process.env['DEBUG'] === "1" ? true : false;
async function execute(interaction) {
  await interaction.reply({ content: "Stopping and clearing queue..." });
  guildList[`${interaction.member.guild.id}`].cleanupAudio();
  await interaction.editReply(`Queue cleared`);
}

const command = new SlashCommandBuilder()
  .setName(`${DEBUG ? 'dev-stop-yt' : 'stop-yt'}`)
  .setDescription('Stop music player')

module.exports = { data: command, execute };