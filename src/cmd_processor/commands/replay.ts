import { ChatInputCommandInteraction, GuildMember, SlashCommandBuilder } from 'discord.js';
import { redisClient } from '../../helpers/redis';
import { ChannelEvent, CHANNEL_EVENT_KEY } from '../../helpers/common';

const DEBUG = process.env['DEBUG'] === "1" ? true : false;
async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.reply('Replaying...');
  const member = interaction.member as GuildMember;
  if(!member.voice.channelId) {
    interaction.editReply(`You need to be in a voice channel to run this command`);
    return;
  }

  await redisClient?.publish(CHANNEL_EVENT_KEY, JSON.stringify({
    type: 'replay',
    channelId: member.voice.channelId,
    interactionId: interaction.id
  } as ChannelEvent));
}

const command = new SlashCommandBuilder()
  .setName(`${DEBUG ? 'dev-replay' : 'replay'}`)
  .setDescription('Replay the current song after it ends, or if no song is playing, play the last played song.')

module.exports = { data: command, execute };