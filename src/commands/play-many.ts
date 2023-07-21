import { ActionRowBuilder, ButtonInteraction, ChatInputCommandInteraction, GuildMember, ModalBuilder, ModalData, ModalMessageModalSubmitInteraction, ModalSubmitInteraction, SlashCommandBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import { Guild } from '../helpers/guild';
import { guildList } from "../helpers/guild";
import { randomBytes } from "crypto";
import * as yt from '../helpers/youtube';

const DEBUG = process.env["DEBUG"] === "1" ? true : false;
const YT_TOKEN = process.env['YT_TOKEN'] as string;

async function getModalData(interaction: ChatInputCommandInteraction): Promise<string> {
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
    console.log(err);
    return '';
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
  return links.map(link => new URL(link).searchParams.get('v')).join(',');
}


async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const member = interaction.member as GuildMember;
  let guild = guildList[member.guild.id];
  if(!guild) {
    guild = new Guild(member.guild.id);
    guildList[member.guild.id] = guild;
  } else if(guild.checkTimeout()) {
    guild.setIdleTimeout(0);
  }

  if(!guild.checkInitAudio()) {
    let member = interaction.member as GuildMember;
    await guild.initAudio(member);
  } 

  let ids = (await getModalData(interaction));
  if(ids === '') return;
  let videos = await yt.list(ids, YT_TOKEN);
  for(let video of Object.values(videos)) {
    await guild?.addSong(video.name, video.id);
  }
}

const command = new SlashCommandBuilder()
  .setName(`${DEBUG ? 'dev-play-many' : 'play-many'}`)
  .setDescription('Play audio from a list of youtube links')

module.exports = { data: command, execute };
