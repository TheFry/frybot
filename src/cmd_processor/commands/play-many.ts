import { ActionRowBuilder, 
  ChatInputCommandInteraction,
  GuildMember,
  ModalBuilder,
  ModalMessageModalSubmitInteraction,
  ModalSubmitInteraction,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle } from "discord.js";
  
import { randomBytes } from "crypto";
import * as yt from '../../helpers/youtube';
import { redisClient } from "../../helpers/redis";
import { addSong } from "../../helpers/playlist";
import { FREE_CHANNELS_KEY, WATCHED_CHANNELS_KEY } from "../../helpers/common";
import { LogType, logConsole } from "../../helpers/logger";

const DEBUG = process.env["DEBUG"] === "1" ? true : false;
const YT_TOKEN = process.env['YT_TOKEN'] as string;

async function getModalData(interaction: ChatInputCommandInteraction): Promise<[string [], ModalMessageModalSubmitInteraction | null]> {
  const modalId = await randomBytes(16).toString('hex');
  const linksId = await randomBytes(16).toString('hex');

  let modal = new ModalBuilder()
    .setTitle('Play Multiple Songs')
    .setCustomId(modalId);
  
  let linkInput = new TextInputBuilder()
    .setLabel('Youtube Links (One per line)')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setCustomId(linksId)

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(linkInput)
  )
  
  let modalFilter = (interaction: ModalSubmitInteraction) => interaction.customId === modalId; 
  let submission: ModalMessageModalSubmitInteraction;
  await interaction.showModal(modal);
  try {
    submission = await interaction.awaitModalSubmit({ time: 600_000, filter: modalFilter }) as ModalMessageModalSubmitInteraction;
  } catch(err) {
    logConsole({ msg: `${err}`, type: LogType.Error });
    return [[], null];
  }
  
  await submission.reply('Verifying Links...');
  let badLinks: Array<string> = [];
  let links = submission.fields.getTextInputValue(linksId).split('\n').filter(link => {
    let url: URL | null = null;
    try {
      url = new URL(link);
    } catch { };

    if(url && url.hostname === 'www.youtube.com' && url.pathname === '/watch' && url.searchParams.get('v')) return true;
    badLinks.push(link);
    return false;
  })

  let reply: string;
  if(badLinks.length !== 0 && links.length > 0) {
    reply = (`Invalid Links: \n${badLinks.join('\n')}\nAdding all other songs...`);
  } else if(links.length === 0) {
    reply = 'No valid links provided';
  } else {
    reply = 'Adding songs...'
  }

  await submission.editReply(reply);
  return [links.map(link => new URL(link).searchParams.get('v')) as string [], submission];
}


async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const member = interaction.member as GuildMember;
  const channelId = member.voice.channelId;
  
  if(!channelId) {
    await interaction.editReply('You must be in a voice channel to play music!');
    return;
  }

  let ids = (await getModalData(interaction));
  if(ids[0].length === 0) return;

  // Throw the guildId in redis with the channel id as a key
  // Voicebots use this rather than querying discord for it
  await redisClient?.setnx(`discord:channel:${channelId}:guild-id`, member.guild.id);
  await redisClient?.checkIfWatched(WATCHED_CHANNELS_KEY, FREE_CHANNELS_KEY, channelId);
  let videos = (await yt.list(ids[0], 'video', YT_TOKEN)).map(vid => ({ youtubeVideoId: vid.id, youtubeVideoTitle: vid.name, interactionId: interaction.id }));
  
  try {
    await addSong(channelId, videos);
  } catch(err) {
    logConsole({ msg: `play-many error channel ${channelId} - ${err}`, type: LogType.Error });
    if(ids[1]) {
      ids[1].editReply('Error adding songs');
    }
    return;
  }
}

const command = new SlashCommandBuilder()
  .setName(`${DEBUG ? 'dev-play-many' : 'play-many'}`)
  .setDescription('Play audio from a list of youtube links')

module.exports = { data: command, execute };
