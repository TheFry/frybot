import { ChatInputCommandInteraction, GuildMember, SlashCommandBuilder } from 'discord.js';
import { redisClient } from '../../helpers/redis';
import { CHANNEL_EVENT_KEY, ChannelEvent } from '../../helpers/common';

const DEBUG = process.env['DEBUG'] === "1" ? true : false

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  let member = interaction.member as GuildMember;
  await interaction.reply(`Clearing the queue`);
  if(!member.voice.channelId) {
    interaction.editReply(`You need to be in a voice channel to run this command`);
    return;
  }
  
  await redisClient?.publish(CHANNEL_EVENT_KEY, JSON.stringify({
    type: 'stop',
    channelId: member.voice.channelId,
    interactionId: interaction.id
  } as ChannelEvent));
}

const command = new SlashCommandBuilder()
  .setName(`${DEBUG ? 'dev-stop' : 'stop'}`)
  .setDescription('Stop music player')

module.exports = { data: command, execute };