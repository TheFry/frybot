const { SlashCommandBuilder } = require('discord.js');
const {  getVoiceConnection } = require('@discordjs/voice');
const { activePlayer } = require('../state');

async function execute(interaction) {
  await interaction.reply({ content: "Stopping...", ephemeral: true });
  const conn = getVoiceConnection(interaction.member.guild.id);
  if(conn) conn.destroy();
  if(activePlayer.player) {
    activePlayer.player.stop();
    activePlayer.player = null;
    activePlayer.resource = null;
    activePlayer.source = null;
  }
  await interaction.editReply(`Audio Stopped`);
}

const command = new SlashCommandBuilder()
  .setName('stop-yt')
  .setDescription('Stop music player')

module.exports = { data: command, execute };