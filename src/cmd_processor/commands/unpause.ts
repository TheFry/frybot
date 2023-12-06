import { ChatInputCommandInteraction, GuildMember, SlashCommandBuilder } from 'discord.js';
import { redisClient } from '../../helpers/redis';
import { ChannelEvent, CHANNEL_EVENT_KEY } from '../../helpers/common';

const DEBUG = process.env['DEBUG'] === "1" ? true : false;
async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.reply('Unpausing queue');
  const member = interaction.member as GuildMember;
  if(!member.voice.channelId) {
    interaction.editReply(`You need to be in a voice channel to run this command`);
    return;
  }

  await redisClient?.publish(CHANNEL_EVENT_KEY, JSON.stringify({
    type: 'unpause',
    channelId: member.voice.channelId,
    interactionId: interaction.id
  } as ChannelEvent));
}

const command = new SlashCommandBuilder()
  .setName(`${DEBUG ? 'dev-unpause' : 'unpause'}`)
  .setDescription('Unpause the queue')

module.exports = { data: command, execute };