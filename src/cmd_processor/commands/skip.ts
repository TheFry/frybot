import { ChatInputCommandInteraction, GuildMember, SlashCommandBuilder } from 'discord.js';
import { redisClient } from '../../helpers/redis';
import { ChannelEvent, CHANNEL_EVENT_KEY, ChannelEventType } from '../../helpers/common';

const DEBUG = process.env['DEBUG'] === "1" ? true : false;
async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.reply('Skipping Song');
  const member = interaction.member as GuildMember;
  if(!member.voice.channelId) {
    interaction.editReply(`You need to be in a voice channel to run this command`);
  }

  await redisClient?.publish(CHANNEL_EVENT_KEY, JSON.stringify({
    type: ChannelEventType.Skip,
    channelId: member.voice.channelId,
    interactionId: interaction.id
  } as ChannelEvent));
}

const command = new SlashCommandBuilder()
  .setName(`${DEBUG ? 'dev-skip' : 'skip'}`)
  .setDescription('Skip to the next track')

module.exports = { data: command, execute };