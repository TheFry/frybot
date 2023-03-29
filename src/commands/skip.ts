import { ChatInputCommandInteraction, GuildMember, SlashCommandBuilder } from 'discord.js';
import { guildList } from '../helpers/guild';

const DEBUG = process.env['DEBUG'] === "1" ? true : false;
async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const member = interaction.member as GuildMember;
  const guild = guildList[`${member.guild.id}`];

  if(guild && guild.checkInitAudio() && guild.audio.queue.length !== 0) {
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
  .setName(`${DEBUG ? 'dev-skip' : 'skip'}`)
  .setDescription('Skip to the next track')

module.exports = { data: command, execute };