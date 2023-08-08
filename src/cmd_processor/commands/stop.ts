import { ChatInputCommandInteraction, GuildMember, SlashCommandBuilder } from 'discord.js';

const DEBUG = process.env['DEBUG'] === "1" ? true : false;
async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.reply('Not implemented yet');
  // const member = interaction.member as GuildMember;
  // const guild = guildList[member.guild.id]
  // await interaction.reply({ content: "Stopping and clearing queue..." });
  // if(guild) guild.cleanupAudio();
  // await interaction.editReply(`Queue cleared`);
}

const command = new SlashCommandBuilder()
  .setName(`${DEBUG ? 'dev-stop' : 'stop'}`)
  .setDescription('Stop music player')

module.exports = { data: command, execute };