const { SlashCommandBuilder } = require('discord.js');
const { guildList } = require('../state');

async function execute(interaction) {
  await interaction.reply({ content: "Stopping and clearing queue..." });
  guildList.cleanup(interaction.member.guild.id);
  await interaction.editReply(`Queue cleared`);
}

const command = new SlashCommandBuilder()
  .setName('stop-yt')
  .setDescription('Stop music player')

module.exports = { data: command, execute };